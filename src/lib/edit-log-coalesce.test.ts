import { describe, it, expect } from "vitest";
import { expireBursts, applyEditLogFieldChange, EDIT_LOG_BURST_MS, type BurstMap, type SimplePersistedLog } from "./edit-log-coalesce";

const fmt = (d: Date) => d.toISOString();

describe("expireBursts", () => {
  it("未過期的 burst 保留", () => {
    const burstMap: BurstMap = { title: { anchor: "A", burstStartedAt: 1000, logIds: ["l1"] } };
    const result = expireBursts(burstMap, 1000 + EDIT_LOG_BURST_MS - 1, EDIT_LOG_BURST_MS);
    expect(result).toEqual(burstMap);
  });

  it("剛好等於時間窗邊界（now - burstStartedAt === burstMs）仍保留（非嚴格大於才過期）", () => {
    const burstMap: BurstMap = { title: { anchor: "A", burstStartedAt: 1000, logIds: ["l1"] } };
    const result = expireBursts(burstMap, 1000 + EDIT_LOG_BURST_MS, EDIT_LOG_BURST_MS);
    expect(result).toHaveProperty("title");
  });

  it("超過時間窗（大於 1ms）即清除", () => {
    const burstMap: BurstMap = { title: { anchor: "A", burstStartedAt: 1000, logIds: ["l1"] } };
    const result = expireBursts(burstMap, 1000 + EDIT_LOG_BURST_MS + 1, EDIT_LOG_BURST_MS);
    expect(result).not.toHaveProperty("title");
  });

  it("多個欄位各自獨立判斷是否過期", () => {
    const now = 1_000_000;
    const burstMap: BurstMap = {
      title: { anchor: "A", burstStartedAt: 0, logIds: ["l1"] }, // 已超過時間窗
      status: { anchor: "B", burstStartedAt: now - 1000, logIds: ["l2"] }, // 尚在窗內
    };
    const result = expireBursts(burstMap, now, EDIT_LOG_BURST_MS);
    expect(result).not.toHaveProperty("title");
    expect(result).toHaveProperty("status");
  });

  it("不修改傳入的 burstMap（immutability）", () => {
    const burstMap: BurstMap = { title: { anchor: "A", burstStartedAt: 0, logIds: ["l1"] } };
    const snapshot = JSON.parse(JSON.stringify(burstMap));
    expireBursts(burstMap, 999999, EDIT_LOG_BURST_MS);
    expect(burstMap).toEqual(snapshot);
  });
});

