import { describe, expect, it } from "vitest";
import {
  clientInfoChangedKeys,
  feeWriteStillProtected,
  shouldDropFeePendingAfterJob,
  hasExternalFeeFieldConflict,
  mergeFeeRemoteWithPending,
  nextFeeInFlightCount,
  pickFeePersistExpectedUpdatedAt,
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
