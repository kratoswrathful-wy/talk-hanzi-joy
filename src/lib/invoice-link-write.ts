/**
 * 請款單建立後掛上費用：區分「確定被拒」與「回應遺失／逾時」。
 * 結果不明不得刪單，也不得只把畫面列拿掉就當清理完成。
 */

const TRANSPORT_FAILURE_RE =
  /fetch|network|abort|timeout|load failed|failed to send|err_failed|net::/i;

export type InvoiceWriteCertainty = "definite" | "unknown";

export type InvoiceLinkCleanupDecision =
  | { action: "delete"; reason: "link_rejected" }
  | { action: "keep"; reason: "link_unknown" | "create_unknown" };

export type InvoiceDeleteCheck =
  | { kind: "deleted" }
  | { kind: "delete_failed"; error: unknown }
  | { kind: "unknown"; error?: unknown };

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const rec = error as { message?: unknown; details?: unknown; hint?: unknown };
    return [rec.message, rec.details, rec.hint]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" ");
  }
  return String(error ?? "");
}

/** 連線中斷／abort／逾時（含空 code 的 Failed to fetch）一律不明，不得當確定未寫入。 */
export function classifyInvoiceWriteCertainty(error: unknown): InvoiceWriteCertainty {
  if (TRANSPORT_FAILURE_RE.test(errorText(error))) return "unknown";
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string" && code.trim()) return "definite";
  if (error instanceof Error) return "definite";
  if (error && typeof error === "object") return "definite";
  return "unknown";
}

export function decideInvoiceLinkCleanup(linkError: unknown): InvoiceLinkCleanupDecision {
  return classifyInvoiceWriteCertainty(linkError) === "unknown"
    ? { action: "keep", reason: "link_unknown" }
    : { action: "delete", reason: "link_rejected" };
}

export function interpretInvoiceDeleteResult(
  error: unknown,
  deletedIds: Array<{ id?: string }> | null | undefined,
): InvoiceDeleteCheck {
  if (error) {
    return classifyInvoiceWriteCertainty(error) === "unknown"
      ? { kind: "unknown", error }
      : { kind: "delete_failed", error };
  }
  if (Array.isArray(deletedIds) && deletedIds.some((row) => typeof row?.id === "string")) {
    return { kind: "deleted" };
  }
  return { kind: "unknown" };
}

/** 這些費用已掛在同一張單 → 重試應沿用，不得再建一張。 */
export function findReusableInvoiceId(
  links: Array<{ invoiceId: string; feeId: string }>,
  feeIds: string[],
): string | null {
  if (feeIds.length === 0 || links.length === 0) return null;
  const wanted = new Set(feeIds);
  const byInvoice = new Map<string, Set<string>>();
  for (const link of links) {
    if (!wanted.has(link.feeId)) continue;
    const set = byInvoice.get(link.invoiceId) ?? new Set<string>();
    set.add(link.feeId);
    byInvoice.set(link.invoiceId, set);
  }
  for (const [invoiceId, set] of byInvoice) {
    if (feeIds.every((id) => set.has(id))) return invoiceId;
  }
  return null;
}

export function invoiceLinkFailureMessage(decision: InvoiceLinkCleanupDecision, deleteCheck?: InvoiceDeleteCheck): string {
  if (decision.reason === "link_unknown") {
    return "收錄結果不明，單據可能已建立。請重整後核對，請勿再按一次新建。";
  }
  if (deleteCheck?.kind === "delete_failed") {
    return "費用未掛上請款單，且空單清理失敗。請重整後核對，請勿當成已收錄。";
  }
  if (deleteCheck?.kind === "unknown") {
    return "費用未掛上請款單，空單是否已刪除不明。請重整後核對，請勿再按一次新建。";
  }
  return "收錄失敗：請款單或費用關聯未寫入。";
}
