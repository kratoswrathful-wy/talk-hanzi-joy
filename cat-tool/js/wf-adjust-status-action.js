/**
 * PM「調整段落狀態」modal 決策（純函式，供 Vitest）。
 * 工項 E：無指派階段仍顯示佔位列；整檔範圍標示。
 */

/**
 * @param {{ prepActive?: boolean }} [input]
 * @returns {'prep-complete'|'open-modal'}
 */
export function resolvePmAdjustStatusClickAction(input) {
  if (input && input.prepActive) return "prep-complete";
  return "open-modal";
}

/**
 * 指派範圍後綴（整檔／列範圍／自訂 scopeLabel）。
 * @param {{
 *   scopeLabel?: string|null,
 *   lineStart?: number|null,
 *   lineEnd?: number|null,
 *   line_start?: number|null,
 *   line_end?: number|null,
 * }|null|undefined} a
 * @returns {string}
 */
export function formatWorkflowScopeSuffix(a) {
  if (!a) return "";
  const label = String(a.scopeLabel || "").trim();
  if (label) return `（${label}）`;
  const ls = a.lineStart != null ? a.lineStart : a.line_start;
  const le = a.lineEnd != null ? a.lineEnd : a.line_end;
  if (ls != null && le != null) return `（${ls}–${le} 列）`;
  if (ls != null) return `（${ls} 列起）`;
  if (le != null) return `（至 ${le} 列）`;
  return "（整檔）";
}

/**
 * 無指派佔位列套用：未選人不寫入；已選人 → insert upsert。
 * @param {{ assigneeUserId?: string|null }} [input]
 * @returns {'skip'|'insert'}
 */
export function resolvePlaceholderApplyAction(input) {
  const uid = String(input?.assigneeUserId || "").trim();
  if (!uid) return "skip";
  return "insert";
}

/**
 * 是否顯示某階段的「全部設為…」快速鍵（階段存在即顯示，含 0 筆指派）。
 * @param {{ stageExists?: boolean }} [input]
 */
export function shouldShowAdjustBulkForStage(input) {
  return !!(input && input.stageExists);
}
