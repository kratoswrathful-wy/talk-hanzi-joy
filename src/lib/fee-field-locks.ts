/**
 * Centralized fee field locking logic.
 * This module defines which fields are locked based on fee state,
 * and is shared across detail pages and table views.
 */

import type { TranslatorFee } from "@/data/fee-mock-data";

export interface FieldLockResult {
  locked: boolean;
  reason: string;
}

export interface FeeFieldLockContext {
  /** IDs of translator invoices that include this fee */
  linkedTranslatorInvoiceIds: string[];
  /** IDs of client invoices that include this fee */
  linkedClientInvoiceIds: string[];
}

const UNLOCKED: FieldLockResult = { locked: false, reason: "" };

/**
 * Compute the lock state for a specific field on a given fee.
 */
export function getFieldLock(
  fee: TranslatorFee,
  field: string,
  ctx: FeeFieldLockContext
): FieldLockResult {
  const isFinalized = fee.status === "finalized";
  const ci = fee.clientInfo;
  const rateConfirmed = !!ci?.rateConfirmed;
  const reconciled = !!ci?.reconciled;
  const inTranslatorInvoice = ctx.linkedTranslatorInvoiceIds.length > 0;
  const inClientInvoice = ctx.linkedClientInvoiceIds.length > 0;

  switch (field) {
    // ── Title ──
    case "title":
      if (isFinalized) return { locked: true, reason: "已向譯者開立稿費條，不得修改標題" };
      return UNLOCKED;

    // ── Status ──
    case "status":
      // Status changes via table: draft→finalized needs rateConfirmed; finalized→draft blocked if in translator invoice
      // For inline select we lock if in translator invoice (can't recall)
      if (inTranslatorInvoice) return { locked: true, reason: "此費用已列入稿費請款單，不得修改狀態" };
      return UNLOCKED;

    // ── Assignee (譯者) ──
    case "assignee":
      if (isFinalized) return { locked: true, reason: "已向譯者開立稿費條，不得修改譯者" };
      if (rateConfirmed) return { locked: true, reason: "已勾選費率無誤，不得修改譯者" };
      return UNLOCKED;

    // ── Internal Note (相關案件) ──
    case "internalNote": {
      if (fee.internalNote) return { locked: true, reason: "相關案件已擷取完畢，不得修改" };
      const anyFieldLocked = isFinalized || rateConfirmed || reconciled || inTranslatorInvoice || inClientInvoice;
      if (anyFieldLocked) return { locked: true, reason: "頁面上目前有鎖定欄位，無法擷取並修改資訊" };
      return UNLOCKED;
    }

    // ── Client (客戶) ──
    case "client":
      if (inClientInvoice) return { locked: true, reason: "此費用已列入客戶請款單，不得修改客戶" };
      if (reconciled) return { locked: true, reason: "已勾選對帳完成，不得修改客戶" };
      return UNLOCKED;

    // ── Contact (聯絡人) ──
    case "contact":
      if (inClientInvoice) return { locked: true, reason: "此費用已列入客戶請款單，不得修改聯絡人" };
      if (reconciled) return { locked: true, reason: "已勾選對帳完成，不得修改聯絡人" };
      return UNLOCKED;

    // ── Client Case ID (關鍵字) ──
    case "clientCaseId":
      if (inClientInvoice) return { locked: true, reason: "此費用已列入客戶請款單，不得修改" };
      if (reconciled) return { locked: true, reason: "已勾選對帳完成，不得修改" };
      return UNLOCKED;

    // ── Client PO# ──
    case "clientPoNumber":
      if (inClientInvoice) return { locked: true, reason: "此費用已列入客戶請款單，不得修改" };
      if (reconciled) return { locked: true, reason: "已勾選對帳完成，不得修改" };
      return UNLOCKED;

    // ── Dispatch Route (派案途徑) ──
    case "dispatchRoute":
      if (inClientInvoice) return { locked: true, reason: "此費用已列入客戶請款單，不得修改" };
      if (reconciled) return { locked: true, reason: "已勾選對帳完成，不得修改" };
      return UNLOCKED;

    // ── Rate Confirmed (費率無誤) ──
    case "rateConfirmed":
      if (inTranslatorInvoice) return { locked: true, reason: "此費用已列入稿費請款單，不得修改" };
      if (isFinalized) return { locked: true, reason: "已向譯者開立稿費條，不得修改" };
      return UNLOCKED;

    // ── Reconciled (對帳完成) ──
    case "reconciled":
      if (inClientInvoice) return { locked: true, reason: "此費用已列入客戶請款單，不得修改對帳狀態" };
      return UNLOCKED;

    // ── Invoiced (請款完成) ──
    case "invoiced":
      if (inClientInvoice) return { locked: true, reason: "此費用已列入客戶請款單，不得修改請款狀態" };
      return UNLOCKED;

    // ── Same Case (費用群組) ──
    case "sameCase":
      return UNLOCKED;

    default:
      return UNLOCKED;
  }
}

/**
 * For multi-select: aggregate lock across multiple fees.
 * If ANY fee has a locked field, the field is locked for all.
 * Returns the reason referencing the first blocking fee's title.
 */
export function getMultiSelectFieldLock(
  fees: TranslatorFee[],
  field: string,
  getContext: (fee: TranslatorFee) => FeeFieldLockContext
): FieldLockResult {
  for (const fee of fees) {
    const lock = getFieldLock(fee, field, getContext(fee));
    if (lock.locked) {
      return {
        locked: true,
        reason: `無法編輯。${lock.reason}：${fee.title || "未命名稿費單"}`,
      };
    }
  }
  return UNLOCKED;
}
