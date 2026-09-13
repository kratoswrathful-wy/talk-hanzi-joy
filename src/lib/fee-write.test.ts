import { describe, expect, it } from "vitest";
import { clientInfoChangedKeys, pickFeePersistExpectedUpdatedAt, stripFeeServerOwnedKeys } from "./fee-write";
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
