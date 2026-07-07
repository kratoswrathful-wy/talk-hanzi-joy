/**
 * 客戶請款 __lmsAgent bridge 輔助：權限、addFees 分類、adjustAmount 計算（純函式可測）。
 */
import type { ClientInvoice, ClientInvoiceAdjustmentLine } from "@/data/client-invoice-types";
import type { ClientTaskItem, TranslatorFee } from "@/data/fee-mock-data";
import type { SelectOption } from "@/stores/select-options-store";
import type { AgentResult } from "@/lib/ai-agent-types";
import { agentOk, agentFail } from "@/lib/ai-agent-types";

export type ClientInvoiceAddFeeSkipReason =
  | "not_found"
  | "already_on_invoice"
  | "linked_to_other_invoice"
  | "client_mismatch"
  | "not_reconciled";

export type ClientInvoiceAdjustMode = "set_target" | "add" | "subtract";

export interface ClientInvoiceAddFeeSkip {
  feeId: string;
  reason: ClientInvoiceAddFeeSkipReason;
}

export interface ClientInvoiceAddFeesPlan {
  toAdd: string[];
  skipped: ClientInvoiceAddFeeSkip[];
}

export interface ClientInvoiceAdjustAmountInput {
  mode: ClientInvoiceAdjustMode;
  currency: string;
  targetAmount: number;
}

const PM_PLUS_ROLES = new Set(["pm", "executive"]);

/** 與 ClientInvoiceDetailPage getFeeRevenue 相同邏輯 */
export function getFeeRevenueForClientInvoice(
  fee: TranslatorFee,
  clientOptions: SelectOption[],
): { amount: number; currency: string } {
  const ci = fee.clientInfo;
  if (!ci?.clientTaskItems) return { amount: 0, currency: "TWD" };
  if (ci.notFirstFee) return { amount: 0, currency: "TWD" };
  const amount = ci.clientTaskItems.reduce(
    (s: number, i: ClientTaskItem) => s + Number(i.unitCount || 0) * Number(i.clientPrice || 0),
    0,
  );
  const clientOpt = clientOptions.find((o) => o.label === ci.client);
  const currency = clientOpt?.currency || "TWD";
  return { amount, currency };
}

export function resolveClientCurrency(clientLabel: string, clientOptions: SelectOption[]): string {
  const clientOpt = clientOptions.find((o) => o.label === clientLabel);
  return clientOpt?.currency || "TWD";
}

export function computeFeeTotalsByCurrency(
  linkedFees: TranslatorFee[],
  clientOptions: SelectOption[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const f of linkedFees) {
    const { amount, currency } = getFeeRevenueForClientInvoice(f, clientOptions);
    map.set(currency, (map.get(currency) || 0) + amount);
  }
  return map;
}

export function computeAdjustmentSumInClientCurrency(
  lines: ClientInvoiceAdjustmentLine[],
  clientCurrency: string,
  getTwdRate: (code: string) => number,
): number {
  let s = 0;
  for (const line of lines) {
    const sign = line.operation === "add" ? 1 : -1;
    const twd = line.amount * getTwdRate(line.currency) * sign;
    s += twd / getTwdRate(clientCurrency);
  }
  return s;
}

export function classifyAddFeeEligibility(
  feeId: string,
  fee: TranslatorFee | undefined,
  invoice: ClientInvoice,
  allLinkedFeeIds: Set<string>,
): ClientInvoiceAddFeeSkipReason | null {
  if (!fee) return "not_found";
  if (invoice.feeIds.includes(feeId)) return "already_on_invoice";
  if (allLinkedFeeIds.has(feeId)) return "linked_to_other_invoice";
  const ci = fee.clientInfo;
  if (!ci?.client || ci.client !== invoice.client) return "client_mismatch";
  if (!ci.reconciled) return "not_reconciled";
  return null;
}

