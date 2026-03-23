/**
 * 將 CSS 色彩字串轉成 #RRGGBB，供 ColorPicker 等使用（避免 hsl/transparent 導致 hex 解析失敗）。
 */
export function parseCssColorToHex(cssColor: string): string {
  if (!cssColor?.trim()) return "#FFFFFF";
  const t = cssColor.trim();
  if (t.toLowerCase() === "transparent") return "#FFFFFF";
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  if (typeof document === "undefined") return "#FFFFFF";
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.visibility = "hidden";
  el.style.backgroundColor = "#ffffff";
  el.style.backgroundColor = t;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).backgroundColor;
  document.body.removeChild(el);
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#FFFFFF";
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  const hx = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`.toUpperCase();
}

/** 用於「恢復預設值」按鈕等 UI 顯示 */
export function formatCssColorForLabel(cssColor: string): string {
  if (!cssColor?.trim()) return "（無）";
  const s = cssColor.trim();
  if (s.toLowerCase() === "transparent") return "透明";
  if (s.length <= 32) return s;
  return `${s.slice(0, 29)}…`;
}
