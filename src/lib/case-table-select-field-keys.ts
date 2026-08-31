/**
 * 案件總表欄位名 → selectOptionsStore 鍵對照。
 * 欄位名與 store 鍵不一致時必須經此對照，勿直接把 case 欄位名當 fieldKey。
 */
export const CASE_TABLE_SELECT_FIELD_KEYS = {
  category: "caseCategory",
  workType: "taskType",
  billingUnit: "billingUnit",
} as const;

export type CaseTableSelectField = keyof typeof CASE_TABLE_SELECT_FIELD_KEYS;

export function caseTableSelectFieldKey(field: CaseTableSelectField): string {
  return CASE_TABLE_SELECT_FIELD_KEYS[field];
}
