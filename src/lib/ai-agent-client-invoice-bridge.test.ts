import { describe, it, expect } from "vitest";
import {
  classifyAddFeeEligibility,
  computeClientInvoiceAdjustmentLine,
  computeAdjustmentSumInClientCurrency,
  planClientInvoiceAddFees,
  assertPmPlusFromRoles,
  normalizeExpectedCollectionDate,
} from "./ai-agent-client-invoice-bridge";
import type { ClientInvoice } from "@/data/client-invoice-types";
import type { TranslatorFee } from "@/data/fee-mock-data";
import { defaultClientInfo } from "@/data/fee-mock-data";

const baseInvoice: ClientInvoice = {
  id: "inv-1",
  title: "Test",
  invoiceNumber: "",
  client: "ECI",
  status: "pending",
  note: "",
  createdBy: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  feeIds: [],
  payments: [],
};

function fee(partial: Partial<TranslatorFee> & { id: string }): TranslatorFee {
  return {
    id: partial.id,
    title: partial.title ?? "fee",
    status: partial.status ?? "finalized",
    translator: "t1",
    caseId: "c1",
    caseTitle: "case",
    taskItems: [],
    clientInfo: {
      ...defaultClientInfo,
      client: "ECI",
      reconciled: true,
      clientTaskItems: [{ id: "ci1", taskType: "翻譯", billingUnit: "字", unitCount: 100, clientPrice: 1 }],
      ...partial.clientInfo,
    },
    ...partial,
  } as TranslatorFee;
}

describe("ai-agent-client-invoice-bridge", () => {
  it("assertPmPlusFromRoles 拒絕譯者", () => {
    const r = assertPmPlusFromRoles(["member"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("PM");
  });

  it("planClientInvoiceAddFees 分類略過原因", () => {
    const f1 = fee({ id: "f1" });
    const f2 = fee({ id: "f2", clientInfo: { ...defaultClientInfo, client: "Other", reconciled: true } });
    const f3 = fee({ id: "f3", clientInfo: { ...defaultClientInfo, client: "ECI", reconciled: false } });
    const map = new Map([
      ["f1", f1],
      ["f2", f2],
      ["f3", f3],
    ]);
    const linked = new Set(["f9"]);
    const plan = planClientInvoiceAddFees(["f1", "f2", "f3", "missing", "f1"], baseInvoice, map, linked);
    expect(plan.toAdd).toEqual(["f1"]);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      "client_mismatch",
      "not_reconciled",
      "not_found",
      "already_on_invoice",
    ]);
  });

  it("computeClientInvoiceAdjustmentLine set_target 自動加一筆", () => {
    const feeTotals = new Map([["TWD", 1000]]);
    const r = computeClientInvoiceAdjustmentLine({
      mode: "set_target",
      currency: "TWD",
      targetAmount: 1200,
      feeTotalsByCurrency: feeTotals,
      adjustmentSumInClientCurrency: 0,
      clientCurrency: "TWD",
      getTwdRate: () => 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok || !r.line) return;
    expect(r.line.operation).toBe("add");
    expect(r.line.amount).toBe(200);
  });

  it("computeClientInvoiceAdjustmentLine set_target 已達目標 noop", () => {
    const r = computeClientInvoiceAdjustmentLine({
      mode: "set_target",
      currency: "TWD",
      targetAmount: 1000,
      feeTotalsByCurrency: new Map([["TWD", 1000]]),
      adjustmentSumInClientCurrency: 0,
      clientCurrency: "TWD",
      getTwdRate: () => 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.noop).toBe(true);
    expect(r.line).toBeNull();
  });

  it("computeAdjustmentSumInClientCurrency 加減合計", () => {
    const sum = computeAdjustmentSumInClientCurrency(
      [
        { id: "a1", operation: "add", amount: 100, currency: "TWD" },
        { id: "a2", operation: "subtract", amount: 50, currency: "TWD" },
      ],
      "TWD",
      () => 1,
    );
    expect(sum).toBe(50);
  });

  it("normalizeExpectedCollectionDate 保留 YYYY-MM-DD", () => {
    expect(normalizeExpectedCollectionDate("2026-07-15")).toBe("2026-07-15");
  });

  it("classifyAddFeeEligibility 已在其他請款", () => {
    const f = fee({ id: "fx" });
    const reason = classifyAddFeeEligibility("fx", f, baseInvoice, new Set(["fx"]));
    expect(reason).toBe("linked_to_other_invoice");
  });
});
