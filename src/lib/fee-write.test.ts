import { describe, expect, it } from "vitest";
import {
  clientInfoChangedKeys,
  feeWriteStillProtected,
  shouldDropFeePendingAfterJob,
  hasExternalFeeFieldConflict,
  feeClientInfoPatchAfterRequery,
  mergeFeeRemoteWithPending,
  nextFeeInFlightCount,
  persistFeeWriteConfirmed,
  isFeeStaleVersionError,
  shouldRetryFeePersistAfterStale,
  parseFeePendingRecords,
  serializeFeePendingRecords,
  upsertFeePendingRecord,
  removeFeePendingRecord,
  pickFeePersistExpectedUpdatedAt,
  readJsonNumber,
  stripFeeServerOwnedKeys,
} from "./fee-write";
import { defaultClientInfo } from "@/data/fee-mock-data";

describe("clientInfoChangedKeys", () => {
  it("only includes keys that actually changed", () => {
    const prev = { ...defaultClientInfo, clientPoNumber: "PO-1", client: "甲" };
    const next = { ...prev, clientPoNumber: "PO-2" };
    expect(clientInfoChangedKeys(prev, next)).toEqual({ clientPoNumber: "PO-2" });
  });

  it("does not send unchanged task rows when only PO changes", () => {
    const prev = { ...defaultClientInfo };
    const next = { ...prev, clientPoNumber: "PO-9" };
    const patch = clientInfoChangedKeys(prev, next);
    expect(patch.clientTaskItems).toBeUndefined();
    expect(patch.client).toBeUndefined();
    expect(patch.clientPoNumber).toBe("PO-9");
  });

  it("ignores keys omitted from the next patch", () => {
    const prev = { ...defaultClientInfo, client: "甲" };
    expect(clientInfoChangedKeys(prev, { clientPoNumber: "X" })).toEqual({ clientPoNumber: "X" });
  });
});

describe("pickFeePersistExpectedUpdatedAt", () => {
  it("優先用目前 store 的新版本，不用入列舊快照", () => {
    expect(
      pickFeePersistExpectedUpdatedAt(
        { updatedAt: "2026-09-13T06:01:00.000Z" },
        { updatedAt: "2026-09-13T06:00:00.000Z" },
      ),
    ).toBe("2026-09-13T06:01:00.000Z");
  });

  it("尚無新版本時才退回入列快照", () => {
    expect(
      pickFeePersistExpectedUpdatedAt(undefined, { updatedAt: "2026-09-13T06:00:00.000Z" }),
    ).toBe("2026-09-13T06:00:00.000Z");
  });
});

describe("fee in-flight protection", () => {
  it("第一筆結束、後面仍排隊時保護不消失", () => {
    const afterFirstStart = nextFeeInFlightCount(0, 1);
    const afterSecondQueued = nextFeeInFlightCount(afterFirstStart, 1);
    const afterFirstFinally = nextFeeInFlightCount(afterSecondQueued, -1);
    expect(feeWriteStillProtected(afterFirstFinally)).toBe(true);
    expect(feeWriteStillProtected(nextFeeInFlightCount(afterFirstFinally, -1))).toBe(false);
    expect(shouldDropFeePendingAfterJob(0, true)).toBe(false);
    expect(shouldDropFeePendingAfterJob(0, false)).toBe(true);
  });

  it("遠端重載不得蓋掉待送欄位，也不得用本機舊版本號", () => {
    const remote = { title: "遠端", clientPoNumber: "OLD", updatedAt: "v2" };
    const pending = { title: "我剛打的", updatedAt: "v0" };
    expect(mergeFeeRemoteWithPending(remote, pending)).toEqual({
      title: "我剛打的",
      clientPoNumber: "OLD",
      updatedAt: "v2",
    });
  });

  it("待送 clientInfo 只蓋改過的鍵，遠端其餘欄位仍在", () => {
    const remote = {
      title: "遠端",
      updatedAt: "v2",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-OLD", client: "甲" },
    };
    const pending = {
      clientInfo: { clientPoNumber: "PO-NEW" },
      updatedAt: "v0",
    };
    expect(mergeFeeRemoteWithPending(remote, pending)).toEqual({
      title: "遠端",
      updatedAt: "v2",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-NEW", client: "甲" },
    });
  });

  it("他人改同一欄則衝突；只改不同欄則不擋", () => {
    const queued = {
      updatedAt: "v1",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-1", reconciled: false },
    };
    const sameFieldRemote = {
      updatedAt: "v2",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-B", reconciled: false },
    };
    const otherFieldRemote = {
      updatedAt: "v2",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-1", reconciled: true },
    };
    const updates = {
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-A", reconciled: false },
    };
    expect(hasExternalFeeFieldConflict(sameFieldRemote, queued, updates)).toBe(true);
    expect(hasExternalFeeFieldConflict(otherFieldRemote, queued, updates)).toBe(false);
  });
});

