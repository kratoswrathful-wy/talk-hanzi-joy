import type { CaseRecord } from "@/data/case-types";

/** Legacy 執行工具區塊筆數（tools 陣列或舊 executionTool 單筆） */
export function countLegacyTools(record: Pick<CaseRecord, "tools" | "executionTool">): number {
  if (Array.isArray(record.tools)) return record.tools.length;
  return record.executionTool ? 1 : 0;
}

/** 含 1UP CAT 子區塊在內的工具種類總數 */
export function countCaseTools(
  record: Pick<CaseRecord, "tools" | "executionTool" | "catToolEnabled">
): number {
  return countLegacyTools(record) + (record.catToolEnabled ? 1 : 0);
}

/** 是否允許移除某一種工具（至少需保留一種） */
export function canRemoveCaseTool(
  record: Pick<CaseRecord, "tools" | "executionTool" | "catToolEnabled">
): boolean {
  return countCaseTools(record) > 1;
}
