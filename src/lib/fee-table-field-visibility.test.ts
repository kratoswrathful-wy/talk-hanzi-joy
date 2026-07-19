import { describe, expect, it } from "vitest";
import {
  FEE_TABLE_MANAGER_ONLY_KEYS,
  FEE_TABLE_TRANSLATOR_VISIBLE_KEYS,
  isFeeTableManagerOnlyKey,
} from "./fee-table-field-visibility";

describe("fee-table-field-visibility §9.2", () => {
  it("marks client-side / revenue columns as manager-only", () => {
    expect(isFeeTableManagerOnlyKey("clientRevenue")).toBe(true);
    expect(isFeeTableManagerOnlyKey("clientTaskType")).toBe(true);
    expect(isFeeTableManagerOnlyKey("clientUnitPrice")).toBe(true);
    expect(isFeeTableManagerOnlyKey("invoice")).toBe(true);
    expect(isFeeTableManagerOnlyKey("clientInvoiceStatus")).toBe(true);
  });

  it("keeps related case, fee detail orphans, and translator invoice visible", () => {
    expect(isFeeTableManagerOnlyKey("internalNote")).toBe(false);
    expect(isFeeTableManagerOnlyKey("feeTaskType")).toBe(false);
    expect(isFeeTableManagerOnlyKey("feeUnitPrice")).toBe(false);
    expect(isFeeTableManagerOnlyKey("translatorInvoice")).toBe(false);
    expect(FEE_TABLE_TRANSLATOR_VISIBLE_KEYS.has("feeBillingUnit")).toBe(true);
  });

  it("does not overlap manager-only and translator-visible sets", () => {
    for (const key of FEE_TABLE_TRANSLATOR_VISIBLE_KEYS) {
      expect(FEE_TABLE_MANAGER_ONLY_KEYS.has(key)).toBe(false);
    }
  });
});