describe("readJsonNumber", () => {
  it("接受數字與數字字串，其它回 0", () => {
    expect(readJsonNumber(8.5)).toBe(8.5);
    expect(readJsonNumber("8.5")).toBe(8.5);
    expect(readJsonNumber("")).toBe(0);
    expect(readJsonNumber(undefined)).toBe(0);
  });
});

describe("persistFeeWriteConfirmed", () => {
  it("沒有 ok 或有錯誤都不得當已寫入", () => {
    expect(persistFeeWriteConfirmed({ error: null, data: { ok: true } })).toBe(true);
    expect(persistFeeWriteConfirmed({ error: null, data: null })).toBe(false);
    expect(persistFeeWriteConfirmed({ error: new Error("abort"), data: { ok: true } })).toBe(false);
  });
});

describe("stale version retry", () => {
  it("只有 stale_updated_at 且他人改不同欄才准重試", () => {
    const queued = {
      updatedAt: "v1",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-1" },
    };
    const otherField = {
      updatedAt: "v2",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-1", reconciled: true },
    };
    const sameField = {
      updatedAt: "v2",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-OTHER" },
    };
    const updates = { clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-MINE" } };
    const stale = { error: new Error("stale_updated_at"), data: { ok: false, error: "stale_updated_at" } };
    expect(isFeeStaleVersionError(stale)).toBe(true);
    expect(isFeeStaleVersionError({ error: new Error("abort"), data: null })).toBe(false);
    expect(shouldRetryFeePersistAfterStale(stale, otherField, queued, updates)).toBe(true);
    expect(shouldRetryFeePersistAfterStale(stale, sameField, queued, updates)).toBe(false);
    expect(shouldRetryFeePersistAfterStale({ error: new Error("abort"), data: null }, otherField, queued, updates)).toBe(false);
  });
});

describe("fee pending storage records", () => {
  it("同一費用覆寫、成功後可刪，壞 JSON 當空", () => {
    const first = { env: "test", id: "f1", updates: { title: "A" } };
    const second = { env: "test", id: "f1", updates: { title: "B" } };
    const kept = upsertFeePendingRecord([first], second);
    expect(kept).toEqual([second]);
    expect(removeFeePendingRecord(kept, "test", "f1")).toEqual([]);
    expect(parseFeePendingRecords(serializeFeePendingRecords(kept))).toEqual(kept);
    expect(parseFeePendingRecords("not-json")).toEqual([]);
  });
});

describe("feeClientInfoPatchAfterRequery", () => {
  it("重查後版本變了但只改不同欄：只送 PO，不得帶舊整包任務列", () => {
    const queued = {
      updatedAt: "v1",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-1", clientTaskItems: defaultClientInfo.clientTaskItems },
    };
    const remote = {
      updatedAt: "v2",
      clientInfo: {
        ...defaultClientInfo,
        clientPoNumber: "PO-1",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯" as const, billingUnit: "字" as const, unitCount: 10, clientPrice: 9.5 }],
      },
    };
    const updates = {
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-MINE" },
    };
    expect(feeClientInfoPatchAfterRequery(remote, queued, updates)).toEqual({
      conflict: false,
      clientInfoPatch: { clientPoNumber: "PO-MINE" },
    });
  });

  it("重查後同一欄已被他人改：衝突且不送出", () => {
    const queued = {
      updatedAt: "v1",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-1" },
    };
    const remote = {
      updatedAt: "v2",
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-OTHER" },
    };
    const updates = {
      clientInfo: { ...defaultClientInfo, clientPoNumber: "PO-MINE" },
    };
    expect(feeClientInfoPatchAfterRequery(remote, queued, updates).conflict).toBe(true);
  });
});

describe("stripFeeServerOwnedKeys", () => {
  it("drops server-owned and undefined keys", () => {
    expect(
      stripFeeServerOwnedKeys({
        title: "A",
        updated_at: "2026-01-01",
        finalized_by: "x",
        env: "test",
        assignee: undefined,
      }),
    ).toEqual({ title: "A" });
  });
});
