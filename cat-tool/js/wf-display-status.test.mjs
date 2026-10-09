import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("formatWorkflowListCellHtml：審稿欄不得回退翻譯人", () => {
  let formatWorkflowListCellHtml;

  beforeAll(() => {
    const code = fs.readFileSync(path.join(__dirname, "wf-display-status.js"), "utf8");
    const sandbox = vm.createContext({ console });
    sandbox.global = sandbox;
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInContext(code, sandbox);
    formatWorkflowListCellHtml = sandbox.WfDisplayStatus.formatWorkflowListCellHtml;
  });

  const stages = [
    { id: "st-t", stageKind: "translate", stageOrder: 1, status: "active" },
    { id: "st-r", stageKind: "review", stageOrder: 2, status: "active" },
  ];

  it("無 review assignment＋有 fileAssigneeNames → 審稿欄不出現翻譯人名", () => {
    const html = formatWorkflowListCellHtml({
      stages,
      assignments: [],
      fileAssigneeNames: ["翻譯小明"],
      resolveName: (uid) => String(uid || "—"),
    });
    expect(html).toContain("翻譯小明");
    // 翻譯欄可顯示整檔回退人名；審稿欄禁止同一人名
    expect(html).toMatch(/翻譯[\s\S]*翻譯小明（整檔）/);
    expect(html).toContain("⚠ 尚未建立指派");
    const reviewCellMatch = html.match(/>審稿<\/div><div>([\s\S]*?)<\/div><\/div>/);
    expect(reviewCellMatch?.[1]).not.toContain("翻譯小明");
    expect(reviewCellMatch?.[1]).toContain("尚未建立指派");
  });

  it("有 review assignment → 顯示審稿指派人，不受 fileAssigneeNames 影響", () => {
    const html = formatWorkflowListCellHtml({
      stages,
      assignments: [
        {
          id: "a1",
          fileWorkflowStageId: "st-r",
          assigneeUserId: "u-reviewer",
          workflowStatus: "assigned",
        },
      ],
      fileAssigneeNames: ["翻譯小明"],
      resolveName: (uid) => (uid === "u-reviewer" ? "威儀" : String(uid)),
    });
    expect(html).toContain("威儀");
    // 以「審稿」標籤後的格子為準（避免人名含「審稿」時 split 誤切）
    const reviewCellMatch = html.match(/>審稿<\/div><div>([\s\S]*?)<\/div><\/div>/);
    expect(reviewCellMatch?.[1]).toContain("威儀");
    expect(reviewCellMatch?.[1]).not.toContain("翻譯小明");
  });
});

