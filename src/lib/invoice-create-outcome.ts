import { toast } from "sonner";
import { uniqueFeeIds } from "@/lib/invoice-fee-ids";
import { persistAttemptedInvoiceLinks } from "@/lib/invoice-link-add";

export type InvoiceCreateOutcome<T> = {
  invoice: T | null;
  complete: boolean;
  uncertain: boolean;
  missing: string[];
  /** store 已提示過時，呼叫端不再重複錯誤 toast */
  notified?: boolean;
};

export function emptyInvoiceCreateOutcome<T>(
  extra?: Partial<InvoiceCreateOutcome<T>>,
): InvoiceCreateOutcome<T> {
  return {
    invoice: null,
    complete: false,
    uncertain: false,
    missing: [],
    ...extra,
  };
}

export function invoiceCreateOutcomeFeedback(outcome: InvoiceCreateOutcome<unknown>): {
  variant: "success" | "error";
  message: string;
  navigate: boolean;
} {
  if (outcome.complete && outcome.invoice) {
    return { variant: "success", message: "已建立請款單", navigate: true };
  }
  if (outcome.uncertain) {
    return {
      variant: "error",
      message: "請款單可能已建立，費用關聯結果待確認。請重整後核對，請勿再按一次新建。",
      navigate: false,
    };
  }
  if (outcome.invoice || outcome.missing.length > 0) {
    return {
      variant: "error",
      message: "請款單已建立，部分費用尚未掛上。請重整後核對，請勿再按一次新建。",
      navigate: false,
    };
  }
  return {
    variant: "error",
    message: "未能建立請款單。請重整後核對，請勿再按一次新建。",
    navigate: false,
  };
}

function invoiceIdOf(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object" || !("id" in invoice)) return null;
  const id = (invoice as { id: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function applyInvoiceCreateOutcome(
  outcome: InvoiceCreateOutcome<unknown>,
  successMessage: string,
): { navigate: boolean; invoiceId: string | null } {
  const fb = invoiceCreateOutcomeFeedback(outcome);
  const invoiceId = invoiceIdOf(outcome.invoice);
  if (fb.navigate && invoiceId) {
    toast.success(successMessage);
    return { navigate: true, invoiceId };
  }
  if (!outcome.notified) toast.error(fb.message);
  return { navigate: false, invoiceId };
}

/**
 * 重複鍵後必須以讀回確認每一筆要求的費用。讀回失敗不得拿樂觀快取當完成。
 * 仍缺的只補一次。
 */
export async function resolveInvoiceAfterDuplicateLink<T extends { id: string; feeIds: string[] }>(input: {
  wanted: readonly string[];
  fetchConfirmedInvoice: () => Promise<T | null>;
  persistRemaining: (missing: string[]) => ReturnType<typeof persistAttemptedInvoiceLinks>;
}): Promise<InvoiceCreateOutcome<T>> {
  const wanted = uniqueFeeIds(input.wanted);
  const fetched = await input.fetchConfirmedInvoice();
  if (!fetched) {
    return emptyInvoiceCreateOutcome({ uncertain: true, missing: wanted });
  }
  const onInvoice = uniqueFeeIds(fetched.feeIds);
  const missing = wanted.filter((id) => !onInvoice.includes(id));
  if (missing.length === 0) {
    return { invoice: fetched, complete: true, uncertain: false, missing: [] };
  }
  const persisted = await input.persistRemaining(missing);
  const confirmed = uniqueFeeIds([...onInvoice, ...persisted.confirmed]);
  const stillMissing = wanted.filter((id) => !confirmed.includes(id));
  const invoice = { ...fetched, feeIds: confirmed };
  if (stillMissing.length === 0 && !persisted.uncertain) {
    return { invoice, complete: true, uncertain: false, missing: [] };
  }
  return {
    invoice,
    complete: false,
    uncertain: persisted.uncertain || stillMissing.length > 0,
    missing: stillMissing,
  };
}
