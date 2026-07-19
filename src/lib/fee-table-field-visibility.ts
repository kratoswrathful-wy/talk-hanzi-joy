/**
 * 費用總表欄位可見性：W10 §9.2 硬編碼矩陣（managerOnly／譯者禁區）。
 * PermissionsPage 的 table_field_* 可再收緊；不可放寬本集合以外的禁區。
 * 權威：docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md §9.2
 */

/** §9.2 禁區：譯者／非 admin 總表不可見（含篩選／排序／屬性選單） */
export const FEE_TABLE_MANAGER_ONLY_KEYS = new Set([
  "client",
  "contact",
  "clientCaseId",
  "clientPoNumber",
  "dispatchRoute",
  "clientRevenue",
  "clientTaskType",
  "clientBillingUnit",
  "clientUnitCount",
  "clientUnitPrice",
  "profit",
  "reconciled",
  "rateConfirmed",
  "invoiced",
  "sameCase",
  "clientInvoiceStatus",
  "invoice", // 客戶請款單
]);

/** §9.2 白名單：譯者總表／篩選／排序可開的欄（含稿費明細 orphan） */
export const FEE_TABLE_TRANSLATOR_VISIBLE_KEYS = new Set([
  "title",
  "status",
  "assignee",
  "internalNote", // 相關案件
  "taskSummary",
  "feeTaskType",
  "feeBillingUnit",
  "feeUnitCount",
  "feeUnitPrice",
  "translatorInvoiceStatus",
  "translatorInvoice",
  "createdBy",
  "createdAt",
]);

export function isFeeTableManagerOnlyKey(key: string): boolean {
  return FEE_TABLE_MANAGER_ONLY_KEYS.has(key);
}
