import { describe, expect, it } from "vitest";
import { clientInfoChangedKeys, stripFeeServerOwnedKeys } from "./fee-write";
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
