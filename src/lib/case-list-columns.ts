/**
 * 案件清單讀取欄位：不含 view 上最貴的運算欄（edit_logs 子查詢、
 * public_tool_structure、內文／附件 jsonb）。詳情與複製改走單筆 select("*")。
 */
export const CASE_LIST_COLUMNS =
  "id, title, status, client, contact, keyword, client_po_number, client_case_link, dispatch_route, category, work_type, work_groups, billing_unit, unit_count, translator, translation_deadline, reviewer, review_deadline, execution_tool, cat_tool_enabled, delivery_method, multi_collab, collab_count, collab_rows, review_rows, decline_records, icon_url, created_by, created_at, updated_at, env, revision, task_status, change_log_enabled_at, fee_entry";

export const CASE_LIST_OMITTED_DB_COLUMNS = [
  "edit_logs",
  "body_content",
  "tools",
  "question_tools",
  "comments",
  "internal_comments",
  "internal_records",
  "process_note",
  "inquiry_note",
  "source_files",
  "working_files",
] as const;

export function isCasesVisibleFullListSelect(select: string | null): boolean {
  const raw = String(select || "").trim();
  if (!raw || raw === "*") return true;
  return CASE_LIST_OMITTED_DB_COLUMNS.some((col) => {
    const re = new RegExp(`(?:^|,)\\s*${col}\\s*(?:,|$)`);
    return re.test(raw);
  });
}
