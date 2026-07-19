/**
 * 案件總表欄位可見性：§9.2 案件矩陣（managerOnly／譯者禁區）。
 * PermissionsPage 的 table_field_* 可再收緊；不可放寬本集合以外的禁區。
 * 權威：docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md §9.2（案件管理）
 */

/** 譯者／非 admin 總表不可見（含篩選／排序／屬性選單） */
export const CASE_TABLE_MANAGER_ONLY_KEYS = new Set([
  "client",
  "contact",
  "keyword",
  "clientPoNumber",
  "dispatchRoute",
  "clientCaseLink",
  "internalComments",
]);

export function isCaseTableManagerOnlyKey(key: string): boolean {
  return CASE_TABLE_MANAGER_ONLY_KEYS.has(key);
}
