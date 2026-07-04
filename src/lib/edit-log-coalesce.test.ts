import { describe, it, expect } from "vitest";
import { expireBursts, applyEditLogFieldChange, type BurstMap, type SimplePersistedLog } from "./edit-log-coalesce";

const BURST_MS = 5 * 60 * 1000;

function makeBurstMap(overrides: Partial<BurstMap> = {}): BurstMap {
  return { ...overrides };
}

describe("expireBursts", () => {
  it("未過期的 burst 保留", () => {
    const now = 1_000_000;
    const burstMap = makeBurstMap({
      field1: { anchor: "old", burstStartedAt: now - 1000, logIds: ["l1"] },
    });
    const result = expireBursts(burstMap, now, BURST_MS);
    expect(result).toEqual(burstMap);
  });

  it("剛好落在邊界（now - burstStartedAt === burstMs）：視為未過期，保留", () => {
    const now = 1_000_000;
    const burstMap = makeBurstMap({
      field1: { anchor: "old", burstStartedAt: now - BURST_MS, logIds: ["l1"] },
    });
    const result = expireBursts(burstMap, now, BURST_MS);
    expect(result).toHaveProperty("field1");
  });

  it("超過邊界一毫秒：視為已過期，清除", () => {
    const now = 1_000_000;
    const burstMap = makeBurstMap({
      field1: { anchor: "old", burstStartedAt: now - BURST_MS - 1, logIds: ["l1"] },
    });
    const result = expireBursts(burstMap, now, BURST_MS);
    expect(result).not.toHaveProperty("field1");
  });

  it("多欄位混合：只清除已過期者，保留未過期者", () => {
    const now = 1_000_000;
    const burstMap = makeBurstMap({
      expired: { anchor: "a", burstStartedAt: now - BURST_MS - 1, logIds: ["l1"] },
      fresh: { anchor: "b", burstStartedAt: now - 1000, logIds: ["l2"] },
    });
    const result = expireBursts(burstMap, now, BURST_MS);
    expect(Object.keys(result)).toEqual(["fresh"]);
  });

  it("不變動輸入（immutability）：原 burstMap 不被修改", () => {
    const now = 1_000_000;
    const burstMap = makeBurstMap({
      expired: { anchor: "a", burstStartedAt: now - BURST_MS - 1, logIds: ["l1"] },
    });
    const snapshot = JSON.parse(JSON.stringify(burstMap));
    expireBursts(burstMap, now, BURST_MS);
    expect(burstMap).toEqual(snapshot);
  });
});

const formatTimestamp = (d: Date) => d.toISOString();

describe("applyEditLogFieldChange", () => {
  it("值未變（序列化後相同）：不新增紀錄、burstMap 不變", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "A",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    expect(result).toEqual({ nextLogs: [], nextBurstMap: {}, newLogCount: 0 });
  });

  it("首次變更：新增一筆紀錄並開啟新 burst（以舊值為錨點）", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    expect(result.newLogCount).toBe(1);
    expect(result.nextLogs).toHaveLength(1);
    expect(result.nextLogs[0].description).toBe("標題 A → B");
    expect(result.nextLogs[0].fieldKey).toBe("title");
    expect(result.nextBurstMap.title).toEqual({
      anchor: "A",
      burstStartedAt: 1000,
      logIds: [result.nextLogs[0].id],
    });
  });

  it("同欄位連續變更在視窗內：疊加同一 burst（不重開錨點）", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    const second = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "B",
      newValue: "C",
      now: 1000 + 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: first.nextLogs,
      burstMap: first.nextBurstMap,
    });
    expect(second.newLogCount).toBe(1);
    expect(second.nextLogs).toHaveLength(2);
    // 錨點仍是第一筆變更前的舊值，未被第二次變更重置
    expect(second.nextBurstMap.title.anchor).toBe("A");
    expect(second.nextBurstMap.title.logIds).toHaveLength(2);
  });

  it("在視窗內改回錨點值：撤銷整段 burst 紀錄（同欄位往返視為未變）", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    const backToAnchor = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "B",
      newValue: "A",
      now: 1000 + 2000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: first.nextLogs,
      burstMap: first.nextBurstMap,
    });
    expect(backToAnchor.nextLogs).toEqual([]);
    expect(backToAnchor.newLogCount).toBe(-1);
    expect(backToAnchor.nextBurstMap).not.toHaveProperty("title");
  });

  it("跨視窗（超過 burstMs）：視為新一輪，另起新 burst 且錨點更新為最近舊值", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    const afterWindow = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "B",
      newValue: "C",
      now: 1000 + BURST_MS + 1,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: first.nextLogs,
      burstMap: first.nextBurstMap,
    });
    expect(afterWindow.newLogCount).toBe(1);
    expect(afterWindow.nextLogs).toHaveLength(2);
    // 新一輪 burst 的錨點是這次變更前的舊值（B），而非第一輪的 A
    expect(afterWindow.nextBurstMap.title.anchor).toBe("B");
    expect(afterWindow.nextBurstMap.title.logIds).toHaveLength(1);
  });

  it("不同欄位各自獨立 burst，互不影響", () => {
    const titleChange = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    const statusChange = applyEditLogFieldChange({
      fieldKey: "status",
      oldValue: "draft",
      newValue: "finalized",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "狀態",
      existingLogs: titleChange.nextLogs,
      burstMap: titleChange.nextBurstMap,
    });
    expect(statusChange.nextLogs).toHaveLength(2);
    expect(Object.keys(statusChange.nextBurstMap).sort()).toEqual(["status", "title"]);
  });

  it("邊界值：oldValue/newValue 為 undefined／null 時序列化為空字串比較", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "note",
      oldValue: undefined,
      newValue: null,
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "備註",
      existingLogs: [],
      burstMap: {},
    });
    // 兩者序列化皆為空字串，視為未變更
    expect(result.newLogCount).toBe(0);
  });

  it("邊界值：oldValue 為 0（數字）與 newValue 為 \"\" 視為不同值", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "unitCount",
      oldValue: 0,
      newValue: 5,
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "計費單位數",
      existingLogs: [],
      burstMap: {},
    });
    expect(result.newLogCount).toBe(1);
    expect(result.nextLogs[0].description).toBe("計費單位數 0 → 5");
  });

  it("不變動輸入（immutability）：existingLogs／burstMap 原陣列與物件不被修改", () => {
    const existingLogs: SimplePersistedLog[] = [];
    const burstMap: BurstMap = {};
    applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author: "u1",
      formatTimestamp,
      fieldLabel: "標題",
      existingLogs,
      burstMap,
    });
    expect(existingLogs).toEqual([]);
    expect(burstMap).toEqual({});
  });
});
