(function (global) {
'use strict';
const itemKey = global.MetaItemsCollector.itemKey;
const normalizeMetaItems = global.MetaItemsCollector.normalizeMetaItems;
/**
 * meta_display_config 顯示層套用（純函式）。
 * 未設 config → 行為與現況 idValue／extraValue／keys 完全相同。
 */

/**
 * @typedef {{ sourceType: string, name: string, value: string }} MetaItem
 * @typedef {{
 *   keyItem?: string|null,
 *   extraItems?: string[],
 *   hiddenItems?: string[],
 * }} MetaDisplayConfig
 */

/**
 * @param {unknown} config
 * @returns {MetaDisplayConfig|null}
 */
function normalizeMetaDisplayConfig(config) {
  if (!config || typeof config !== "object") return null;
  const c = /** @type {any} */ (config);
  const keyItem =
    c.keyItem != null && String(c.keyItem).trim() !== "" ? String(c.keyItem).trim() : null;
  const extraItems = Array.isArray(c.extraItems)
    ? c.extraItems.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const hiddenItems = Array.isArray(c.hiddenItems)
    ? c.hiddenItems.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (!keyItem && !extraItems.length && !hiddenItems.length) return null;
  return { keyItem, extraItems, hiddenItems };
}

/**
 * @param {object} seg
 * @returns {string[]}
 */
function legacyKeys(seg) {
  if (Array.isArray(seg.keys) && seg.keys.length) {
    return seg.keys.map((k) => String(k ?? ""));
  }
  if (seg.idValue) {
    return String(seg.idValue)
      .split("\n")
      .map((l) => l.replace(/^String Key \d+: /, "").trim());
  }
  return [];
}

/**
 * @param {object} seg
 * @param {MetaDisplayConfig|null|undefined} config
 * @returns {{
 *   usesConfig: boolean,
 *   displayKeys: string[],
 *   displayExtraText: string,
 *   displayExtraChips: Array<{ key: string, name: string, value: string }>|null,
 * }}
 */
/**
 * Escape for HTML attribute / text (與 ExtraInfoDisplay 對齊).
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Array<{ key: string, name: string, value: string }>} chips
 * @param {{ expanded?: boolean }} [opts]
 * @returns {string}
 */
function buildMetaExtraChipsCellHtml(chips, opts = {}) {
  const expanded = !!opts.expanded;
  const list = Array.isArray(chips) ? chips : [];
  const classes = ["col-extra", "col-extra-chips", expanded ? "is-expanded" : "col-extra-clamp"].join(
    " ",
  );
  if (!list.length) {
    return `<div class="${classes}"></div>`;
  }
  const shorten =
    typeof globalThis !== "undefined" &&
    globalThis.ExtraInfoDisplay &&
    typeof globalThis.ExtraInfoDisplay.shortenLongToken === "function"
      ? globalThis.ExtraInfoDisplay.shortenLongToken
      : (t) => String(t ?? "");
  const inner = list
    .map((c) => {
      const name = String(c.name || "");
      const value = String(c.value || "");
      const shown = expanded ? value : shorten(value);
      const tip = escapeHtml(name ? `${name}: ${value}` : value);
      return (
        `<span class="meta-extra-chip" data-meta-key="${escapeHtml(c.key || "")}" ` +
        `title="${tip}" data-full="${escapeHtml(value)}">` +
        (name
          ? `<span class="meta-extra-chip-name">${escapeHtml(name)}</span>`
          : "") +
        `<span class="meta-extra-chip-value">${escapeHtml(shown)}</span>` +
        `</span>`
      );
    })
    .join("");
  return `<div class="${classes}">${inner}</div>`;
}

function applyMetaDisplay(seg, config) {
  const cfg = normalizeMetaDisplayConfig(config);
  const items = normalizeMetaItems(seg && seg.metaItems);

  // 未設 config，或句段尚無 meta_items（舊匯入／migration 後未刷新）→ 一律舊行為
  if (!cfg || !items.length) {
    return {
      usesConfig: false,
      displayKeys: legacyKeys(seg || {}),
      displayExtraText: String((seg && seg.extraValue) || ""),
      displayExtraChips: null,
    };
  }

  const hidden = new Set(cfg.hiddenItems || []);
  const byKey = new Map();
  for (const it of items) {
    const k = itemKey(it);
    if (hidden.has(k)) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  }

  let displayKeys = legacyKeys(seg || {});
  if (cfg.keyItem && byKey.has(cfg.keyItem)) {
    displayKeys = byKey.get(cfg.keyItem).map((it) => it.value);
  }

  const chipKeys = Array.isArray(cfg.extraItems) ? cfg.extraItems.filter((k) => !hidden.has(k)) : [];
  const chips = [];
  for (const k of chipKeys) {
    const arr = byKey.get(k) || [];
    for (const it of arr) {
      chips.push({ key: k, name: it.name, value: it.value });
    }
  }

  return {
    usesConfig: true,
    displayKeys,
    displayExtraText: chips.map((c) => c.value).join("\n"),
    displayExtraChips: chips,
  };
}

const MetaDisplayApply = {
  normalizeMetaDisplayConfig,
  applyMetaDisplay,
  buildMetaExtraChipsCellHtml,
};


global.MetaDisplayApply = MetaDisplayApply;
})(typeof globalThis !== 'undefined' ? globalThis : this);
