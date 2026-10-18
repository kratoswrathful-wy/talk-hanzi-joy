import { toast } from "sonner";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import { classifyInvoiceWriteCertainty } from "@/lib/invoice-link-write";
import {
  applyInvoiceLinkAddFeedback,
  type InvoiceLinkAddResult,
} from "@/lib/invoice-link-add";

export type InvoiceFeeAddLogWrite = {
  attempted: boolean;
  saved: boolean;
  uncertain: boolean;
  error: unknown;
};

export function invoiceFeeAddLogFeedback(write: InvoiceFeeAddLogWrite): {
  toast: "none" | "error";
  message: string;
} {
  if (!write.attempted || write.saved) return { toast: "none", message: "" };
  if (write.uncertain) {
    return {
      toast: "error",
      message: "費用已收錄，變更紀錄結果待確認。請重整後核對紀錄，請勿再收一次費用。",
    };
  }
  return {
    toast: "error",
    message: "費用已收錄，但變更紀錄未儲存。請勿再收一次費用。",
  };
}

export function applyInvoiceFeeAddLogFeedback(write: InvoiceFeeAddLogWrite): void {
  const fb = invoiceFeeAddLogFeedback(write);
  if (fb.toast === "error") toast.error(fb.message);
}

/** 尚未開始記錄＝未要求寫入。明確失敗撤回本機偽裝；結果不明不撤回，避免蓋掉可能已存的一筆。 */
export async function persistInvoiceFeeAddLog(input: {
  started: boolean;
  previousLogs: SimplePersistedLog[];
  append: () => SimplePersistedLog[] | null;
  persist: (logs: SimplePersistedLog[]) => Promise<{ error: unknown }>;
  revert: (previous: SimplePersistedLog[]) => void;
}): Promise<InvoiceFeeAddLogWrite> {
  if (!input.started) {
    return { attempted: false, saved: true, uncertain: false, error: null };
  }
  const next = input.append();
  if (!next) return { attempted: false, saved: true, uncertain: false, error: null };
  const newest = next[next.length - 1];
  if (
    newest
    && input.previousLogs.some((log) => log.fieldKey === newest.fieldKey && log.description === newest.description)
  ) {
    input.revert(input.previousLogs);
    return { attempted: false, saved: true, uncertain: false, error: null };
  }
  const { error } = await input.persist(next);
  if (!error) return { attempted: true, saved: true, uncertain: false, error: null };
  const uncertain = classifyInvoiceWriteCertainty(error) === "unknown";
  if (!uncertain) input.revert(input.previousLogs);
  return { attempted: true, saved: false, uncertain, error };
}

/** 先處理費用關聯回饋，再視需要寫紀錄；紀錄失敗不得再送一次費用。 */
export async function addFeesThenPersistLog(input: {
  add: () => Promise<InvoiceLinkAddResult>;
  started: boolean;
  previousLogs: SimplePersistedLog[];
  append: () => SimplePersistedLog[] | null;
  persist: (logs: SimplePersistedLog[]) => Promise<{ error: unknown }>;
  revert: (previous: SimplePersistedLog[]) => void;
}): Promise<{
  fee: InvoiceLinkAddResult;
  closePicker: boolean;
  log: InvoiceFeeAddLogWrite;
}> {
  const fee = await input.add();
  const feeUi = applyInvoiceLinkAddFeedback(fee);
  if (!feeUi.shouldLogAdded) {
    return {
      fee,
      closePicker: feeUi.closePicker,
      log: { attempted: false, saved: true, uncertain: false, error: null },
    };
  }
  const log = await persistInvoiceFeeAddLog({
    started: input.started,
    previousLogs: input.previousLogs,
    append: input.append,
    persist: input.persist,
    revert: input.revert,
  });
  applyInvoiceFeeAddLogFeedback(log);
  return { fee, closePicker: feeUi.closePicker, log };
}

/** 請款明細「加入費用」呼叫端：先收錄再寫紀錄，紀錄失敗不得再收一次。 */
export async function handleInvoiceDetailAddFees(input: {
  add: () => Promise<InvoiceLinkAddResult>;
  started: boolean;
  previousLogs: SimplePersistedLog[];
  addedDescription: (addedIds: string[]) => { field: string; oldValue: string; newValue: string };
  append: (field: string, oldValue: string, newValue: string) => SimplePersistedLog[] | null;
  persist: (logs: SimplePersistedLog[]) => Promise<{ error: unknown }>;
  revert: (previous: SimplePersistedLog[]) => void;
}): ReturnType<typeof addFeesThenPersistLog> {
  let added: string[] = [];
  return addFeesThenPersistLog({
    add: async () => {
      const result = await input.add();
      added = result.added;
      return result;
    },
    started: input.started,
    previousLogs: input.previousLogs,
    append: () => {
      const desc = input.addedDescription(added);
      return input.append(desc.field, desc.oldValue, desc.newValue);
    },
    persist: input.persist,
    revert: input.revert,
  });
}
