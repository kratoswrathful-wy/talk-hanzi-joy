/**
 * 設定頁 ColorPicker：依底色聚合選項標籤，供「使用中的顏色」提示。
 * 多處設定區塊共用（客戶、任務類型、狀態標籤等）。
 */
export function getColorUsageMap(options: { color: string; label: string }[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const opt of options) {
    const key = opt.color.toUpperCase();
    if (!map[key]) map[key] = [];
    map[key].push(opt.label);
  }
  return map;
}
