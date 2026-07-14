/**
 * 額外資訊欄顯示層：長 token 縮短、展開鈕、雙擊複製完整原文（純函式＋DOM 小工具）。
 * 不改寫 seg.extraValue；搜尋／匯出仍用完整原文。
 */

export const LONG_TOKEN_MIN = 24;
export const HEAD_LEN = 8;
export const TAIL_LEN = 6;

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
 * 收合態是否「可能」被截斷（>3 行或有長 token）→ 應準備展開鈕。
 * @param {string} raw
 * @returns {boolean}
 */
export function needsExpandToggle(raw) {
  const text = String(raw ?? "");
  if (!text.trim()) return false;
  const lines = text.split("\n");
  if (lines.length > 3) return true;
  for (const line of lines) {
    for (const part of line.split(/\s+/)) {
      if (part.length >= LONG_TOKEN_MIN) return true;
    }
  }
  return false;
}

/**
 * @param {Array<{ value?: string }>|null|undefined} chips
 * @returns {boolean}
 */
export function needsExpandToggleForChips(chips) {
  if (!Array.isArray(chips) || !chips.length) return false;
  if (chips.length > 3) return true;
  return chips.some((c) => String(c && c.value != null ? c.value : "").length >= LONG_TOKEN_MIN);
}

/**
 * @param {boolean} expanded
 * @returns {string}
 */
export function buildExpandToggleHtml(expanded) {
  const isExp = !!expanded;
  const label = isExp ? "收合額外資訊" : "展開額外資訊";
  const dir = isExp ? "down" : "right";
  return (
    `<button type="button" class="col-extra-expand-btn" hidden ` +
    `data-expanded="${isExp ? "1" : "0"}" aria-label="${label}" title="${label}">` +
    `<span class="col-extra-expand-icon col-extra-expand-icon--${dir}" aria-hidden="true"></span>` +
    `</button>`
  );
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
      const fullAttr = escapeHtml(line);
      const inner = line
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
      return (
        `<span class="col-extra-para" data-full="${fullAttr}">${inner || "&nbsp;"}</span>`
      );
    })
    .join("");
}

/**
 * @param {string} raw
 * @param {{ expanded?: boolean }} [opts]
 * @returns {string}
 */
export function buildColExtraCellHtml(raw, opts = {}) {
  const expanded = !!opts.expanded;
  const classes = ["col-extra", expanded ? "is-expanded" : "col-extra-clamp"].join(" ");
  const body = buildExtraInfoInnerHtml(raw, { expanded });
  return (
    `<div class="${classes}" data-needs-expand="${needsExpandToggle(raw) ? "1" : "0"}">` +
    `<div class="col-extra-body">${body}</div>` +
    buildExpandToggleHtml(expanded) +
    `</div>`
  );
}

/**
 * @param {HTMLElement | null | undefined} cell
 * @param {string} raw
 * @param {boolean} expanded
 */
export function renderExtraInfoCell(cell, raw, expanded) {
  if (!cell) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = buildColExtraCellHtml(raw, { expanded: !!expanded });
  const next = wrap.firstElementChild;
  if (!next) return;
  cell.className = next.className;
  cell.dataset.needsExpand = next.dataset.needsExpand || "0";
  cell.innerHTML = next.innerHTML;
  syncExpandBtnVisibility(cell);
}

/**
 * 依實際溢出與 data-needs-expand 顯示／隱藏展開鈕。
 * 展開態一律顯示（供收合）。
 * @param {HTMLElement | null | undefined} cell
 */