describe("準備狀態判讀：編輯器與清單同源、不把空資料當準備中", () => {
  let Wf;

  beforeAll(() => {
    const code = fs.readFileSync(path.join(__dirname, "wf-display-status.js"), "utf8");
    const sandbox = vm.createContext({ console });
    sandbox.global = sandbox;
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInContext(code, sandbox);
    Wf = sandbox.WfDisplayStatus;
  });

  const prepActive = [
    { id: "p1", stageKind: "prep", status: "active" },
    { id: "t1", stageKind: "translate", status: "pending" },
  ];
  const prepSnake = [
    { id: "p1", stage_kind: "prep", status: "active", file_id: "b1" },
    { id: "t1", stage_kind: "translate", status: "pending", file_id: "b1" },
  ];
  const prepDone = [
    { id: "p1", stageKind: "prep", status: "completed" },
    { id: "t1", stageKind: "translate", status: "active" },
  ];

  it("空階段不是準備中，也不當未完成", () => {
    expect(Wf.isPrepActive([])).toBe(false);
    expect(Wf.isPrepIncomplete([])).toBe(false);
    expect(Wf.isPrepActive(null)).toBe(false);
  });

  it("snake_case 與 camelCase 都看成準備中", () => {
    expect(Wf.isPrepActive(prepActive)).toBe(true);
    expect(Wf.isPrepActive(prepSnake)).toBe(true);
    expect(Wf.isPrepIncomplete(prepSnake)).toBe(true);
  });

  it("已完成檔不是準備中，不可被空快取假裝成準備中", () => {
    expect(Wf.isPrepActive(prepDone)).toBe(false);
    expect(Wf.isPrepIncomplete(prepDone)).toBe(false);
  });

  it("清單格子在 snake_case prep 仍顯示準備中", () => {
    const html = Wf.formatWorkflowListCellHtml({
      stages: prepSnake,
      assignments: [],
      fileAssigneeNames: [],
      resolveName: () => "—",
    });
    expect(html).toContain("準備中");
  });

  it("扁平陣列為空時改讀目前檔的 byFileId，不拿別檔", () => {
    const b1 = prepActive;
    const b2 = prepDone;
    expect(Wf.resolveWorkflowStagesForFile({
      currentFileId: "b1",
      fileStages: [],
      stagesByFileId: { b1, b2 },
    })).toEqual(b1);
    expect(Wf.isPrepActive(Wf.resolveWorkflowStagesForFile({
      currentFileId: "b2",
      fileStages: b1,
      stagesByFileId: { b2 },
    }))).toBe(false);
  });

  it("句段集依句段所屬檔取值，不沿用上一檔扁平快取", () => {
    const fromView = Wf.resolveWorkflowStagesForFile({
      currentFileId: "b1",
      currentViewId: "view-1",
      segmentFileId: "b2",
      fileStages: prepActive,
      stagesByFileId: { b1: prepActive, b2: prepDone },
    });
    expect(Wf.isPrepActive(fromView)).toBe(false);
    expect(fromView).toEqual(prepDone);
  });

  it("normalize 補 stageKind，不捏造 prep", () => {
    const norm = Wf.normalizeWorkflowStages(prepSnake);
    expect(norm[0].stageKind).toBe("prep");
    expect(Wf.normalizeWorkflowStages([])).toEqual([]);
    expect(Wf.normalizeWorkflowStages(null)).toEqual([]);
  });

  it("晚回或換檔的載入結果要丟棄", () => {
    expect(Wf.shouldApplyWorkflowContextLoad({
      loadGen: 1,
      currentGen: 2,
      loadFileId: "b1",
      currentFileId: "b1",
    })).toBe(false);
    expect(Wf.shouldApplyWorkflowContextLoad({
      loadGen: 2,
      currentGen: 2,
      loadFileId: "b1",
      currentFileId: "b2",
    })).toBe(false);
    expect(Wf.shouldApplyWorkflowContextLoad({
      loadGen: 2,
      currentGen: 2,
      loadFileId: "b2",
      currentFileId: "b2",
    })).toBe(true);
    expect(Wf.shouldApplyWorkflowContextLoad({
      loadGen: 1,
      currentGen: 1,
      loadFileId: "",
      currentFileId: "b2",
    })).toBe(false);
  });

  it("準備中進行時，工作階段是翻譯／審稿，不是準備", () => {
    const stages = [
      { id: "p1", stageKind: "prep", status: "active" },
      { id: "t1", stageKind: "translate", status: "pending" },
      { id: "r1", stageKind: "review", status: "pending" },
    ];
    expect(Wf.resolveWorkflowWorkStage(stages, null)?.id).toBe("t1");
    expect(Wf.resolveWorkflowWorkStage(stages, "translate")?.id).toBe("t1");
    expect(Wf.resolveWorkflowWorkStage(stages, "review")?.id).toBe("r1");
    expect(Wf.resolveWorkflowWorkStage(stages, "prep")?.id).toBe("t1");
    expect(Wf.isWorkStageKind("prep")).toBe(false);
  });

  it("空階段沒有工作階段，不當成準備在鎖人", () => {
    expect(Wf.resolveWorkflowWorkStage([], null)).toBeNull();
    expect(Wf.resolveWorkflowWorkStage(null, "translate")).toBeNull();
  });
});
