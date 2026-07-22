/**
 * 虛擬捲動導覽：是否必須重建 #gridBody 視窗（replaceChildren）。
 * 已掛載且目標置中後視窗起迄不變時，應改走 scrollTop 快路徑，避免狂閃。
 * @param {{
 *   rowMounted?: boolean,
 *   windowStart?: number|null,
 *   windowEnd?: number|null,
 *   nextStart?: number|null,
 *   nextEnd?: number|null,
 * }} opts
 * @returns {boolean}
 */
export function shouldForceVirtWindowRebuild(opts) {
  const o = opts || {};
  if (!o.rowMounted) return true;
  if (o.windowStart == null || o.windowStart < 0) return true;
  if (o.windowEnd == null || o.windowEnd <= o.windowStart) return true;
  if (o.nextStart == null || o.nextEnd == null) return true;
  return o.nextStart !== o.windowStart || o.nextEnd !== o.windowEnd;
}
