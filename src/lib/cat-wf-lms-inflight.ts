const inflight = new Set<string>();

/** 同一案件列的完成／重開，同時只允許一筆在途；重複訊息直接丟掉。 */
export function claimCatWfLmsInflight(key: string): boolean {
  const id = String(key || "").trim();
  if (!id || inflight.has(id)) return false;
  inflight.add(id);
  return true;
}

export function releaseCatWfLmsInflight(key: string): void {
  inflight.delete(String(key || "").trim());
}

export function catWfLmsInflightKey(
  caseId: string,
  collabRowId: string,
  taskCompleted: boolean,
): string {
  return `${String(caseId)}:${String(collabRowId || "_case")}:${taskCompleted ? "1" : "0"}`;
}
