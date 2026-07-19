/**
 * 費用總表欄位可見性：W10 §9.2 硬編碼矩陣（managerOnly／譯者禁區）。
 * PermissionsPage 的 table_field_* 可再收緊；不可放寬本集合以外的禁區。
 * 權威：docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md §9.2
 */

/** §9.2 禁區：譯者／非 admin 總表不可見（含篩選／排序選單） */
export const FEE_TABLE_MANAGER_ONLY_KEYS = new Set([
  "client",
  "contact",
  "clientCaseId",
  "clientPoNumber",
  "dispatchRoute",
  "clientRevenue",
  "profit",
  "reconciled",
  "rateConfirmed",
  "invoiced",
  "sameCase",
  "clientInvoiceStatus",
  "invoice", // 客戶請款單
]);

/** §9.2 白名單中曾被誤標 managerOnly、應對譯者開放的總表欄 */
export const FEE_TABLE_TRANSLATOR_VISIBLE_KEYS = new Set([
  "title",
  "status",
  "assignee",
  "internalNote", // 相關案件
  "taskSummary",
  "translatorInvoiceStatus",
  "translatorInvoice",
  "createdBy",
  "createdAt",
]);

export function isFeeTableManagerOnlyKey(key: string): boolean {
  return FEE_TABLE_MANAGER_ONLY_KEYS.has(key);
}
