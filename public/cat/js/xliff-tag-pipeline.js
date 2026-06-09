/**
 * XLIFF / mqxliff：標籤擷取、損壞譯文修復、target 寫回、匯出下載
 *
 * 【CRITICAL — 勿隨意刪改】memoQ 大檔 + QA 已驗證。
 * 說明：docs/XLIFF_TAG_EXPORT.md ｜ Cursor：.cursor/rules/xliff-tag-export.mdc
 *
 * 以 IIFE 掛在 window.CatToolXliffTags，供 app.js（非 module）載入後使用。
 */
(function (window, document) {
    'use strict';

    /**
     * 解析 XML 節點內容，將行內標籤轉為 {N}/{/N} 佔位符。
     *
     * @param {Element} xmlNode
     * @param {object} [opts]
     * @param {boolean} [opts.transparentG=false]
     *   true：將 <g> 視為透明容器（不建立佔位符），適用於 sdlxliff
     *         ── SDL Trados 的 <g> 是文件結構包裝，翻譯者不需要看到它；
     *            匯出時由 _updateSdlxliffMrkContent 保留原始 <g>/<mrk> 結構。
     */
    /**
     * 階段 C：memoQ `<mq:ch />` 僅覆寫 pill 用 meaningfulRaw（不影響 xml 序列化）。
     * 先嘗試 tc 窄正則；若 tc 為空但 ph/it/x 內含巢狀 `ch` 元素，則以 `val` 屬性比對（換行／Tab／NBSP）。
     */
    function findFirstMemoQChElement(container) {
        if (!container || container.nodeType !== 1) return null;
        const list = container.getElementsByTagName('*');
        for (let i = 0; i < list.length; i++) {
            if (list[i].localName === 'ch') return list[i];
        }
        return null;
    }

    function maybeMemoQChDisplayOnly(tc, meaningfulRaw, opts) {
        const hadDisplayText = !!(opts && opts.hadDisplayText);
        const hadEquivText = !!(opts && opts.hadEquivText);
        if (hadDisplayText || hadEquivText) return meaningfulRaw;
        const t = typeof tc === 'string' ? tc : '';
        // 字面 tc 為整段 `<mq:ch … />`（少見但與計畫正則一致）
        if (/^<(?:[\w-]+:)?ch\s+val="(?:\r\n|\n|\r)"\s*\/>$/.test(t)) return '↵ 換行';
        if (/^<(?:[\w-]+:)?ch\s+val="\t"\s*\/>$/.test(t)) return '→ Tab';
        if (/^<(?:[\w-]+:)?ch\s+val="\u00A0"\s*\/>$/.test(t)) return '[NBSP]';
        const el = opts && opts.phElement;
        const chEl = el && el.nodeType === 1 ? findFirstMemoQChElement(el) : null;
        if (chEl) {
            const v = chEl.getAttribute('val');
            if (v != null && v !== '') {
                if (v === '\t') return '→ Tab';
                if (v === '\u00A0') return '[NBSP]';
                if (/^(?:\r\n|\n|\r)$/.test(v)) return '↵ 換行';
            }
        }
        return meaningfulRaw;
    }

    function extractTaggedText(xmlNode, { transparentG = false } = {}) {
        const tags = [];
        let counter = 0;
        const bptMap = {};
        /** XLIFF bpt/ept 成對：memoQ 常用 id 與 rid 分離，close 的 id 常對不到 open，改以 rid 對應 bpt 的 counter。 */
        const ridMap = {};

        function shallowOpenXml(el) {
            const clone = el.cloneNode(false);
            const raw = new XMLSerializer().serializeToString(clone);
            return raw.endsWith('/>') ? raw.slice(0, -2) + '>' : raw.replace(/<\/[^>]+>$/, '');
        }

        function processNode(node) {
            let text = '';
            for (const child of Array.from(node.childNodes)) {
                if (child.nodeType === 3) {
                    text += child.nodeValue;
                    continue;
                }
                if (child.nodeType !== 1) continue;
                const ln = child.localName;

                if (ln === 'ph' || ln === 'it' || ln === 'x') {
                    counter++;
                    const ph = `{${counter}}`;
                    const dtAttr = child.getAttribute('displaytext');
                    const eqAttr = child.getAttribute('equiv-text');
                    const ctypeDisplay = child.getAttribute('ctype') || child.getAttribute('type') || '';
                    const hadDisplayText = dtAttr != null && dtAttr !== '';
                    const hadEquivText = !hadDisplayText && eqAttr != null && eqAttr !== '';
                    let meaningfulRaw;
                    if (hadDisplayText) {
                        meaningfulRaw = (dtAttr !== '{}') ? dtAttr : ctypeDisplay;
                    } else if (hadEquivText) {
                        meaningfulRaw = eqAttr;
                    } else {
                        const tc = child.textContent || '';
                        meaningfulRaw = (tc && tc !== '{}' && tc !== '{0}') ? tc : ctypeDisplay;
                    }
                    meaningfulRaw = maybeMemoQChDisplayOnly(child.textContent || '', meaningfulRaw, {
                        hadDisplayText,
                        hadEquivText,
                        phElement: child
                    });
                    const display = meaningfulRaw.length > 25 ? meaningfulRaw.substring(0, 25) + '…' : meaningfulRaw || ph;
                    const xml = new XMLSerializer().serializeToString(child);
                    tags.push({ ph, xml, display, type: 'standalone', pairNum: counter, num: counter });
                    text += ph;
                } else if (ln === 'bpt') {
                    counter++;
                    const id = child.getAttribute('id') || child.getAttribute('i') || String(counter);
                    bptMap[id] = counter;
                    const ridBpt = child.getAttribute('rid') || '';
                    if (ridBpt) ridMap[ridBpt] = counter;
                    const ph = `{${counter}}`;
                    const dtBpt = child.getAttribute('displaytext');
                    const eqBpt = child.getAttribute('equiv-text');
                    const ctypeBpt = child.getAttribute('ctype') || child.getAttribute('type') || '';
                    let meaningfulBpt;
                    if (dtBpt != null && dtBpt !== '') {
                        meaningfulBpt = (dtBpt !== '{}') ? dtBpt : ctypeBpt;
                    } else if (eqBpt != null && eqBpt !== '') {
                        meaningfulBpt = eqBpt;
                    } else {
                        const tc = child.textContent || '';
                        meaningfulBpt = (tc && tc !== '{}' && tc !== '{0}') ? tc : ctypeBpt;
                    }
                    const display = meaningfulBpt.length > 25 ? meaningfulBpt.substring(0, 25) + '…' : meaningfulBpt || `<${counter}>`;
                    const xml = new XMLSerializer().serializeToString(child);
                    tags.push({ ph, xml, display, type: 'open', pairNum: counter, num: counter });
                    text += ph;
                } else if (ln === 'ept') {
                    const id = child.getAttribute('id') || child.getAttribute('i') || '';
                    const ridEpt = child.getAttribute('rid') || '';
                    const num = bptMap[id] !== undefined
                        ? bptMap[id]
                        : (ridEpt && ridMap[ridEpt] !== undefined ? ridMap[ridEpt] : ++counter);
                    const ph = `{/${num}}`;
                    const dtEpt = child.getAttribute('displaytext');
                    const eqEpt = child.getAttribute('equiv-text');
                    const ctypeEpt = child.getAttribute('ctype') || child.getAttribute('type') || '';
                    let meaningfulEpt;
                    if (dtEpt != null && dtEpt !== '') {
                        meaningfulEpt = (dtEpt !== '{}') ? dtEpt : ctypeEpt;
                    } else if (eqEpt != null && eqEpt !== '') {
                        meaningfulEpt = eqEpt;
                    } else {
                        const tc = child.textContent || '';
                        meaningfulEpt = (tc && tc !== '{}' && tc !== '{0}') ? tc : ctypeEpt;
                    }
                    const display = meaningfulEpt.length > 25 ? meaningfulEpt.substring(0, 25) + '…' : meaningfulEpt || `</${num}>`;
                    const xml = new XMLSerializer().serializeToString(child);
                    tags.push({ ph, xml, display, type: 'close', pairNum: num, num });
                    text += ph;
                } else if (ln === 'g') {
                    if (transparentG) {
                        // sdlxliff 模式：<g> 為文件結構包裝，直接遞迴子節點，不建立佔位符
                        text += processNode(child);
                    } else {
                        counter++;
                        const num = counter;
                        const ph = `{${num}}`;
                        const phClose = `{/${num}}`;
                        const openXml = shallowOpenXml(child);
                        const closeXml = `</${child.tagName}>`;
                        tags.push({ ph, xml: openXml, display: `<${child.tagName}>`, type: 'open', pairNum: num, num });
                        text += ph;
                        text += processNode(child);
                        tags.push({ ph: phClose, xml: closeXml, display: `</${child.tagName}>`, type: 'close', pairNum: num, num });
                        text += phClose;
                    }
                } else {
                    text += processNode(child);
                }
            }
            return text;
        }

        const text = processNode(xmlNode).trim();
        return { text, tags };
    }

    /** memoQ 常同時使用 &lt;ph&gt; 與 &lt;it&gt;；僅收 ph 會漏掉 it，導致 &lt;it 殘段無法還原。 */
    function orderedInlineSourceTags(tags) {
        return (tags || [])
            .filter(t => t && t.xml && /^(<ph\b|<it\b)/i.test(String(t.xml)))
            .sort((a, b) =>
                (parseInt(String(a.ph).replace(/\D/g, ''), 10) || 0) -
                (parseInt(String(b.ph).replace(/\D/g, ''), 10) || 0));
    }

    /** 匯入／編輯流程若把 tag.xml 存成 entity 字串（&lt; 開頭），還原前解一層或多層。 */
    function decodeLeadingEntityEncodedMarkup(xml) {
        if (typeof xml !== 'string' || !/^&lt;/.test(xml)) return xml;
        let s = collapseAmpEntitiesRepeated(xml);
        for (let i = 0; i < 10 && /^&lt;/.test(s); i++) {
            const ta = document.createElement('textarea');
            ta.innerHTML = s;
            const next = ta.value;
            if (next === s) break;
            s = next;
        }
        return s;
    }

    /**
     * memoQ 的 &lt;it&gt; 多為自閉合 …/&gt;。若用「第一個 &gt;」結尾，會誤判 val="&lt;EmphA&gt;" 內的 &gt;。
     * 非自閉合時再補第二段（較少見）。
     */
    const RE_ENCODED_IT_SELF_CLOSE = /&lt;it\b[\s\S]*?\/&gt;/gi;
    const RE_ENCODED_IT_NON_SELF_CLOSE = /&lt;it\b[\s\S]*?pos="open"[\s\S]*?(?:\/&gt;|&gt;|>)/gi;

    function replaceEncodedItWithPlaceholders(str, orderedTags) {
        if (!str || !/&lt;it\b/i.test(str)) return str;
        let idx = 0;
        let s = str.replace(RE_ENCODED_IT_SELF_CLOSE, () => {
            const tag = orderedTags[idx++];
            return tag ? tag.ph : '';
        });
        if (!/&lt;it\b/i.test(s)) return s;
        return s.replace(RE_ENCODED_IT_NON_SELF_CLOSE, () => {
            const tag = orderedTags[idx++];
            return tag ? tag.ph : '';
        });
    }

    function replaceEncodedItWithSourceXml(str, orderedTags) {
        if (!str || !/&lt;it\b/i.test(str)) return str;
        let idx = 0;
        let s = str.replace(RE_ENCODED_IT_SELF_CLOSE, () => {
            const tag = orderedTags[idx++];
            return tag ? tag.xml : '';
        });
        if (!/&lt;it\b/i.test(s)) return s;
        return s.replace(RE_ENCODED_IT_NON_SELF_CLOSE, () => {
            const tag = orderedTags[idx++];
            return tag ? tag.xml : '';
        });
    }

    function replacePlaceholders(text, tags, fallbackTags = []) {
        if (!text || !tags || !tags.length) return text;
        const map = {};
        tags.forEach(t => { map[t.ph] = t; });
        const fallbackMap = {};
        (fallbackTags || []).forEach(t => { fallbackMap[t.ph] = t; });

        function normalizeXml(tagEntry) {
            if (!tagEntry) return undefined;
            let xml = tagEntry.xml;
            if (xml === undefined) return undefined;
            if (typeof xml === 'string' && /^&lt;/.test(xml)) {
                xml = decodeLeadingEntityEncodedMarkup(xml);
            }
            if (/^<\//.test(xml) || xml === '</>') {
                return xml.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            return xml;
        }

        return text.replace(/\{\/?\d+\}|\{\d+>|<\d+\}/g, m => {
            const preferred = normalizeXml(map[m]);
            if (preferred !== undefined) return preferred;
            const fallback = normalizeXml(fallbackMap[m]);
            if (fallback !== undefined) return fallback;
            return m;
        });
    }

    function collapseAmpEntitiesRepeated(str, maxPass = 12) {
        if (!str || typeof str !== 'string') return str;
        let s = str;
        for (let i = 0; i < maxPass; i++) {
            if (!s.includes('&amp;')) break;
            const next = s.replace(/&amp;/g, '&');
            if (next === s) break;
            s = next;
        }
        return s;
    }

    function phInnerMatchVariants(inner) {
        if (!inner) return [];
        const set = new Set();
        const ta = document.createElement('textarea');

        const addChain = s => {
            if (!s) return;
            let cur = s;
            set.add(cur);

            let ampCur = cur;
            for (let j = 0; j < 12 && ampCur.includes('&amp;'); j++) {
                ampCur = ampCur.replace(/&amp;/g, '&');
                set.add(ampCur);
            }

            for (let i = 0; i < 12; i++) {
                ta.innerHTML = cur;
                const next = ta.value;
                set.add(next);

                let amp = next;
                for (let j = 0; j < 10 && amp.includes('&amp;'); j++) {
                    amp = amp.replace(/&amp;/g, '&');
                    set.add(amp);
                }

                if (next === cur) break;
                cur = next;
            }
        };

        addChain(inner);

        let collapsed = inner;
        for (let j = 0; j < 8 && collapsed.includes('&amp;'); j++) {
            collapsed = collapsed.replace(/&amp;/g, '&');
            if (!set.has(collapsed)) addChain(collapsed);
        }

        if (/&quot;/.test(inner)) {
            addChain(inner.replace(/&quot;/g, '"'));
        }
        if (/"[^"]*&amp;/.test(inner)) {
            addChain(inner.replace(/"/g, '&quot;'));
        }

        return [...set].filter(Boolean);
    }

    const RE_PHRASE_PLACEHOLDER_PH = /\{\/?\d+\}|\{\d+>|<\d+\}/g;
    const RE_PHRASE_PLACEHOLDER_TOKEN = /^(?:\{\/?\d+\}|\{\d+>|<\d+\})$/;

    function isPhrasePlaceholderToken(s) {
        return typeof s === 'string' && RE_PHRASE_PLACEHOLDER_TOKEN.test(s);
    }

    /** Phrase m:mark 洩漏進譯文時，匯出前還原為 {N} 字面量（含多重 &amp; 與 display 變體）。 */
    function phraseMarkLeakVariants(tag) {
        const set = new Set();
        if (!tag) return [];
        const ph = tag.ph != null ? String(tag.ph) : '';
        [tag.xml, tag.display].filter(Boolean).forEach(raw => {
            const s = String(raw);
            if (!s || s === ph) return;
            phInnerMatchVariants(s).forEach(v => { if (v && v !== ph) set.add(v); });
            let decoded = s;
            for (let i = 0; i < 8 && decoded.includes('&amp;'); i++) {
                decoded = decoded.replace(/&amp;/g, '&');
            }
            decoded = decoded.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
            if (decoded && decoded !== ph) {
                phInnerMatchVariants(decoded).forEach(v => { if (v && v !== ph) set.add(v); });
            }
        });
        return [...set].filter(v => v && v !== ph);
    }

    function repairMxliffMarkLeaksInText(text, tags) {
        if (!text || !tags || !tags.length) return text;
        let normalized = collapseAmpEntitiesRepeated(text);
        const sorted = [...tags].sort((a, b) => (a.num || 0) - (b.num || 0));
        const byVariant = new Map();
        sorted.forEach(tag => {
            phraseMarkLeakVariants(tag).forEach(v => {
                if (!byVariant.has(v)) byVariant.set(v, []);
                const list = byVariant.get(v);
                if (!list.some(x => x.ph === tag.ph)) list.push(tag);
            });
        });
        [...byVariant.keys()].sort((a, b) => b.length - a.length).forEach(v => {
            const tagList = byVariant.get(v).sort((a, b) => (a.num || 0) - (b.num || 0));
            tagList.forEach(tag => {
                const ph = tag.ph;
                if (!ph || !normalized.includes(v)) return;
                normalized = normalized.replace(v, ph);
            });
        });
        return normalized;
    }

    function longestCommonPrefixLen(a, b) {
        const x = String(a || '');
        const y = String(b || '');
        let i = 0;
        while (i < x.length && i < y.length && x[i] === y[i]) i++;
        return i;
    }

    /** 前綴字面尾端錨點（如「解鎖」「獎勵章節」），用於在譯文中切出開標前的內文區段。 */
    function mxliffPrefixAnchorSuffix(prefixLiteral) {
        const s = String(prefixLiteral || '').trimEnd();
        if (!s) return '';
        const tail = s.slice(-Math.min(8, s.length));
        const m = tail.match(/[\u4e00-\u9fff]{2,8}$/);
        return m ? m[0] : tail.slice(-4);
    }

    function splitByPhrasePlaceholder(text) {
        return String(text || '').split(/(\{\/?\d+\}|\{\d+>|<\d+\})/g).filter(s => s !== '');
    }

    function findTagByPh(tags, ph) {
        if (!tags || !ph) return null;
        return tags.find(t => t && String(t.ph) === String(ph)) || null;
    }

    /** 僅當 open/close 為同一 pairNum 的色標對（非任意相鄰 {N}）。 */
    function isMxliffOpenClosePair(openPh, closePh, tags) {
        const openTag = findTagByPh(tags, openPh);
        const closeTag = findTagByPh(tags, closePh);
        if (!openTag || !closeTag) return false;
        if (openTag.type !== 'open' || closeTag.type !== 'close') return false;
        if (openTag.pairNum == null || closeTag.pairNum == null) return false;
        return openTag.pairNum === closeTag.pairNum;
    }

    function collapseDuplicatePhrasePlaceholders(text) {
        if (!text || typeof text !== 'string') return text;
        let s = text;
        for (let pass = 0; pass < 8; pass++) {
            const next = s.replace(/(\{\/?\d+\}|\{\d+>|<\d+\})\1+/g, '$1');
            if (next === s) break;
            s = next;
        }
        return s;
    }

    /** 缺開標、譯文已有關標時，在關標前補開標（不重組整段 orig 骨架）。 */
    function insertMissingMxliffOpenPlaceholders(text, tags) {
        if (!text || !tags || !tags.length) return text;
        let out = text;
        const opens = tags.filter(t => t && t.type === 'open').sort((a, b) => (a.num || 0) - (b.num || 0));
        for (const tag of opens) {
            const ph = tag.ph != null ? String(tag.ph) : '';
            if (!ph || out.includes(ph)) continue;
            const closeTag = tags.find(t =>
                t && t.type === 'close' && t.pairNum != null && t.pairNum === tag.pairNum
            );
            const closePh = closeTag && closeTag.ph ? String(closeTag.ph) : `{${(tag.num || 0) + 1}}`;
            if (!closePh || !out.includes(closePh)) continue;
            out = out.split(closePh).join(ph + closePh);
        }
        return out;
    }

    /**
     * 依原始檔 <target> 的 {N} 骨架，從使用者譯文（可能缺開標、含 mark 洩漏）重組匯出用字串。
     * 僅處理 sourceTags 驗證的 open/close 色標對；不把 {1} 與 {4} 等 standalone 佔位誤當一對。
     */
    function rebuildMxliffTargetFromOriginalStructure(origTarget, userText, tags) {
        const orig = String(origTarget || '').trim();
        if (!orig) return userText;
        const parts = splitByPhrasePlaceholder(orig);
        if (!parts.length) return userText;
        let u = String(userText || '');
        let out = '';
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (isPhrasePlaceholderToken(p)) {
                out += p;
                if (u.startsWith(p)) u = u.slice(p.length);
                continue;
            }
            const openPh = parts[i + 1];
            const innerOrig = parts[i + 2];
            const closePh = parts[i + 3];
            const isPairBlock = openPh && isPhrasePlaceholderToken(openPh)
                && innerOrig && !isPhrasePlaceholderToken(innerOrig)
                && closePh && isPhrasePlaceholderToken(closePh)
                && isMxliffOpenClosePair(openPh, closePh, tags);
            if (isPairBlock) {
                const closeIdx = u.indexOf(closePh);
                if (closeIdx !== -1) {
                    const userBeforeClose = u.slice(0, closeIdx);
                    const anchor = mxliffPrefixAnchorSuffix(p);
                    const anchorIdx = anchor ? userBeforeClose.lastIndexOf(anchor) : -1;
                    const innerStart = anchorIdx !== -1
                        ? anchorIdx + anchor.length
                        : longestCommonPrefixLen(p, userBeforeClose);
                    const inner = userBeforeClose.slice(innerStart);
                    if (!inner.startsWith(openPh)) {
                        out += userBeforeClose.slice(0, innerStart) + openPh + inner;
                    } else {
                        out += userBeforeClose.slice(0, innerStart) + inner;
                    }
                    out += closePh;
                    u = u.slice(closeIdx + closePh.length);
                    i += 3;
                    continue;
                }
            }
            const lcp = longestCommonPrefixLen(p, u);
            if (lcp > 0) {
                out += u.slice(0, lcp);
                u = u.slice(lcp);
            } else if (!isPhrasePlaceholderToken(p)) {
                out += p;
            }
        }
        if (u) out += u;
        return out;
    }

    function repairMxliffTargetForExport(userText, sourceText, origTarget, tags) {
        let text = repairMxliffMarkLeaksInText(userText || '', tags);
        const required = (sourceText || '').match(RE_PHRASE_PLACEHOLDER_PH) || [];
        const orig = String(origTarget || '').trim();
        const tagList = tags || [];
        if (required.length && orig && !required.every(ph => text.includes(ph))) {
            text = rebuildMxliffTargetFromOriginalStructure(orig, text, tagList);
        }
        if (required.length && !required.every(ph => text.includes(ph))) {
            text = insertMissingMxliffOpenPlaceholders(text, tagList);
        }
        return collapseDuplicatePhrasePlaceholders(text);
    }

    function normalizeLegacyEncodedTagText(text, tags) {
        if (!text || !tags || !tags.length) return text;
        let normalized = collapseAmpEntitiesRepeated(text);
        const phEntries = [];
        tags.forEach(t => {
            const xml = t && t.xml ? String(t.xml) : '';
            const m = xml.match(/^<ph\b[^>]*>([\s\S]*)<\/ph>$/i);
            if (!m || !m[1]) return;
            phEntries.push({ ph: t.ph, variants: phInnerMatchVariants(m[1]) });
        });
        phEntries.forEach(({ ph, variants }) => {
            variants.sort((a, b) => b.length - a.length);
            variants.forEach(v => {
                if (!v || !normalized.includes(v)) return;
                normalized = normalized.split(v).join(ph);
            });
        });

        if (/&lt;it\b/i.test(normalized)) {
            normalized = replaceEncodedItWithPlaceholders(normalized, orderedInlineSourceTags(tags));
        }
        return normalized;
    }

    function escapeMemoqBareCloseForXmlParse(fragment) {
        if (!fragment || typeof fragment !== 'string') return fragment;
        return fragment.replace(/&lt;\/&gt;/g, '&amp;lt;/&amp;gt;');
    }

    /**
     * restoredXml 內純文字夾帶的尖括號（遊戲標記如 <AI>、規格如 <50GB）不是合法 XLIFF 元素，
     * 會造成 DOMParser 解析失敗。僅將「非 XLIFF／命名空間 tag 開頭」的 < 轉成 &lt;，
     * 勿用 /<([^>]*)>/g 整段匹配（內文 < 緊鄰 <ept> 時會誤 escape 真實 tag）。
     */
    function escapeNonXliffAngleBrackets(fragment) {
        if (!fragment || typeof fragment !== 'string') return fragment;
        const xliffTagOpen = /^(?:\/?(?:ph|bpt|ept|it|g|x|mrk|_wrap)\b|[\w-]+:[\w-])/;
        return fragment.replace(/</g, (ch, offset, whole) => {
            const tail = whole.slice(offset + 1);
            if (tail.startsWith('!--') || tail.startsWith('?')) return ch;
            if (xliffTagOpen.test(tail)) return ch;
            return '&lt;';
        });
    }

    /**
     * Bug #9：bpt/ept/ph 內 memoQ 雙層實體（&amp;lt;、&amp;quot;）不可經 collapseAmpEntitiesRepeated 展開，
     * 否則 setXmlTargetContent 再解碼一層會產生 href 裸引號，memoQ 無法匯入。
     */
    function shouldSkipAmpCollapseForMemoqInline(fragment) {
        if (!fragment || typeof fragment !== 'string') return false;
        if (!/<(?:bpt|ept|ph)\b/i.test(fragment)) return false;
        return /&amp;(?:lt|quot|gt);/i.test(fragment);
    }

    function prepareRestoredFragmentForXmlParse(restoredXml) {
        if (!restoredXml || typeof restoredXml !== 'string') return restoredXml;
        let s = restoredXml;
        if (!shouldSkipAmpCollapseForMemoqInline(s)) {
            s = collapseAmpEntitiesRepeated(s);
        }
        s = escapeMemoqBareCloseForXmlParse(s);
        s = escapeNonXliffAngleBrackets(s);
        return s;
    }

    function tryHtmlEntityDecodeLoop(s, maxPass = 4) {
        if (!s || typeof s !== 'string') return s;
        let cur = s;
        for (let i = 0; i < maxPass; i++) {
            const ta = document.createElement('textarea');
            ta.innerHTML = cur;
            const next = ta.value;
            if (next === cur) break;
            cur = next;
        }
        return cur;
    }

    function isXliffExportDebug() {
        try {
            if (typeof window !== 'undefined' && window.CatToolXliffTags && window.CatToolXliffTags.debugXliffExport) {
                return true;
            }
            return typeof window !== 'undefined' && window.localStorage &&
                window.localStorage.getItem('catToolDebugXliffExport') === '1';
        } catch (_) {
            return false;
        }
    }

    /** 解析完全失敗時，至少清掉偽裝成文字的 &lt;it / &lt;ph，避免 memoQ 出現整段 escape 字面量。 */
    function fallbackPlainTextFromCorruptFragment(restoredXml) {
        if (!restoredXml || typeof restoredXml !== 'string') return '';
        let s = restoredXml;
        s = s.replace(/&lt;\/?it\b[\s\S]*?(?:\/&gt;|&gt;|>)/gi, '');
        s = s.replace(/&lt;\/?ph\b[\s\S]*?(?:\/&gt;|&gt;|>)/gi, '');
        s = s.replace(/<\/?it\b[^>]*>/gi, '');
        s = s.replace(/<\/?ph\b[^>]*>/gi, '');
        s = s.replace(/<[^>]*>/g, '');
        return s;
    }

    function setXmlTargetContent(xmlDoc, targetNode, restoredXml, options) {
        const parser = new DOMParser();
        const rootNs = xmlDoc.documentElement;
        const mqNsUri = rootNs.lookupNamespaceURI('mq') || 'memoQ';
        const sdlNsUri = rootNs.lookupNamespaceURI('sdl') || 'http://sdl.com/FileTypes/SdlXliff/1.0';
        const wrapOpen = `<_wrap xmlns:mq="${mqNsUri}" xmlns:sdl="${sdlNsUri}">`;

        while (targetNode.firstChild) targetNode.removeChild(targetNode.firstChild);

        const tryParse = (inner) => {
            const doc = parser.parseFromString(`${wrapOpen}${inner}</_wrap>`, 'application/xml');
            const err = doc.getElementsByTagName('parsererror')[0];
            return { doc, err: !!err, parsererror: err || null };
        };

        let prepared = prepareRestoredFragmentForXmlParse(restoredXml);
        let attempt = tryParse(prepared);
        let tempDoc = attempt.doc;
        let err = attempt.err;

        if (err && /&(?![a-zA-Z]{2,8};|#)/.test(prepared)) {
            const escapedAmp = prepared.replace(/&(?![a-zA-Z]{2,8};|#)/g, '&amp;');
            const second = tryParse(escapedAmp);
            if (!second.err) {
                tempDoc = second.doc;
                err = false;
            }
        }

        if (err) {
            const decoded = prepareRestoredFragmentForXmlParse(tryHtmlEntityDecodeLoop(restoredXml));
            const third = tryParse(decoded);
            if (!third.err) {
                tempDoc = third.doc;
                err = false;
            } else {
                prepared = decoded;
            }
        }

        if (err && isXliffExportDebug()) {
            const pe = attempt.parsererror;
            console.warn('[CatTool XLIFF] setXmlTargetContent 解析失敗', {
                tuId: options && options.tuId,
                snippet: (prepared || '').slice(0, 400),
                parsererror: pe ? pe.textContent : ''
            });
        }

        if (err) {
            console.warn('setXmlTargetContent: XML 解析失敗，退回純文字；請檢查譯文是否含非法 XML / 裸 </> 等。');
            targetNode.textContent = fallbackPlainTextFromCorruptFragment(restoredXml);
        } else {
            Array.from(tempDoc.documentElement.childNodes).forEach(child => {
                targetNode.appendChild(xmlDoc.importNode(child, true));
            });
        }
    }

    /**
     * 匯出寫入譯文：有 inline tag 元數據時以 XML 片段解析寫入；**零 tag 時**一律用 textContent，
     * 避免內文純文字如 `<input .../>` 被當成 XML 元素導致匯出後消失或行為異常（Bug #2）。
     */
    function setExportTargetPlainOrFragment(xmlDoc, targetNode, restoredXml, options, tagsForWrite) {
        const hasTags = Array.isArray(tagsForWrite) && tagsForWrite.length > 0;
        if (!hasTags) {
            while (targetNode.firstChild) targetNode.removeChild(targetNode.firstChild);
            if (restoredXml != null && String(restoredXml) !== '') {
                targetNode.textContent = String(restoredXml);
            }
            return;
        }
        setXmlTargetContent(xmlDoc, targetNode, restoredXml, options);
    }

    /**
     * 若匯出時 **target 無行內 tag 中繫**，僅有 source 的 ph，但**譯文內沒有 {N} 佔位**，
     * 則 replace 後的內文多為**裸** `<`…`/>` 純字串，不可再走 XML 片段寫入（與全零 tag 的 Bug#2 同因）。
     */
    function usePlainTextForExportTarget(seg) {
        if (!seg) return true;
        if (seg.targetTags && seg.targetTags.length) return false;
        if (!seg.sourceTags || !seg.sourceTags.length) return true;
        return !/\{\d+>|<\d+\}|\{[\/]?\d+\}/.test(String(seg.targetText || ''));
    }

    function tagsForExportWrite(seg, tags) {
        return usePlainTextForExportTarget(seg) ? [] : tags;
    }

    function updateMqxliffStatus(tu, seg, mqNsUri) {
        let mqStatus;
        if (seg.status === 'confirmed') {
            const role = seg.confirmationRole || seg.originalRole || 'T';
            if (role === 'R2') mqStatus = 'Proofread';
            else if (role === 'R1') mqStatus = 'Reviewer1Confirmed';
            else mqStatus = 'ManuallyConfirmed';
        } else if (seg.targetText && seg.targetText.trim()) {
            mqStatus = 'PartiallyEdited';
        } else {
            mqStatus = 'NotStarted';
        }
        try {
            tu.setAttributeNS(mqNsUri, 'mq:status', mqStatus);
        } catch (_) {
            tu.setAttribute('mq:status', mqStatus);
        }
    }

    /**
     * sdlxliff 專用：保留 <g> 和 <mrk mtype="seg"> 的原有結構，只更新 mrk 的文字內容。
     * @returns {boolean} true 表示已處理；false 表示無 mrk，呼叫方需 fallback。
     */
    function _updateSdlxliffMrkContent(xmlDoc, tu, targetNode, seg, tags) {
        const allMrk = Array.from(targetNode.getElementsByTagName('mrk'));
        const mrkSegs = allMrk.filter(m => m.getAttribute('mtype') === 'seg');
        if (mrkSegs.length === 0) return false;

        // 還原內嵌標籤（ph、bpt/ept、g 等）
        const content = seg.targetText || '';
        const repaired = normalizeLegacyEncodedTagText(content, seg.sourceTags || []);
        let restored = replacePlaceholders(repaired, tags, seg.sourceTags || []);
        if (/&lt;it\b/i.test(restored)) {
            restored = replaceEncodedItWithSourceXml(restored, orderedInlineSourceTags(seg.sourceTags || []));
        }
        const tagsForWrite = tagsForExportWrite(seg, tags);
        if (tagsForWrite.length > 0) {
            restored = prepareRestoredFragmentForXmlParse(restored);
        }

        if (mrkSegs.length === 1) {
            const mrk = mrkSegs[0];
            while (mrk.firstChild) mrk.removeChild(mrk.firstChild);
            if (restored.trim()) {
                setExportTargetPlainOrFragment(xmlDoc, mrk, restored, { tuId: tu.getAttribute('id') || '' }, tagsForWrite);
            }
            return true;
        }

        // 多個 mrk（一個 TU 包含多個句段）：全部清空，譯文放入第一個 mrk
        mrkSegs.forEach(mrk => { while (mrk.firstChild) mrk.removeChild(mrk.firstChild); });
        if (restored.trim()) {
            setExportTargetPlainOrFragment(xmlDoc, mrkSegs[0], restored, { tuId: tu.getAttribute('id') || '' }, tagsForWrite);
        }
        return true;
    }

    function normalizeMqxliffLookupLines(idValue) {
        if (idValue == null) return [];
        const normalized = String(idValue).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        return normalized.split('\n').map(l => l.trim()).filter(Boolean);
    }

    function createExportSegmentLookup() {
        return { byTuId: new Map(), byAux: new Map() };
    }

    function exportLookupGet(lookup, key) {
        const k = key != null ? String(key).trim() : '';
        if (!k) return null;
        if (lookup.byTuId.has(k)) return lookup.byTuId.get(k);
        if (lookup.byAux.has(k)) return lookup.byAux.get(k);
        return null;
    }

    function exportLookupHas(lookup, key) {
        const k = key != null ? String(key).trim() : '';
        return !!k && (lookup.byTuId.has(k) || lookup.byAux.has(k));
    }

    /**
     * 匯出查找：xliffTuId 進 byTuId（可覆寫）；僅無 xliffTuId 的舊句段才用 idValue 進 byAux。
     * 不註冊 globalId／rowIdx，避免與 Key 數字撞鍵（見 bug-report_mqxliff-export-lookup-key-collision_2026-06.md）。
     */
    function registerSegmentExportKeys(seg, lookup) {
        if (!seg || !lookup) return;
        const tuId = seg.xliffTuId != null ? String(seg.xliffTuId).trim() : '';
        if (tuId) lookup.byTuId.set(tuId, seg);
        if (tuId) return;

        const putAux = (key) => {
            const k = key != null ? String(key).trim() : '';
            if (!k || lookup.byTuId.has(k) || lookup.byAux.has(k)) return;
            lookup.byAux.set(k, seg);
        };
        if (seg.idValue) {
            const fullId = String(seg.idValue).trim();
            putAux(fullId);
            normalizeMqxliffLookupLines(fullId).forEach(putAux);
        }
    }

    function buildSegmentExportLookupMap(segs) {
        const lookup = createExportSegmentLookup();
        (segs || []).forEach(s => registerSegmentExportKeys(s, lookup));
        lookup.get = (key) => exportLookupGet(lookup, key);
        lookup.has = (key) => exportLookupHas(lookup, key);
        return lookup;
    }

    function resolveTransUnitLookupKeys(tu, xmlDoc) {
        const keys = [];
        const add = (v) => {
            const s = v != null ? String(v).trim() : '';
            if (s && !keys.includes(s)) keys.push(s);
        };
        if (!tu) return keys;
        add(tu.getAttribute('id'));
        add(tu.getAttribute('resname'));
        add(tu.getAttribute('mq:unitId'));
        const root = xmlDoc && xmlDoc.documentElement;
        if (root) {
            const mqNs = root.lookupNamespaceURI('mq');
            if (mqNs) {
                try { add(tu.getAttributeNS(mqNs, 'unitId')); } catch (_) { /* ignore */ }
            }
        }
        return keys;
    }

    function lookupSegmentByTuKeys(tu, lookup, xmlDoc) {
        const keys = resolveTransUnitLookupKeys(tu, xmlDoc);
        const primaryTuId = keys[0] || '';
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (lookup.byTuId.has(k)) return lookup.byTuId.get(k);
        }
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const seg = lookup.byAux.get(k);
            if (!seg) continue;
            const xid = seg.xliffTuId != null ? String(seg.xliffTuId).trim() : '';
            if (xid && primaryTuId && xid !== primaryTuId) continue;
            return seg;
        }
        return null;
    }

    function isAmbiguousExportLookup(tu, lookup, xmlDoc) {
        const keys = resolveTransUnitLookupKeys(tu, xmlDoc);
        const primaryTuId = keys[0] || '';
        if (!primaryTuId) return false;
        if (lookup.byTuId.has(primaryTuId)) return false;
        for (let i = 0; i < keys.length; i++) {
            const seg = lookup.byAux.get(keys[i]);
            if (!seg) continue;
            const xid = seg.xliffTuId != null ? String(seg.xliffTuId).trim() : '';
            if (xid && xid !== primaryTuId) return true;
        }
        return false;
    }

    function findSegmentForTransUnit(tu, lookup, format, tuIndex, tuCount, segs, xmlDoc) {
        return lookupSegmentByTuKeys(tu, lookup, xmlDoc);
    }

    /**
     * 匯出前統計 trans-unit 無法對應到句段的數量（與 exportXliffFamilyToBlob 查找邏輯一致）。
     */
    function countXliffExportLookupMisses(xmlDoc, segs, format) {
        if (!xmlDoc || !segs) return { miss: 0, total: 0, ambiguous: 0 };
        const transUnits = Array.from(xmlDoc.getElementsByTagName('trans-unit'));
        const lookup = buildSegmentExportLookupMap(segs);
        let miss = 0;
        let total = 0;
        let ambiguous = 0;

        transUnits.forEach((tu, tuIndex) => {
            const tuId = tu.getAttribute('id');
            if (format === 'sdlxliff' && tuId) {
                const targetNode = tu.getElementsByTagName('target')[0];
                const mrkSegs = targetNode
                    ? Array.from(targetNode.getElementsByTagName('mrk'))
                        .filter(m => m.getAttribute('mtype') === 'seg')
                    : [];
                const firstMid = mrkSegs.length > 0 ? mrkSegs[0].getAttribute('mid') : null;
                const compositeKey = firstMid != null ? `${tuId}#${firstMid}` : null;
                const isMultiSegFormat = compositeKey != null && lookup.has(compositeKey);

                if (isMultiSegFormat && mrkSegs.length > 1) {
                    mrkSegs.forEach(mrk => {
                        total++;
                        const mid = mrk.getAttribute('mid') || '';
                        if (!lookup.get(`${tuId}#${mid}`)) miss++;
                    });
                    return;
                }
            }
            total++;
            if (isAmbiguousExportLookup(tu, lookup, xmlDoc)) ambiguous++;
            if (!findSegmentForTransUnit(tu, lookup, format, tuIndex, transUnits.length, segs, xmlDoc)) {
                miss++;
            }
        });
        return { miss, total, ambiguous };
    }

    async function exportXliffFamilyToBlob(f, segs, format) {
        const decoder = new TextDecoder('utf-8');
        const xmlText = decoder.decode(f.originalFileBuffer);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

        if (xmlDoc.getElementsByTagName('parsererror').length) {
            throw new Error('無法重新解析原始 XML，檔案可能已損毀');
        }

        const transUnits = Array.from(xmlDoc.getElementsByTagName('trans-unit'));
        const mqNsUri = xmlDoc.documentElement.lookupNamespaceURI('mq') || 'memoQ';
        const sdlNsUri = xmlDoc.documentElement.lookupNamespaceURI('sdl') || 'http://sdl.com/FileTypes/SdlXliff/1.0';

        // xliffTuId（byTuId）+ 舊資料 idValue（byAux）；與 countXliffExportLookupMisses 共用
        const segByTuId = buildSegmentExportLookupMap(segs);

        transUnits.forEach((tu, tuIndex) => {
            const tuId = tu.getAttribute('id');

            // ── sdlxliff 多段 TU：以 {tuId}#{mid} 格式逐 mrk 查找並回寫 ──────
            // 新格式（重新匯入後）會在 segByTuId 裡找到 "{tuId}#firstMid"，
            // 舊格式（合併匯入）只有純 tuId，走後面的單段相容邏輯。
            if (format === 'sdlxliff' && tuId) {
                let targetNode = tu.getElementsByTagName('target')[0];
                const mrkSegs = targetNode
                    ? Array.from(targetNode.getElementsByTagName('mrk'))
                        .filter(m => m.getAttribute('mtype') === 'seg')
                    : [];
                const firstMid = mrkSegs.length > 0 ? mrkSegs[0].getAttribute('mid') : null;
                const compositeKey = firstMid != null ? `${tuId}#${firstMid}` : null;
                const isMultiSegFormat = compositeKey != null && segByTuId.has(compositeKey);

                if (isMultiSegFormat && mrkSegs.length > 1) {
                    if (!targetNode) {
                        targetNode = xmlDoc.createElement('target');
                        const sourceNode = tu.getElementsByTagName('source')[0];
                        if (sourceNode && sourceNode.nextSibling) {
                            tu.insertBefore(targetNode, sourceNode.nextSibling);
                        } else {
                            tu.appendChild(targetNode);
                        }
                    }

                    // 逐 mrk 還原各自的譯文
                    mrkSegs.forEach(mrk => {
                        const mid = mrk.getAttribute('mid') || '';
                        const seg = segByTuId.get(`${tuId}#${mid}`);
                        if (!seg) return;

                        const tags = seg.targetTags && seg.targetTags.length ? seg.targetTags : (seg.sourceTags || []);
                        const repairedText = normalizeLegacyEncodedTagText(seg.targetText || '', seg.sourceTags || []);
                        let restoredXml = replacePlaceholders(repairedText, tags, seg.sourceTags || []);
                        if (/&lt;it\b/i.test(restoredXml)) {
                            restoredXml = replaceEncodedItWithSourceXml(restoredXml, orderedInlineSourceTags(seg.sourceTags || []));
                        }
                        restoredXml = prepareRestoredFragmentForXmlParse(restoredXml);

                        while (mrk.firstChild) mrk.removeChild(mrk.firstChild);
                        if (restoredXml.trim()) {
                            setExportTargetPlainOrFragment(xmlDoc, mrk, restoredXml, { tuId: `${tuId}#${mid}` }, tagsForExportWrite(seg, tags));
                        }
                    });

                    // 更新 sdl:seg-defs 各 sdl:seg 的 conf 屬性
                    const segDefsEl = Array.from(tu.getElementsByTagName('*'))
                        .find(n => n.localName === 'seg-defs');
                    if (segDefsEl) {
                        mrkSegs.forEach(mrk => {
                            const mid = mrk.getAttribute('mid') || '';
                            const seg = segByTuId.get(`${tuId}#${mid}`);
                            if (!seg) return;
                            const sdlSeg = Array.from(segDefsEl.getElementsByTagName('*'))
                                .find(n => n.localName === 'seg' && n.getAttribute('id') === mid);
                            if (sdlSeg) {
                                sdlSeg.setAttribute('conf', seg.status === 'confirmed' ? 'Translated' : 'Draft');
                            }
                        });
                    }

                    // target state：有任意句段已確認則標 final
                    const anyConfirmed = mrkSegs.some(mrk => {
                        const seg = segByTuId.get(`${tuId}#${mrk.getAttribute('mid') || ''}`);
                        return seg && seg.status === 'confirmed';
                    });
                    targetNode.setAttribute('state', anyConfirmed ? 'final' : 'needs-translation');

                    return; // 跳過後面的單段邏輯
                }
            }

            // ── 單段邏輯（向下相容：一般 XLIFF / mqxliff / 舊格式 sdlxliff）──
            const seg = findSegmentForTransUnit(tu, segByTuId, format, tuIndex, transUnits.length, segs, xmlDoc);
            if (!seg) return;

            let targetNode = tu.getElementsByTagName('target')[0];
            if (!targetNode) {
                targetNode = xmlDoc.createElement('target');
                const sourceNode = tu.getElementsByTagName('source')[0];
                if (sourceNode && sourceNode.nextSibling) {
                    tu.insertBefore(targetNode, sourceNode.nextSibling);
                } else if (sourceNode) {
                    tu.appendChild(targetNode);
                } else {
                    tu.appendChild(targetNode);
                }
            }

            let tags = seg.targetTags && seg.targetTags.length
                ? seg.targetTags.map(t => ({ ...t }))
                : (seg.sourceTags || []).map(t => ({ ...t }));
            if (format === 'mqxliff' && seg.sourceTags && seg.sourceTags.length && tags.length) {
                reconcileTargetTagsMarkupFromSource(seg.sourceTags, tags);
            }
            let repairedText = normalizeLegacyEncodedTagText(seg.targetText || '', seg.sourceTags || []);
            if (format === 'mxliff') {
                const origTargetEl = tu.getElementsByTagName('target')[0];
                const origTargetText = origTargetEl ? (origTargetEl.textContent || '') : '';
                repairedText = repairMxliffTargetForExport(
                    repairedText,
                    seg.sourceText || '',
                    origTargetText,
                    tags
                );
            }
            const tagsForReplace = format === 'mxliff'
                ? tags.map(t => ({ ...t, xml: t.ph }))
                : tags;
            const fallbackForReplace = format === 'mxliff'
                ? (seg.sourceTags || []).map(t => ({ ...t, xml: t.ph }))
                : (seg.sourceTags || []);
            let restoredXml = replacePlaceholders(repairedText, tagsForReplace, fallbackForReplace);

            if (format !== 'mxliff') {
                if (/&lt;it\b/i.test(restoredXml)) {
                    restoredXml = replaceEncodedItWithSourceXml(restoredXml, orderedInlineSourceTags(seg.sourceTags || []));
                }
                // 只有走 XML 片段寫入（有 tag）才需要做 fragment escape/修補；
                // 純文字路徑（textContent）若預先產生 &lt; 會在序列化時被再次跳脫成 &amp;lt;，導致 memoQ 顯示字面量。
                if (!usePlainTextForExportTarget(seg)) {
                    restoredXml = prepareRestoredFragmentForXmlParse(restoredXml);
                }
            }

            if (format === 'mqxliff') {
                updateMqxliffStatus(tu, seg, mqNsUri);
                const stateVal = seg.status === 'confirmed' ? 'final' : 'needs-translation';
                targetNode.setAttribute('state', stateVal);
            } else if (format === 'mxliff') {
                const mNsUri = xmlDoc.documentElement.lookupNamespaceURI('m') || 'http://www.memsource.com/mxlf/2.0';
                const confVal = seg.status === 'confirmed' ? '1' : '0';
                try { tu.setAttributeNS(mNsUri, 'm:confirmed', confVal); } catch (_) { tu.setAttribute('m:confirmed', confVal); }
                if (seg.targetText && seg.targetText.trim()) {
                    try { tu.setAttributeNS(mNsUri, 'm:level-edited', 'true'); } catch (_) { tu.setAttribute('m:level-edited', 'true'); }
                }
                targetNode.setAttribute('state', seg.status === 'confirmed' ? 'final' : 'needs-translation');
            } else if (format === 'sdlxliff') {
                const sdlState = seg.status === 'confirmed' ? 'final' : 'needs-translation';
                targetNode.setAttribute('state', sdlState);
                const tuIdInner = tu.getAttribute('id');
                if (tuIdInner) {
                    const sdlSegDefs = Array.from(xmlDoc.getElementsByTagNameNS(sdlNsUri, 'seg-defs'));
                    sdlSegDefs.forEach(sd => {
                        if (sd.parentNode !== tu) return;
                        const segsInner = Array.from(sd.getElementsByTagNameNS(sdlNsUri, 'seg'));
                        segsInner.forEach(s => {
                            const conf = seg.status === 'confirmed' ? 'Translated' : 'Draft';
                            s.setAttributeNS(null, 'conf', conf);
                        });
                    });
                }
            } else {
                const stateVal = seg.status === 'confirmed' ? 'final' : 'needs-translation';
                targetNode.setAttribute('state', stateVal);
            }

            // sdlxliff：保留 <g>/<mrk> 結構；mxliff：純文字 {N} 佔位；其他格式走 XML 片段還原
            if (format === 'sdlxliff') {
                const handled = _updateSdlxliffMrkContent(xmlDoc, tu, targetNode, seg, tags);
                if (!handled) {
                    setExportTargetPlainOrFragment(xmlDoc, targetNode, restoredXml, { tuId: tu.getAttribute('id') || '' }, tagsForExportWrite(seg, tags));
                }
            } else if (format === 'mxliff') {
                while (targetNode.firstChild) targetNode.removeChild(targetNode.firstChild);
                targetNode.textContent = restoredXml != null ? String(restoredXml) : '';
            } else {
                setExportTargetPlainOrFragment(xmlDoc, targetNode, restoredXml, { tuId: tu.getAttribute('id') || '' }, tagsForExportWrite(seg, tags));
            }
        });

        const serializer = new XMLSerializer();
        let outputXml = serializer.serializeToString(xmlDoc);

        if (!outputXml.startsWith('<?xml')) {
            const origDecl = xmlText.match(/^<\?xml[^?]*\?>/);
            outputXml = (origDecl ? origDecl[0] : '<?xml version="1.0" encoding="UTF-8"?>') + '\n' + outputXml;
        }

        const blob = new Blob([outputXml], { type: 'application/xml; charset=utf-8' });
        return { blob, filename: `Translated_${f.name}` };
    }

    async function exportXliffFamily(f, segs, format) {
        const { blob, filename } = await exportXliffFamilyToBlob(f, segs, format);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function validateExportTags(segs) {
        const issues = [];
        segs.forEach(seg => {
            if (!seg.sourceTags || !seg.sourceTags.length) return;
            const sourcePhs = new Set(seg.sourceTags.map(t => t.ph));
            const match = (seg.targetText || '').match(/\{\d+>|<\d+\}|\{\/?\d+\}/g);
            const targetPhs = new Set(match || []);
            const missing = [...sourcePhs].filter(ph => !targetPhs.has(ph));
            const extra = [...targetPhs].filter(ph => !sourcePhs.has(ph));
            if (missing.length || extra.length) {
                issues.push({
                    label: seg.globalId || (seg.rowIdx + 1),
                    missing,
                    extra
                });
            }
        });
        return issues;
    }

    /**
     * bpt/ept 序列化 xml 內跳脫內層標記簽名（如 open:g、close:pt），供 TM pt vs 原文 g 對齊。
     */
    function innerEscapedTagSig(xml) {
        if (xml == null || typeof xml !== 'string') return '';
        const closeM = xml.match(/&lt;\/([a-zA-Z][\w:-]*)/i);
        if (closeM) return 'close:' + closeM[1].toLowerCase();
        const openM = xml.match(/&lt;([a-zA-Z][\w:-]*)/i);
        if (openM) return 'open:' + openM[1].toLowerCase();
        return '';
    }

    function normalizeTagXmlForReconcile(xml) {
        return String(xml ?? '')
            .replace(/^\uFEFF/, '')
            .replace(/\s+rid\s*=\s*"[^"]*"/gi, '')
            .replace(/\s+rid\s*=\s*'[^']*'/gi, '')
            .replace(/\r\n?/g, '\n')
            .replace(/[\s\u00A0\u200B\uFEFF]+/g, ' ')
            .trim();
    }

    function tagXmlNeedsReconcileFromSource(st, tt) {
        if (!st || st.xml == null || !tt) return false;
        const srcXml = String(st.xml);
        const tgtXml = String(tt.xml ?? '');
        // Bug #9：bpt/ept/ph 內 mq:rxt 超連結須保留 memoQ 雙層實體（&amp;lt;、&amp;quot;）
        if (/mq:rxt/i.test(srcXml) && /href/i.test(srcXml)) {
            if (/&amp;quot;/.test(srcXml) && !/&amp;quot;/.test(tgtXml)) return true;
            if (/&amp;lt;/.test(srcXml) && !/&amp;lt;/.test(tgtXml)) return true;
            if (/displaytext="&lt;[^"]*href="/i.test(tgtXml)) return true;
        }
        const srcInner = innerEscapedTagSig(st.xml);
        const tgtInner = innerEscapedTagSig(tt.xml);
        if (srcInner && tgtInner) return srcInner !== tgtInner;
        return normalizeTagXmlForReconcile(st.xml) !== normalizeTagXmlForReconcile(tt.xml);
    }

    /**
     * mqxliff：同 ph 已存在但 targetTags.xml 與 sourceTags 不同時，以原文條目覆寫。
     * Bug #7：bpt/ept 內層 g/pt；Bug #8：standalone ph／mq:rxt 全段 xml；Bug #9：bpt/ept 內 mq:rxt href 雙層實體（見 bpt-href-entity-export bug report）。
     */
    function reconcileTargetTagsMarkupFromSource(sourceTags, targetTags) {
        if (!sourceTags || !sourceTags.length || !targetTags || !targetTags.length) return false;
        const sourceByPh = new Map();
        for (const st of sourceTags) {
            if (st && st.ph && !sourceByPh.has(st.ph)) sourceByPh.set(st.ph, st);
        }
        let changed = false;
        for (let i = 0; i < targetTags.length; i++) {
            const tt = targetTags[i];
            if (!tt || !tt.ph) continue;
            const st = sourceByPh.get(tt.ph);
            if (!st || st.xml == null) continue;
            if (!tagXmlNeedsReconcileFromSource(st, tt)) continue;
            targetTags[i] = { ...st };
            changed = true;
        }
        return changed;
    }

    window.CatToolXliffTags = {
        extractTaggedText,
        innerEscapedTagSig,
        normalizeTagXmlForReconcile,
        tagXmlNeedsReconcileFromSource,
        reconcileTargetTagsMarkupFromSource,
        shouldSkipAmpCollapseForMemoqInline,
        replacePlaceholders,
        collapseAmpEntitiesRepeated,
        phInnerMatchVariants,
        normalizeLegacyEncodedTagText,
        escapeMemoqBareCloseForXmlParse,
        escapeNonXliffAngleBrackets,
        prepareRestoredFragmentForXmlParse,
        decodeLeadingEntityEncodedMarkup,
        orderedInlineSourceTags,
        replaceEncodedItWithPlaceholders,
        replaceEncodedItWithSourceXml,
        setXmlTargetContent,
        updateMqxliffStatus,
        buildSegmentExportLookupMap,
        findSegmentForTransUnit,
        countXliffExportLookupMisses,
        exportXliffFamilyToBlob,
        exportXliffFamily,
        validateExportTags,
        debugXliffExport: false
    };
})(window, document);
