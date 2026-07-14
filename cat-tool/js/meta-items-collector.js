/**
 * XLIFF 家族中繼資料收集器。
 * 產出統一 meta_items：[{ sourceType, name, value }]
 * 不改寫 xliffTuId；idValue／extraValue 仍由既有路徑填寫。
 */

/**
 * @typedef {{ sourceType: string, name: string, value: string }} MetaItem
 */

/**
 * @param {MetaItem} item
 * @returns {string}
 */
export function itemKey(item) {
  if (!item) return "";
  return `${String(item.sourceType || "").trim()}::${String(item.name || "").trim()}`;
}

/**
 * @param {unknown} items
 * @returns {MetaItem[]}
 */
export function normalizeMetaItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const sourceType = String(/** @type {any} */ (raw).sourceType || "").trim();
    const name = String(/** @type {any} */ (raw).name || "").trim();
    const value = String(/** @type {any} */ (raw).value ?? "").trim();
    if (!sourceType || !name || !value) continue;
    out.push({ sourceType, name, value });
  }
  return out;
}

/**
 * @param {MetaItem[]} items
 * @param {string} sourceType
 * @param {string} name
 * @param {string} value
 */
function pushItem(items, sourceType, name, value) {
  const v = String(value ?? "").trim();
  const st = String(sourceType ?? "").trim();
  const n = String(name ?? "").trim();
  if (!st || !n || !v) return;
  items.push({ sourceType: st, name: n, value: v });
}

/**
 * 從 XLIFF 1.x trans-unit 收集（mq／sdl／phrase／一般 xliff 共用）。
 * @param {Element} tu
 * @param {{ isMqxliff?: boolean }} [opts]
 * @returns {MetaItem[]}
 */
export function collectFromTransUnit(tu, opts) {
  const items = [];
  if (!tu || tu.nodeType !== 1) return items;
  const isMq = !!(opts && opts.isMqxliff);

  const idAttr = tu.getAttribute("id");
  if (idAttr) pushItem(items, "attr", "id", idAttr);
  const resname = tu.getAttribute("resname");
  if (resname) pushItem(items, "attr", "resname", resname);

  for (const a of Array.from(tu.attributes || [])) {
    if (a.localName === "unitId" || a.name === "mq:unitId") {
      pushItem(items, "attr", "mq:unitId", a.value);
      break;
    }
  }

  const ctxGroups = tu.getElementsByTagName("context-group");
  Array.from(ctxGroups).forEach((cg) => {
    const ctxNodes = cg.getElementsByTagName("context");
    Array.from(ctxNodes).forEach((ctxEl) => {
      const t = (ctxEl.textContent || "").trim();
      if (!t) return;
      const cType = (ctxEl.getAttribute("context-type") || "context").trim() || "context";
      pushItem(items, "context", cType, t);
    });
  });

  Array.from(tu.getElementsByTagName("note")).forEach((n) => {
    const t = (n.textContent || "").trim();
    if (!t) return;
    const from = (n.getAttribute("from") || n.getAttribute("annotates") || "note").trim() || "note";
    pushItem(items, "note", from, t);
  });

  Array.from(tu.getElementsByTagName("comment")).forEach((c) => {
    if (c.parentElement && c.parentElement.localName === "comments") return;
    const t = (c.textContent || "").trim();
    if (t) pushItem(items, "comment", "comment", t);
  });

  if (isMq) {
    const mqCommentsNode = Array.from(tu.getElementsByTagName("*")).find(
      (n) => n.localName === "comments",
    );
    if (mqCommentsNode) {
      Array.from(mqCommentsNode.childNodes)
        .filter((n) => n.nodeType === 1 && n.localName === "comment")
        .forEach((c) => {
          const t = (c.textContent || "").trim();
          if (!t) return;
          const applies =
            (c.getAttribute("appliesto") || c.getAttribute("origin") || "mq-comment").trim() ||
            "mq-comment";
          pushItem(items, "mq-comment", applies, t);
        });
    }
  }

  const metaEl = Array.from(tu.getElementsByTagName("*")).find(
    (n) => n.localName === "tunit-metadata",
  );
  if (metaEl) {
    Array.from(metaEl.getElementsByTagName("*"))
      .filter((n) => n.localName === "mark")
      .forEach((mark) => {
        const id = mark.getAttribute("id") || "";
        const contentEl = Array.from(mark.childNodes).find(
          (n) => n.nodeType === 1 && n.localName === "content",
        );
        const t = (contentEl ? contentEl.textContent : mark.textContent || "").trim();
        if (!t) return;
        pushItem(items, "phrase-mark", id ? `mark-${id}` : "mark", t);
      });
  }

  return normalizeMetaItems(items);
}

/**
 * XLIFF 2.0 &lt;unit&gt;
 * @param {Element} unit
 * @returns {MetaItem[]}
 */
export function collectFromXliff2Unit(unit) {
  const items = [];
  if (!unit || unit.nodeType !== 1) return items;
  const uid = (unit.getAttribute("id") || "").trim();
  if (uid) pushItem(items, "attr", "id", uid);
  const name = (unit.getAttribute("name") || "").trim();
  if (name) pushItem(items, "attr", "name", name);

  Array.from(unit.getElementsByTagName("note")).forEach((n) => {
    const t = (n.textContent || "").trim();
    if (!t) return;
    const cat = (n.getAttribute("category") || n.getAttribute("id") || "note").trim() || "note";
    pushItem(items, "note", cat, t);
  });

  return normalizeMetaItems(items);
}

/**
 * 前 N 句彙總 item 種類與範例值（對應視窗用）。
 * @param {Array<{ metaItems?: MetaItem[] }>} segments
 * @param {number} [sampleSize=20]
 */
export function summarizeMetaItemKinds(segments, sampleSize) {
  const n = Math.max(1, sampleSize == null ? 20 : sampleSize);
  const map = new Map();
  const list = Array.isArray(segments) ? segments.slice(0, n) : [];
  for (const seg of list) {
    const items = normalizeMetaItems(seg && seg.metaItems);
    for (const it of items) {
      const k = itemKey(it);
      let entry = map.get(k);
      if (!entry) {
        entry = {
          key: k,
          sourceType: it.sourceType,
          name: it.name,
          sampleValues: [],
          count: 0,
        };
        map.set(k, entry);
      }
      entry.count += 1;
      if (entry.sampleValues.length < 3 && !entry.sampleValues.includes(it.value)) {
        entry.sampleValues.push(it.value);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export const MetaItemsCollector = {
  itemKey,
  normalizeMetaItems,
  collectFromTransUnit,
  collectFromXliff2Unit,
  summarizeMetaItemKinds,
};

if (typeof globalThis !== "undefined") {
  globalThis.MetaItemsCollector = MetaItemsCollector;
}

export default MetaItemsCollector;