export function planClientInvoiceAddFees(
  feeIds: string[],
  invoice: ClientInvoice,
  feesById: Map<string, TranslatorFee>,
  allLinkedFeeIds: Set<string>,
): ClientInvoiceAddFeesPlan {
  const toAdd: string[] = [];
  const skipped: ClientInvoiceAddFeeSkip[] = [];
  const seen = new Set<string>();
  for (const feeId of feeIds) {
    const id = String(feeId || "").trim();
    if (!id) continue;
    if (seen.has(id)) {
      skipped.push({ feeId: id, reason: "already_on_invoice" });
      continue;
    }
    seen.add(id);
    const reason = classifyAddFeeEligibility(id, feesById.get(id), invoice, allLinkedFeeIds);
    if (reason) {
      skipped.push({ feeId: id, reason });
      continue;
    }
    toAdd.push(id);
  }
  return { toAdd, skipped };
}

export interface ComputeAdjustmentLineInput {
  mode: ClientInvoiceAdjustMode;
  currency: string;
  targetAmount: number;
  feeTotalsByCurrency: Map<string, number>;
  adjustmentSumInClientCurrency: number;
  clientCurrency: string;
  getTwdRate: (code: string) => number;
}

export type ComputeAdjustmentLineResult =
  | { ok: true; line: ClientInvoiceAdjustmentLine | null; noop?: boolean }
  | { ok: false; error: string };

/** 與 ClientInvoiceDetailPage handleAdjustmentConfirm 對齊 */
export function computeClientInvoiceAdjustmentLine(
  input: ComputeAdjustmentLineInput,
): ComputeAdjustmentLineResult {
  const { mode, currency, targetAmount, feeTotalsByCurrency, adjustmentSumInClientCurrency, clientCurrency, getTwdRate } =
    input;
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return { ok: false, error: "targetAmount 須為正數" };
  }
  const rateClient = getTwdRate(clientCurrency);
  const rateAdj = getTwdRate(currency);
  if (!rateClient || !rateAdj) {
    return { ok: false, error: `無法解析幣別匯率（${currency}／${clientCurrency}）` };
  }
  const rateRatio = rateAdj / rateClient;

  if (mode === "set_target") {
    const currentTotal = (feeTotalsByCurrency.get(clientCurrency) || 0) + adjustmentSumInClientCurrency;
    const targetInClient = (targetAmount * rateAdj) / rateClient;
    const delta = targetInClient - currentTotal;
    const EPS = 1e-6;
    if (Math.abs(delta) < EPS) {
      return { ok: true, line: null, noop: true };
    }
    const operation: "add" | "subtract" = delta > 0 ? "add" : "subtract";
    const amountLine = Math.abs(delta) / rateRatio;
    if (!Number.isFinite(amountLine) || amountLine <= 0) {
      return { ok: false, error: "無法計算調整金額" };
    }
    return {
      ok: true,
      line: {
        id: crypto.randomUUID(),
        operation,
        amount: amountLine,
        currency,
      },
    };
  }

  if (mode !== "add" && mode !== "subtract") {
    return { ok: false, error: `mode 須為 set_target／add／subtract` };
  }

  return {
    ok: true,
    line: {
      id: crypto.randomUUID(),
      operation: mode,
      amount: targetAmount,
      currency,
    },
  };
}

export function isPmPlusRole(role: string | null | undefined): boolean {
  return !!role && PM_PLUS_ROLES.has(role);
}

export function pickPrimaryRole(roles: string[]): string | null {
  if (roles.includes("executive")) return "executive";
  if (roles.includes("pm")) return "pm";
  if (roles.includes("member")) return "member";
  return roles[0] ?? null;
}

export function assertPmPlusFromRoles(roles: string[]): AgentResult<void> {
  const primary = pickPrimaryRole(roles);
  if (!primary) return agentFail("無法判定使用者角色");
  if (!isPmPlusRole(primary)) {
    return agentFail("客戶請款僅 PM 以上可寫入（目前角色：譯者）");
  }
  return agentOk(undefined);
}

export function isValidDateOnlyOrIso(value: string): boolean {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  return !Number.isNaN(Date.parse(v));
}

export function normalizeExpectedCollectionDate(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function verifyFeeIdsOnInvoice(invoice: ClientInvoice, feeIds: string[]): boolean {
  return feeIds.every((id) => invoice.feeIds.includes(id));
}
