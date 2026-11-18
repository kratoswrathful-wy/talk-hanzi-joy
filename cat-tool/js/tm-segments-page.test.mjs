import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const dbPath = resolve(process.cwd(), "cat-tool/db.js");
const dbSource = readFileSync(dbPath, "utf8");

function loadPager() {
  const start = dbSource.indexOf("function pageTmSegmentRows(");
  const end = dbSource.indexOf("function sortSegmentsByImportOrder(", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${dbSource.slice(start, end)}\nthis.pageTmSegmentRows = pageTmSegmentRows;\nthis.createTmSegmentSnapshotStore = createTmSegmentSnapshotStore;`, context);
  return context;
}

describe("離線翻譯記憶分頁", () => {
  const loaded = loadPager();
  const pageTmSegmentRows = loaded.pageTmSegmentRows;
  const createTmSegmentSnapshotStore = loaded.createTmSegmentSnapshotStore;

  it("單機 DBService 在團隊覆寫之前就有分頁與計數", () => {
    const offline = dbSource.slice(0, dbSource.indexOf("function enableTeamCloudProvider("));
    expect(offline).toContain("async getTMSegmentsPage(tmId, offsetOrOpts = 0, limit = 1000)");
    expect(offline).toContain("async beginTmSegmentSnapshot(tmId)");
    expect(offline).toContain("async countTMSegments(tmId)");
    expect(offline).toContain("return pageTmSegmentRows(rows, offsetOrOpts, limit);");
    const team = dbSource.slice(dbSource.indexOf("function enableTeamCloudProvider("));
    expect(team).toContain("DBService.beginTmSegmentSnapshot = async () =>");
  });

  it("依 id 遞增分頁，並用最後一筆 id 當下一頁游標", () => {
    const rows = [
      { id: 3, sourceText: "c" },
      { id: 1, sourceText: "a" },
      { id: 2, sourceText: "b" },
      { id: 4, sourceText: "d" },
    ];
    const first = pageTmSegmentRows(rows, { afterId: null, limit: 2 });
    expect(first.segments.map((row) => row.id)).toEqual([1, 2]);
    expect(first.nextCursor).toBe(2);
    const second = pageTmSegmentRows(rows, { afterId: first.nextCursor, limit: 2 });
    expect(second.segments.map((row) => row.id)).toEqual([3, 4]);
    expect(second.nextCursor).toBe(null);
  });

  it("沒有剩餘資料時不給游標", () => {
    const only = pageTmSegmentRows([{ id: 7, sourceText: "only" }], { limit: 1000 });
    expect(only.segments).toHaveLength(1);
    expect(only.nextCursor).toBe(null);
  });

  it("超過兩頁時只讀一次來源，分頁不再整庫重讀", () => {
    const store = createTmSegmentSnapshotStore();
    const rows = Array.from({ length: 2001 }, (_, index) => ({ id: index + 1, sourceText: `s${index + 1}` }));
    store.begin("tm-a", rows);
    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = store.page("tm-a", { afterId: cursor, limit: 1000 });
      expect(page.sourceReads).toBe(1);
      seen.push(...page.segments.map((row) => row.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor != null);
    expect(pages).toBe(3);
    expect(seen).toEqual(rows.map((row) => row.id));
    expect(store.stats("tm-a").sourceReads).toBe(1);
    expect(store.page("tm-b", { limit: 1000 })).toBe(null);
    store.end("tm-a");
    expect(store.page("tm-a", { limit: 1000 })).toBe(null);
    store.begin("tm-a", rows.concat([{ id: 2002, sourceText: "added" }]));
    const refreshed = store.page("tm-a", { afterId: 2001, limit: 1000 });
    expect(refreshed.segments.map((row) => row.id)).toEqual([2002]);
    expect(refreshed.nextCursor).toBe(null);
    store.invalidate("tm-a");
    expect(store.stats("tm-a").active).toBe(false);
  });

  it("空記憶庫的快照分頁是空的", () => {
    const store = createTmSegmentSnapshotStore();
    store.begin("empty", []);
    const page = store.page("empty", { limit: 1000 });
    expect(page.segments).toEqual([]);
    expect(page.nextCursor).toBe(null);
    expect(page.sourceReads).toBe(1);
  });

  it("晚到的舊讀取不能在作廢或結束之後裝回，舊的結束也不能清掉新的載入", () => {
    const store = createTmSegmentSnapshotStore();
    const expired = store.issue("tm-a");
    store.invalidate();
    expect(store.begin("tm-a", [{ id: 1, sourceText: "old" }], expired)).toBe(false);
    expect(store.stats("tm-a").active).toBe(false);

    const ended = store.issue("tm-a");
    store.end("tm-a");
    expect(store.begin("tm-a", [{ id: 1, sourceText: "old" }], ended)).toBe(false);
    expect(store.stats("tm-a").active).toBe(false);

    const older = store.issue("tm-a");
    const newer = store.issue("tm-a");
    expect(store.begin("tm-a", [{ id: 2, sourceText: "new" }], newer)).toBe(true);
    store.end("tm-a", older);
    expect(store.stats("tm-a").active).toBe(true);
    expect(store.page("tm-a", { limit: 10 }).segments.map((row) => row.sourceText)).toEqual(["new"]);
    store.end("tm-a", newer);
    expect(store.stats("tm-a").active).toBe(false);
  });
});

function loadSnapshotService(initial) {
  const helpers = dbSource.slice(dbSource.indexOf("function pageTmSegmentRows("), dbSource.indexOf("/** 匯入掃描排序"));
  const methods = dbSource.slice(dbSource.indexOf("    async getTMSegments(tmId)"), dbSource.indexOf("    // ---- TB (Termbase) ----"));
  let rows = initial.map((row) => ({ ...row }));
  const stats = { reads: 0 };
  let holdNext = false;
  let releasePending = null;
  const db = {
    tmSegments: {
      where: () => ({
        equals: (tmId) => ({
          toArray: () => {
            const captured = rows.filter((row) => row.tmId === tmId).map((row) => ({ ...row }));
            stats.reads += 1;
            if (holdNext) {
              holdNext = false;
              return new Promise((resolve) => {
                releasePending = () => resolve(captured);
              });
            }
            return Promise.resolve(captured);
          },
        }),
      }),
      update: async (id, patch) => {
        const row = rows.find((item) => item.id === id);
        Object.assign(row, patch);
      },
    },
  };
  const context = vm.createContext({ db });
  vm.runInContext(`${helpers}\nthis.service = {${methods}};\nthis.snapshotStats = (id) => tmSegmentSnapshotStore.stats(id);`, context);
  return {
    service: context.service,
    stats,
    hold: () => { holdNext = true; },
    release: () => releasePending(),
    snapshotStats: context.snapshotStats,
    database: () => rows.map((row) => ({ ...row })),
  };
}

describe("單機記憶載入的失敗與晚到讀取", () => {
  it("讀取途中內容更新後，舊讀取不能再提供舊頁", async () => {
    const pending = loadSnapshotService([{ id: 1, tmId: 1, targetText: "old" }]);
    pending.hold();
    const starting = pending.service.beginTmSegmentSnapshot(1);
    await pending.service.updateTMSegment(1, "new");
    pending.release();
    const started = await starting;
    const page = await pending.service.getTMSegmentsPage(1, { limit: 1000 });
    expect(started.stale).toBe(true);
    expect(started.active).toBe(false);
    expect(pending.snapshotStats(1).active).toBe(false);
    expect(pending.database()[0].targetText).toBe("new");
    expect(page.segments[0].targetText).toBe("new");
    expect(page.sourceReads).toBeUndefined();
  });

  it("結束發生在讀取回來之前時，舊讀取不能重新成為有效快照", async () => {
    const pending = loadSnapshotService([{ id: 1, tmId: 1, targetText: "old" }]);
    pending.hold();
    const starting = pending.service.beginTmSegmentSnapshot(1);
    pending.service.endTmSegmentSnapshot(1);
    expect(pending.snapshotStats(1).active).toBe(false);
    pending.release();
    const started = await starting;
    expect(started.stale).toBe(true);
    expect(pending.snapshotStats(1).active).toBe(false);
  });

  it("第一次讀取失敗會進入既有的錯誤與重試，重試不會重複加入前一次的部分結果", async () => {
    const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");
    const start = app.indexOf("    async function loadProjectTmCacheInBackground(");
    const end = app.indexOf("    async function openProjectDetail(", start);
    const uiStart = app.indexOf("    function _updateTmLoadStatusUi(");
    const uiEnd = app.indexOf("    function _uniqueTmIdsInOrder(", uiStart);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);

    const rejected = [];
    const listener = (error) => rejected.push(String(error && error.message ? error.message : error));
    process.on("unhandledRejection", listener);
    try {
      const elements = {
        tmLoadStatus: { style: { display: "" } },
        tmLoadStatusText: { textContent: "" },
        tmLoadStatusDetail: { textContent: "" },
        tmLoadRetryBtn: { style: { display: "" }, addEventListener() {} },
      };
      const document = { getElementById: (id) => elements[id] || null };
      const window = {
        ActiveTmCache: [{ id: 9, sourceText: "kept" }],
        _activeTmNames: { 1: "synthetic TM" },
        _activeTmCacheReadyIds: new Set(),
      };
      let pageCalls = 0;
      let beginFails = true;
      const DBService = {
        countTMSegments: async () => 2,
        beginTmSegmentSnapshot: async () => {
          if (beginFails) throw new Error("synthetic local read failure");
          return { active: true, gen: 1, epoch: 0, stale: false, sourceReads: 1, count: 2 };
        },
        endTmSegmentSnapshot: () => {},
        getTMSegmentsPage: async () => {
          pageCalls += 1;
          if (pageCalls === 1) return { segments: [{ id: 1, sourceText: "a" }], nextCursor: 1, sourceReads: 1 };
          if (pageCalls === 2) throw new Error("page failed");
          return {
            segments: [{ id: 1, sourceText: "a" }, { id: 2, sourceText: "b" }],
            nextCursor: null,
            sourceReads: 1,
          };
        },
      };
      const context = vm.createContext({
        window,
        document,
        DBService,
        setTimeout: () => 0,
        _uniqueTmIdsInOrder: () => [1],
      });
      vm.runInContext(`${app.slice(uiStart, uiEnd)}\n${app.slice(start, end)}\nthis.load = loadProjectTmCacheInBackground;`, context);
      await context.load({}, { tmIds: [1] });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(window._tmLoadState.phase).toBe("error");
      expect(window._tmLoadState.lastError).toContain("synthetic local read failure");
      expect(typeof window._tmLoadState.retry).toBe("function");
      expect(rejected).toEqual([]);
      expect(elements.tmLoadRetryBtn.style.display).not.toBe("none");
      expect(elements.tmLoadStatusDetail.textContent).toContain("synthetic local read failure");
      expect(window.ActiveTmCache.map((row) => row.id)).toEqual([9]);

      beginFails = false;
      window._tmLoadState.retry();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(window._tmLoadState.phase).toBe("error");
      expect(window._tmLoadState.lastError).toContain("page failed");
      expect(window.ActiveTmCache.map((row) => row.id)).toEqual([9]);

      window._tmLoadState.retry();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(window._tmLoadState.phase).toBe("done");
      expect(window.ActiveTmCache.map((row) => row.id)).toEqual([9, 1, 2]);
      expect(rejected).toEqual([]);
    } finally {
      process.removeListener("unhandledRejection", listener);
    }
  });
});