describe("applyEditLogFieldChange", () => {
  const author = "測試員";

  it("oldValue 與 newValue 序列化後相同時不新增紀錄", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "A",
      now: 1000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    expect(result.newLogCount).toBe(0);
    expect(result.nextLogs).toEqual([]);
    expect(result.nextBurstMap).toEqual({});
  });

  it("數字與字串值序列化相等時視為未變更（0 與 \"0\"）", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "unitCount",
      oldValue: 0,
      newValue: "0",
      now: 1000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "數量",
      existingLogs: [],
      burstMap: {},
    });
    expect(result.newLogCount).toBe(0);
  });

  it("null／undefined 皆序列化為空字串，視為相同值", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "note",
      oldValue: null,
      newValue: undefined,
      now: 1000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "備註",
      existingLogs: [],
      burstMap: {},
    });
    expect(result.newLogCount).toBe(0);
  });

  it("首次變更：新增一筆紀錄並建立 burst", () => {
    const result = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    expect(result.newLogCount).toBe(1);
    expect(result.nextLogs).toHaveLength(1);
    expect(result.nextLogs[0]).toMatchObject({
      changedBy: author,
      description: "標題 A → B",
      fieldKey: "title",
    });
    expect(result.nextBurstMap.title).toMatchObject({ anchor: "A", burstStartedAt: 1000 });
    expect(result.nextBurstMap.title.logIds).toEqual([result.nextLogs[0].id]);
  });

  it("視窗內改回錨點值：撤銷該 burst 產生的所有紀錄", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });

    // 在時間窗內改回原始值 A
    const second = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "B",
      newValue: "A",
      now: 1000 + 1000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "標題",
      existingLogs: first.nextLogs,
      burstMap: first.nextBurstMap,
    });

    expect(second.newLogCount).toBe(-1);
    expect(second.nextLogs).toEqual([]);
    expect(second.nextBurstMap).not.toHaveProperty("title");
  });

  it("視窗內連續多次變更（未回到錨點）：同一 burst 累積多筆紀錄", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "A",
      newValue: "B",
      now: 1000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "標題",
      existingLogs: [],
      burstMap: {},
    });
    const second = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "B",
      newValue: "C",
      now: 2000,
      author,
      formatTimestamp: fmt,
      fieldLabel: "標題",
      existingLogs: first.nextLogs,
      burstMap: first.nextBurstMap,
    });

    expect(second.newLogCount).toBe(1);
    expect(second.nextLogs).toHaveLength(2);
    // anchor 維持第一次變更前的原始值，而非中繼值 B
    expect(second.nextBurstMap.title.anchor).toBe("A");
    expect(second.nextBurstMap.title.logIds).toHaveLength(2);
  });

  it("視窗內連續變更後改回最初錨點：一次撤銷該 burst 累積的所有紀錄", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title", oldValue: "A", newValue: "B", now: 1000, author,
      formatTimestamp: fmt, fieldLabel: "標題", existingLogs: [], burstMap: {},
    });
    const second = applyEditLogFieldChange({
      fieldKey: "title", oldValue: "B", newValue: "C", now: 2000, author,
      formatTimestamp: fmt, fieldLabel: "標題", existingLogs: first.nextLogs, burstMap: first.nextBurstMap,
    });
    const third = applyEditLogFieldChange({
      fieldKey: "title", oldValue: "C", newValue: "A", now: 3000, author,
      formatTimestamp: fmt, fieldLabel: "標題", existingLogs: second.nextLogs, burstMap: second.nextBurstMap,
    });

    expect(third.newLogCount).toBe(-2);
    expect(third.nextLogs).toEqual([]);
    expect(third.nextBurstMap).not.toHaveProperty("title");
  });

  it("跨視窗（burst 已過期）：不視為撤銷，改以新變更的舊值另起新 burst", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title", oldValue: "A", newValue: "B", now: 0, author,
      formatTimestamp: fmt, fieldLabel: "標題", existingLogs: [], burstMap: {},
    });

    // 超過時間窗後才改回 A —— 不應撤銷先前紀錄，而是視為全新變更
    const second = applyEditLogFieldChange({
      fieldKey: "title",
      oldValue: "B",
      newValue: "A",
      now: EDIT_LOG_BURST_MS + 1,
      author,
      formatTimestamp: fmt,
      fieldLabel: "標題",
      existingLogs: first.nextLogs,
      burstMap: first.nextBurstMap,
    });

    expect(second.newLogCount).toBe(1);
    // 第一筆紀錄仍保留（burst 過期只清除追蹤狀態，不會回溯刪除已寫入的紀錄）
    expect(second.nextLogs).toHaveLength(2);
    expect(second.nextBurstMap.title).toMatchObject({ anchor: "B", burstStartedAt: EDIT_LOG_BURST_MS + 1 });
  });

  it("不同欄位各自獨立累積 burst，互不影響", () => {
    const first = applyEditLogFieldChange({
      fieldKey: "title", oldValue: "A", newValue: "B", now: 1000, author,
      formatTimestamp: fmt, fieldLabel: "標題", existingLogs: [], burstMap: {},
    });
    const second = applyEditLogFieldChange({
      fieldKey: "status", oldValue: "draft", newValue: "finalized", now: 1000, author,
      formatTimestamp: fmt, fieldLabel: "狀態", existingLogs: first.nextLogs, burstMap: first.nextBurstMap,
    });

    expect(second.nextLogs).toHaveLength(2);
    expect(Object.keys(second.nextBurstMap)).toEqual(["title", "status"]);
  });

  it("不修改傳入的 existingLogs／burstMap（immutability）", () => {
    const existingLogs: SimplePersistedLog[] = [];
    const burstMap: BurstMap = {};
    applyEditLogFieldChange({
      fieldKey: "title", oldValue: "A", newValue: "B", now: 1000, author,
      formatTimestamp: fmt, fieldLabel: "標題", existingLogs, burstMap,
    });
    expect(existingLogs).toEqual([]);
    expect(burstMap).toEqual({});
  });
});
