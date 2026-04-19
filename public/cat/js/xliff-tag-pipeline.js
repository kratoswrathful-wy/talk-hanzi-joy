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
    function extractTaggedText(xmlNode, { transparentG = false } = {}) {
        const tags = [];
        let counter = 0;
        const bptMap = {};

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

                if (ln === 'ph' || ln === 'it') {
                    counter++;
                    const ph = `{${counter}}`;
                    const rawDisplay = child.getAttribute('displaytext') || child.textContent || '';
                    const display = rawDisplay.length > 25 ? rawDisplay.substring(0, 25) + '…' : rawDisplay || ph;
                    const xml = new XMLSerializer().serializeToString(child);
                    tags.push({ ph, xml, display, type: 'standalone', pairNum: counter, num: counter });
                    text += ph;
                } else if (ln === 'bpt') {
                    counter++;
                    const id = child.getAttribute('id') || String(counter);
                    bptMap[id] = counter;
                    const ph = `{${counter}}`;
                    const rawDisplay = child.textContent || '';
                    const display = rawDisplay.length > 25 ? rawDisplay.substring(0, 25) + '…' : rawDisplay || `<${counter}>`;
                    const xml = new XMLSerializer().serializeToString(child);
                    tags.push({ ph, xml, display, type: 'open', pairNum: counter, num: counter });
                    text += ph;
                } else if (ln === 'ept') {
                    const id = child.getAttribute('id') || '';
                    const num = bptMap[id] !== undefined ? bptMap[id] : ++counter;
                    const ph = `{/${num}}`;
                    const rawDisplay = child.textContent || '';
                    const display = rawDisplay.length > 25 ? rawDisplay.substring(0, 25) + '…' : rawDisplay || `</${num}>`;
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

        return text.replace(/\{\/?\d+\}/g, m => {
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

    function prepareRestoredFragmentForXmlParse(restoredXml) {
        if (!restoredXml || typeof restoredXml !== 'string') return restoredXml;
        return escapeMemoqBareCloseForXmlParse(collapseAmpEntitiesRepeated(restoredXml));
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
        restored = prepareRestoredFragmentForXmlParse(restored);

        if (mrkSegs.length === 1) {
            const mrk = mrkSegs[0];
            while (mrk.firstChild) mrk.removeChild(mrk.firstChild);
            if (restored.trim()) {
                setXmlTargetContent(xmlDoc, mrk, restored, { tuId: tu.getAttribute('id') || '' });
            }
            return true;
        }

        // 多個 mrk（一個 TU 包含多個句段）：全部清空，譯文放入第一個 mrk
        mrkSegs.forEach(mrk => { while (mrk.firstChild) mrk.removeChild(mrk.firstChild); });
        if (restored.trim()) {
            setXmlTargetContent(xmlDoc, mrkSegs[0], restored, { tuId: tu.getAttribute('id') || '' });
        }
        return true;
    }

    async function exportXliffFamily(f, segs, format) {
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

        // 修正：以 idValue（原始 TU id 屬性，sdlxliff 為 UUID）為主鍵建立查找表，
        // 並同時保留 globalId（整數）作為向下相容鍵。
        // 原本只用 globalId 導致 sdlxliff UUID id 永遠無法對應句段，譯文全部遺失。
        const segByTuId = new Map();
        segs.forEach(s => {
            if (s.idValue && String(s.idValue).trim()) {
                segByTuId.set(String(s.idValue).trim(), s);
            }
            segByTuId.set(String(s.globalId ?? s.rowIdx + 1), s);
        });

        transUnits.forEach((tu) => {
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
                            setXmlTargetContent(xmlDoc, mrk, restoredXml, { tuId: `${tuId}#${mid}` });
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
            const seg = tuId ? segByTuId.get(tuId) : null;
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

            const tags = seg.targetTags && seg.targetTags.length ? seg.targetTags : (seg.sourceTags || []);
            const repairedText = normalizeLegacyEncodedTagText(seg.targetText || '', seg.sourceTags || []);
            let restoredXml = replacePlaceholders(repairedText, tags, seg.sourceTags || []);

            if (/&lt;it\b/i.test(restoredXml)) {
                restoredXml = replaceEncodedItWithSourceXml(restoredXml, orderedInlineSourceTags(seg.sourceTags || []));
            }

            restoredXml = prepareRestoredFragmentForXmlParse(restoredXml);

            if (format === 'mqxliff') {
                updateMqxliffStatus(tu, seg, mqNsUri);
                const stateVal = seg.status === 'confirmed' ? 'final' : 'needs-translation';
                targetNode.setAttribute('state', stateVal);
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

            // sdlxliff：保留 <g>/<mrk> 結構，只更新 mrk 內容；其他格式直接替換整個 target 內容
            if (format === 'sdlxliff') {
                const handled = _updateSdlxliffMrkContent(xmlDoc, tu, targetNode, seg, tags);
                if (!handled) {
                    setXmlTargetContent(xmlDoc, targetNode, restoredXml, { tuId: tu.getAttribute('id') || '' });
                }
            } else {
                setXmlTargetContent(xmlDoc, targetNode, restoredXml, { tuId: tu.getAttribute('id') || '' });
            }
        });

        const serializer = new XMLSerializer();
        let outputXml = serializer.serializeToString(xmlDoc);

        if (!outputXml.startsWith('<?xml')) {
            const origDecl = xmlText.match(/^<\?xml[^?]*\?>/);
            outputXml = (origDecl ? origDecl[0] : '<?xml version="1.0" encoding="UTF-8"?>') + '\n' + outputXml;
        }

        const blob = new Blob([outputXml], { type: 'application/xml; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Translated_${f.name}`;
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
            const match = (seg.targetText || '').match(/\{\/?\d+\}/g);
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

    window.CatToolXliffTags = {
        extractTaggedText,
        replacePlaceholders,
        collapseAmpEntitiesRepeated,
        phInnerMatchVariants,
        normalizeLegacyEncodedTagText,
        escapeMemoqBareCloseForXmlParse,
        prepareRestoredFragmentForXmlParse,
        decodeLeadingEntityEncodedMarkup,
        orderedInlineSourceTags,
        replaceEncodedItWithPlaceholders,
        replaceEncodedItWithSourceXml,
        setXmlTargetContent,
        updateMqxliffStatus,
        exportXliffFamily,
        validateExportTags,
        debugXliffExport: false
    };
})(window, document);
