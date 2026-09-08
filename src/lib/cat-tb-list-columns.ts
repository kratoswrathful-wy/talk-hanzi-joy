/** 儀表板／TB 清單不帶 terms／change_log 等大 jsonb；詳情走 getTB select("*")。 */
export const CAT_TB_LIST_COLUMNS =
  "id, name, next_term_number, source_langs, target_langs, source_type, source_type_locked, google_sheet_url, env, created_at, last_modified";

export function isCatTbListSelectHeavy(select: string | null): boolean {
  const raw = String(select || "").trim();
  if (!raw || raw === "*") return true;
  return /(?:^|,)\s*(terms|change_log|online_tabs|online_import_config)\s*(?:,|$)/.test(raw);
}
