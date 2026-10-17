import { toast } from "sonner";
import { uniqueFeeIds } from "@/lib/invoice-fee-ids";
import { classifyInvoiceWriteCertainty, isInvoiceLinkAlreadyExists } from "@/lib/invoice-link-write";

export type InvoiceLinkAddResult = {
  error: unknown;
  wanted: string[];
  already: string[];
  added: string[];
  missing: string[];
  uncertain: boolean;
};

export function emptyInvoiceLinkAddResult(
  error: unknown,
  wanted: readonly string[] = [],
  extra?: Partial<InvoiceLinkAddResult>,
): InvoiceLinkAddResult {
  const wantedU = uniqueFeeIds(wanted);
  return {
    error,
    wanted: wantedU,
    already: [],
    added: [],
    missing: wantedU,
    uncertain: false,
    ...extra,
  };
}

export function invoiceLinkAddFromConfirmed(
  wanted: readonly string[],
  alreadyBefore: readonly string[],
  confirmed: readonly string[],
  error: unknown = null,
  uncertain = false,
): InvoiceLinkAddResult {
  const wantedU = uniqueFeeIds(wanted);
  const before = new Set(uniqueFeeIds(alreadyBefore));
  const confirmedU = uniqueFeeIds(confirmed).filter((id) => wantedU.includes(id));
  const confirmedSet = new Set(confirmedU);
  return {
    error,
    wanted: wantedU,
    already: wantedU.filter((id) => before.has(id) && confirmedSet.has(id)),
    added: wantedU.filter((id) => !before.has(id) && confirmedSet.has(id)),
    missing: wantedU.filter((id) => !confirmedSet.has(id)),
    uncertain,
  };
}

export function invoiceLinkAddFeedback(result: InvoiceLinkAddResult): {
  variant: "success" | "error";
  message: string;
  closePicker: boolean;
} {
  if (result.uncertain) {
    return { variant: "error", message: "收錄結果不明。請重整後核對，請勿再按一次。", closePicker: false };
  }
  if (result.missing.length === 0) {
    if (result.added.length === 0) {
      return { variant: "success", message: "這些費用已在本單，沒有新增。", closePicker: true };
    }
    if (result.already.length === 0) {
      return { variant: "success", message: `已加入 ${result.added.length} 筆費用`, closePicker: true };
    }
    return {
      variant: "success",
      message: `已加入 ${result.added.length} 筆費用（另有 ${result.already.length} 筆原本就在本單）`,
      closePicker: true,
    };
  }
  if (result.added.length > 0 || result.already.length > 0) {
    return {
      variant: "error",
      message: "部分費用已收錄，其餘請重整後核對，請勿整批再收一次。",
      closePicker: false,
    };
  }
  return {
    variant: "error",
    message: "未能收錄指定費用。請重整後核對，請勿再按一次。",
    closePicker: false,
  };
}

/** 不明結果已由 store 提示，這裡不再重複。失敗或未知不得當成整批已存。 */
export function applyInvoiceLinkAddFeedback(result: InvoiceLinkAddResult): {
  closePicker: boolean;
  shouldLogAdded: boolean;
} {
  const fb = invoiceLinkAddFeedback(result);
  if (!result.uncertain) {
    if (fb.variant === "success") toast.success(fb.message);
    else toast.error(fb.message);
  }
  return { closePicker: fb.closePicker, shouldLogAdded: result.added.length > 0 };
}

/** 先寫入缺列；23505 只代表「有列已存在」，須回讀後只補仍缺的，且只再試一次。 */
export async function persistAttemptedInvoiceLinks(input: {
  attempted: string[];
  insert: (ids: string[]) => Promise<{ error: unknown }>;
  fetchConfirmed: (ids: string[]) => Promise<{ ids: string[]; error: unknown }>;
}): Promise<{ confirmed: string[]; error: unknown; uncertain: boolean }> {
  const attempted = uniqueFeeIds(input.attempted);
  if (attempted.length === 0) return { confirmed: [], error: null, uncertain: false };

  const first = await input.insert(attempted);
  if (!first.error) return { confirmed: attempted, error: null, uncertain: false };

  const afterFirst = await input.fetchConfirmed(attempted);
  if (afterFirst.error) {
    return {
      confirmed: [],
      error: afterFirst.error,
      uncertain:
        classifyInvoiceWriteCertainty(first.error) === "unknown"
        || classifyInvoiceWriteCertainty(afterFirst.error) === "unknown",
    };
  }

  let confirmed = uniqueFeeIds(afterFirst.ids.filter((id) => attempted.includes(id)));
  const remaining = attempted.filter((id) => !confirmed.includes(id));

  if (isInvoiceLinkAlreadyExists(first.error) && remaining.length > 0) {
    const second = await input.insert(remaining);
    if (!second.error) {
      return { confirmed: uniqueFeeIds([...confirmed, ...remaining]), error: null, uncertain: false };
    }
    const afterSecond = await input.fetchConfirmed(attempted);
    if (afterSecond.error) {
      return {
        confirmed,
        error: afterSecond.error,
        uncertain:
          classifyInvoiceWriteCertainty(second.error) === "unknown"
          || classifyInvoiceWriteCertainty(afterSecond.error) === "unknown",
      };
    }
    confirmed = uniqueFeeIds(afterSecond.ids.filter((id) => attempted.includes(id)));
    const stillMissing = attempted.filter((id) => !confirmed.includes(id));
    if (stillMissing.length === 0) return { confirmed, error: null, uncertain: false };
    return {
      confirmed,
      error: second.error,
      uncertain: classifyInvoiceWriteCertainty(second.error) === "unknown",
    };
  }

  const stillMissing = attempted.filter((id) => !confirmed.includes(id));
  if (stillMissing.length === 0) return { confirmed, error: null, uncertain: false };
  return {
    confirmed,
    error: first.error,
    uncertain: classifyInvoiceWriteCertainty(first.error) === "unknown",
  };
}
