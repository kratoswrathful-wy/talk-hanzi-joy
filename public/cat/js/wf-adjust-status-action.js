/**
 * PM「調整狀態／準備完成」點擊決策（純函式，供 Vitest）。
 * 工項 D 三態 modal 適用整檔與拆段；不得再依 hasSplit 改走舊下拉
 *（PM 工具列隱藏箭頭時舊下拉等於無反應）。
 */

/**
 * @param {{ prepActive?: boolean }} [input]
 * @returns {'prep-complete'|'open-modal'}
 */
export function resolvePmAdjustStatusClickAction(input) {
  if (input && input.prepActive) return "prep-complete";
  return "open-modal";
}
