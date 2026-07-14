/**
 * 額外資訊欄顯示層：長 token 縮短、HTML 組裝（純函式，供 Vitest + 編輯器）。
 * 不改寫 seg.extraValue；搜尋／匯出仍用完整原文。
 */

const LONG_TOKEN_MIN = 24;
const HEAD_LEN = 8;
const TAIL_LEN = 6;

/**
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} token
 * @returns {string}
 */
export function shortenLongToken(token) {
  const t = String(token ?? "");
  if (t.length < LONG_TOKEN_MIN) return t;
  return `${t.slice(0, HEAD_LEN)}…${t.slice(-TAIL_LEN)}`;
}

/**
 * @param {string} raw
 * @param {{ expanded?: boolean }} [opts]
 * @returns {string}
 */
export function buildExtraInfoInnerHtml(raw, opts = {}) {
  const expanded = !!opts.expanded;
  const text = String(raw ?? "");
  if (!text) return "";

  const lines = text.split("\n");
  return lines
    .map((line) => {
      // 保留空白 token，只對「無空白且夠長」的片段縮短
      return line
        .split(/(\s+)/)
        .map((part) => {
          if (!part) return "";
          if (/^\s+$/.test(part)) return escapeHtml(part);
          if (!expanded && part.length >= LONG_TOKEN_MIN && !/\s/.test(part)) {
            const short = shortenLongToken(part);
            return (
              `<span class="col-extra-long-token" data-full="${escapeHtml(part)}" ` +
              `title="${escapeHtml(part)}">${escapeHtml(short)}</span>`
            );
          }
          return escapeHtml(part);
        })
        .join("");
    })
    .join("<br>");
}

/**
 * @param {string} raw
 * @param {{ expanded?: boolean }} [opts]
 * @returns {string}
 */
export function buildColExtraCellHtml(raw, opts = {}) {
  const expanded = !!opts.expanded;
  const classes = ["col-extra", expanded ? "is-expanded" : "col-extra-clamp"].join(" ");
  const inner = buildExtraInfoInnerHtml(raw, { expanded });
  return `<div class="${classes}">${inner}</div>`;
}

/**
 * @param {HTMLElement | null | undefined} cell
 * @param {string} raw
 * @param {boolean} expanded
 */
export function renderExtraInfoCell(cell, raw, expanded) {
  if (!cell) return;
  cell.classList.toggle("is-expanded", !!expanded);
  cell.classList.toggle("col-extra-clamp", !expanded);
  cell.innerHTML = buildExtraInfoInnerHtml(raw, { expanded: !!expanded });
}

export const ExtraInfoDisplay = {
  LONG_TOKEN_MIN,
  HEAD_LEN,
  TAIL_LEN,
  escapeHtml,
  shortenLongToken,
  buildExtraInfoInnerHtml,
  buildColExtraCellHtml,
  renderExtraInfoCell,
};

if (typeof globalThis !== "undefined") {
  globalThis.ExtraInfoDisplay = ExtraInfoDisplay;
}

export default ExtraInfoDisplay;