export function syncExpandBtnVisibility(cell) {
  if (!cell) return;
  const btn = cell.querySelector(".col-extra-expand-btn");
  if (!btn) return;
  if (cell.classList.contains("is-expanded")) {
    btn.hidden = false;
    btn.setAttribute("data-expanded", "1");
    const icon = btn.querySelector(".col-extra-expand-icon");
    if (icon) {
      icon.classList.remove("col-extra-expand-icon--right");
      icon.classList.add("col-extra-expand-icon--down");
    }
    btn.setAttribute("aria-label", "收合額外資訊");
    btn.setAttribute("title", "收合額外資訊");
    return;
  }
  const force = cell.getAttribute("data-needs-expand") === "1";
  const measureEl = cell.querySelector(".col-extra-body") || cell;
  const overflowing = measureEl.scrollHeight > measureEl.clientHeight + 1;
  btn.hidden = !(force || overflowing);
  btn.setAttribute("data-expanded", "0");
  const icon = btn.querySelector(".col-extra-expand-icon");
  if (icon) {
    icon.classList.remove("col-extra-expand-icon--down");
    icon.classList.add("col-extra-expand-icon--right");
  }
  btn.setAttribute("aria-label", "展開額外資訊");
  btn.setAttribute("title", "展開額外資訊");
}

/**
 * 自事件目標解析要複製的完整原文（段落／chip／長 token）。
 * @param {EventTarget | null | undefined} target
 * @returns {string}
 */
export function getCopyTextFromEventTarget(target) {
  if (!target || typeof target !== "object" || !("closest" in target)) return "";
  const el = /** @type {Element} */ (target);
  const chip = el.closest(".meta-extra-chip");
  if (chip) return chip.getAttribute("data-full") || "";
  const para = el.closest(".col-extra-para");
  if (para) return para.getAttribute("data-full") || "";
  const long = el.closest(".col-extra-long-token");
  if (long) return long.getAttribute("data-full") || "";
  return "";
}

/**
 * 輕量「已複製」提示（短暫出現在元素旁）。
 * @param {Element | null | undefined} nearEl
 * @param {string} [msg]
 */
export function showCopiedHint(nearEl, msg) {
  const text = msg != null ? String(msg) : "已複製";
  let tip = document.querySelector(".col-copy-hint");
  if (tip) tip.remove();
  tip = document.createElement("div");
  tip.className = "col-copy-hint";
  tip.textContent = text;
  tip.setAttribute("role", "status");
  document.body.appendChild(tip);
  try {
    const r = nearEl && nearEl.getBoundingClientRect ? nearEl.getBoundingClientRect() : null;
    if (r) {
      tip.style.left = `${Math.round(r.left + Math.min(r.width, 80))}px`;
      tip.style.top = `${Math.round(r.top - 4)}px`;
    } else {
      tip.style.left = "50%";
      tip.style.top = "20%";
    }
  } catch (_) {
    tip.style.left = "50%";
    tip.style.top = "20%";
  }
  requestAnimationFrame(() => tip.classList.add("is-visible"));
  window.setTimeout(() => {
    tip.classList.remove("is-visible");
    window.setTimeout(() => tip.remove(), 180);
  }, 900);
}

/**
 * @param {string} text
 * @param {Element | null | undefined} nearEl
 * @returns {Promise<boolean>}
 */
export async function copyTextWithHint(text, nearEl) {
  const t = String(text ?? "");
  if (!t) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(t);
      showCopiedHint(nearEl, "已複製");
      return true;
    }
  } catch (_) {
    /* fall through */
  }
  return false;
}

/**
 * 攔截連續點擊的選字（detail>1 的 mousedown）。
 * @param {MouseEvent} e
 */
export function preventDoubleClickSelection(e) {
  if (e && e.detail > 1) {
    e.preventDefault();
  }
}

export const ExtraInfoDisplay = {
  LONG_TOKEN_MIN,
  HEAD_LEN,
  TAIL_LEN,
  escapeHtml,
  shortenLongToken,
  needsExpandToggle,
  needsExpandToggleForChips,
  buildExpandToggleHtml,
  buildExtraInfoInnerHtml,
  buildColExtraCellHtml,
  renderExtraInfoCell,
  syncExpandBtnVisibility,
  getCopyTextFromEventTarget,
  showCopiedHint,
  copyTextWithHint,
  preventDoubleClickSelection,
};

if (typeof globalThis !== "undefined") {
  globalThis.ExtraInfoDisplay = ExtraInfoDisplay;
}

export default ExtraInfoDisplay;
