/**
 * 將 XLIFF / mqxliff / sdlxliff 解析為 TM 匯入列（純文字，不含 tag 結構）。
 * 載入順序：xliff-tag-pipeline.js → xliff-import.js → 本檔 → app.js
 */
(function (global) {
    'use strict';

    const SDL_CONF_OK = new Set(['Translated', 'ApprovedTranslation', 'ApprovedSignOff']);

    function collectSegMrks(node) {
        const results = [];
        if (!node) return results;
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType !== 1) continue;
            if (child.localName === 'mrk' && child.getAttribute('mtype') === 'seg')
                results.push(child);
            results.push(...collectSegMrks(child));
        }
        return results;
    }

    function firstChildEl(parent, localName) {
        if (!parent) return null;
        for (const c of parent.children) {
            if (c.nodeType === 1 && c.localName === localName) return c;
        }
        return null;
    }

    function isMqxliffTransUnitLocked(tu) {
        const mq = tu.getAttribute('mq:locked') || '';
        if (mq.toLowerCase() === 'locked') return true;
        const lk = tu.getAttribute('locked') || '';
        const l = lk.toLowerCase();
        if (l === 'true' || l === 'yes') return true;
        return false;
    }

    function isXliff2Document(xml) {
        const root = xml.documentElement;
        if (!root || root.localName !== 'xliff') return false;
        const v = (root.getAttribute('version') || '').trim();
        if (v.startsWith('2')) return true;
        const ns = root.namespaceURI || '';
        return ns.indexOf('document/2.0') !== -1;
    }

    function findAncestorFile(el) {
        let n = el;
        while (n) {
            if (n.nodeType === 1 && n.localName === 'file') return n;
            n = n.parentElement;
        }
        return null;
    }

    function sdlSegConfForMid(tu, mid) {
        const segDefsEl = Array.from(tu.getElementsByTagName('*')).find(n => n.localName === 'seg-defs');
        if (!segDefsEl) return '';
        const sdlSeg = Array.from(segDefsEl.getElementsByTagName('*'))
            .find(n => n.localName === 'seg' && (!mid || n.getAttribute('id') === mid));
        return sdlSeg ? (sdlSeg.getAttribute('conf') || '') : '';
    }

    /**
     * @param {File} file
     * @param {object} options
     * @param {string|number} options.tmId
     * @param {string} [options.tmSourceLang]
     * @param {string} [options.tmTargetLang]
     * @param {string} [options.creatorBase] 預設讀 localStorage.localCatUserProfile
     * @returns {Promise<object[]>} 可直接餵 DBService.bulkAddTMSegments
     */
    async function parseXliffForTm(file, options) {
        const Xliff = global.CatToolXliffTags;
        if (!Xliff || typeof Xliff.extractTaggedText !== 'function') {
            throw new Error('XLIFF 標籤模組未載入（請確認已引入 js/xliff-tag-pipeline.js）');
        }
        const tmId = options && options.tmId;
        if (tmId == null || tmId === '') throw new Error('缺少 tmId');

        const tmSourceLang = (options && options.tmSourceLang) || '';
        const tmTargetLang = (options && options.tmTargetLang) || '';
        const creator = (options && options.creatorBase) ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('localCatUserProfile')) ||
            'Unknown User';
        const ts = new Date().toLocaleString('zh-TW', { hour12: false });
        const changeMsg = `${ts} - ${creator} (以檔案匯入) 建立`;
        const iso = new Date().toISOString();
        const writtenProject = (file && file.name) || '';

        const text = await file.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const parseError = xml.getElementsByTagName('parsererror')[0];
        if (parseError) {
            const msg = (parseError.textContent || '').trim().slice(0, 200);
            throw new Error('無法解析為有效的 XML' + (msg ? '：' + msg : ''));
        }

        const lowerName = ((file && file.name) || '').toLowerCase();
        const isMqxliffFile = lowerName.endsWith('.mqxliff') ||
            !!(xml.documentElement && xml.documentElement.lookupNamespaceURI('mq'));
        const isSdlxliffFile = lowerName.endsWith('.sdlxliff');

        const seenKeys = new Set();
        const out = [];

        function pushUnique(key, row) {
            const k = String(key || '').trim() || `_anon_${out.length}`;
            if (seenKeys.has(k)) return;
            seenKeys.add(k);
            out.push(row);
        }

        function makeRow(p) {
            return {
                tmId,
                sourceText: p.sourceText || '',
                targetText: p.targetText || '',
                key: p.key || '',
                prevSegment: '',
                nextSegment: '',
                writtenFile: p.writtenFile || '',
                writtenProject,
                createdBy: `${creator} (以檔案匯入)`,
                changeLog: [changeMsg],
                sourceLang: p.sourceLang || '',
                targetLang: p.targetLang || '',
                createdAt: iso,
                lastModified: iso
            };
        }

        if (isXliff2Document(xml)) {
            const root = xml.documentElement;
            const rootSrc = (root.getAttribute('srcLang') || root.getAttribute('source-language') || '').trim();
            const rootTgt = (root.getAttribute('trgLang') || root.getAttribute('target-language') || '').trim();

            function walkUnits(node, acc) {
                if (!node || node.nodeType !== 1) return;
                if (node.localName === 'unit') acc.push(node);
                for (const c of node.children) walkUnits(c, acc);
            }
            const units = [];
            walkUnits(root, units);

            for (const unit of units) {
                const segment = unit.getElementsByTagName('segment')[0];
                if (!segment) continue;
                const sourceNode = segment.getElementsByTagName('source')[0];
                const targetNode = segment.getElementsByTagName('target')[0];
                if (!sourceNode && !targetNode) continue;
                const { text: srcTxt } = sourceNode
                    ? Xliff.extractTaggedText(sourceNode, {})
                    : { text: '' };
                const { text: tgtTxt } = targetNode
                    ? Xliff.extractTaggedText(targetNode, {})
                    : { text: '' };
                if (!String(tgtTxt || '').trim()) continue;

                const fileEl = findAncestorFile(unit);
                const writtenFile = fileEl
                    ? ((fileEl.getAttribute('original') || fileEl.getAttribute('id') || '')).trim()
                    : '';
                const fileSrc = fileEl
                    ? (fileEl.getAttribute('source-language') || fileEl.getAttribute('srcLang') || '').trim()
                    : '';
                const fileTgt = fileEl
                    ? (fileEl.getAttribute('target-language') || fileEl.getAttribute('trgLang') || '').trim()
                    : '';

                const sourceLang = fileSrc || rootSrc || tmSourceLang;
                const targetLang = fileTgt || rootTgt || tmTargetLang;
                const uid = (unit.getAttribute('id') || '').trim() || `u${out.length}`;

                pushUnique(uid, makeRow({
                    sourceText: srcTxt,
                    targetText: tgtTxt,
                    key: uid,
                    writtenFile,
                    sourceLang,
                    targetLang
                }));
            }
            return out;
        }

        // —— XLIFF 1.2 / mqxliff / sdlxliff ——
        const extractOpts = isSdlxliffFile ? { transparentG: true } : {};
        let fileEls = Array.from(xml.getElementsByTagName('file'));
        if (!fileEls.length && xml.getElementsByTagName('trans-unit').length) {
            fileEls = [xml.documentElement];
        }

        for (let fi = 0; fi < fileEls.length; fi++) {
            const fileEl = fileEls[fi];
            const isFileNode = fileEl.localName === 'file';
            const writtenFile = isFileNode
                ? (fileEl.getAttribute('original') || fileEl.getAttribute('id') || '').trim()
                : '';
            const fileSrc = isFileNode
                ? (fileEl.getAttribute('source-language') || fileEl.getAttribute('xml:lang') || '').trim()
                : '';
            const fileTgt = isFileNode
                ? (fileEl.getAttribute('target-language') || '').trim()
                : '';
            const sourceLang = fileSrc || tmSourceLang;
            const targetLang = fileTgt || tmTargetLang;

            const tus = Array.from(fileEl.getElementsByTagName('trans-unit'));
            for (let ti = 0; ti < tus.length; ti++) {
                const tu = tus[ti];
                if (isMqxliffFile && isMqxliffTransUnitLocked(tu)) continue;

                const fallbackId = (tu.getAttribute('id') || tu.getAttribute('resname') ||
                    tu.getAttribute('mq:unitId') || '').trim();
                const sourceNode = tu.getElementsByTagName('source')[0];
                const targetNode = tu.getElementsByTagName('target')[0];

                if (isSdlxliffFile) {
                    const segSourceNode = Array.from(tu.childNodes)
                        .find(n => n.nodeType === 1 && n.localName === 'seg-source') || null;

                    let srcMrks = collectSegMrks(sourceNode);
                    if (srcMrks.length === 0 && segSourceNode) {
                        srcMrks = collectSegMrks(segSourceNode);
                    }

                    const mqLocked = tu.getAttribute('mq:locked');
                    const isLockedSystem = !!(mqLocked && mqLocked.toLowerCase() === 'locked');

                    if (isLockedSystem) continue;

                    if (srcMrks.length > 1) {
                        const segDefsEl = Array.from(tu.getElementsByTagName('*'))
                            .find(n => n.localName === 'seg-defs');

                        srcMrks.forEach(srcMrk => {
                            const mid = srcMrk.getAttribute('mid') || '';
                            let conf = '';
                            if (segDefsEl) {
                                const sdlSeg = Array.from(segDefsEl.getElementsByTagName('*'))
                                    .find(n => n.localName === 'seg' && n.getAttribute('id') === mid);
                                if (sdlSeg) conf = sdlSeg.getAttribute('conf') || '';
                            }
                            if (!SDL_CONF_OK.has(conf)) return;

                            const tgtMrk = collectSegMrks(targetNode)
                                .find(m => m.getAttribute('mid') === mid) || null;
                            const { text: srcTxt } = Xliff.extractTaggedText(srcMrk, { transparentG: false });
                            const { text: tgtTxt } = tgtMrk
                                ? Xliff.extractTaggedText(tgtMrk, { transparentG: false })
                                : { text: '' };
                            if (!String(tgtTxt || '').trim()) return;

                            const baseId = fallbackId || `_tu_${fi}_${ti}`;
                            const rowKey = `${baseId}:${mid}`;
                            pushUnique(rowKey, makeRow({
                                sourceText: srcTxt,
                                targetText: tgtTxt,
                                key: rowKey,
                                writtenFile,
                                sourceLang,
                                targetLang
                            }));
                        });
                        continue;
                    }

                    if (srcMrks.length === 1) {
                        const srcMrk = srcMrks[0];
                        const mid = srcMrk.getAttribute('mid') || '';
                        const conf = sdlSegConfForMid(tu, mid);
                        if (!SDL_CONF_OK.has(conf)) continue;

                        const { text: srcTxt } = Xliff.extractTaggedText(srcMrk, { transparentG: false });
                        const tgtMrk = targetNode
                            ? (collectSegMrks(targetNode).find(m => m.getAttribute('mid') === mid) || null)
                            : null;
                        const tgtHasContent = tgtMrk
                            ? tgtMrk.textContent.trim() !== ''
                            : (targetNode ? targetNode.textContent.trim() !== '' : false);
                        const { text: tgtTxt } = tgtHasContent
                            ? Xliff.extractTaggedText(tgtMrk || targetNode, { transparentG: false })
                            : { text: '' };
                        if (!String(tgtTxt || '').trim()) continue;

                        pushUnique(fallbackId || `tu${fi}_${ti}`, makeRow({
                            sourceText: srcTxt,
                            targetText: tgtTxt,
                            key: fallbackId,
                            writtenFile,
                            sourceLang,
                            targetLang
                        }));
                        continue;
                    }

                    // 無 mrk：整段 source/target
                    const conf0 = sdlSegConfForMid(tu, '');
                    if (!SDL_CONF_OK.has(conf0)) continue;
                    const { text: srcTxt } = sourceNode
                        ? Xliff.extractTaggedText(sourceNode, extractOpts) : { text: '' };
                    const { text: tgtTxt } = targetNode
                        ? Xliff.extractTaggedText(targetNode, extractOpts) : { text: '' };
                    if (!String(tgtTxt || '').trim()) continue;

                    pushUnique(fallbackId || `tu${fi}_${ti}`, makeRow({
                        sourceText: srcTxt,
                        targetText: tgtTxt,
                        key: fallbackId,
                        writtenFile,
                        sourceLang,
                        targetLang
                    }));
                    continue;
                }

                // 一般 XLIFF / mqxliff 單段
                const { text: srcTxt } = sourceNode
                    ? Xliff.extractTaggedText(sourceNode, extractOpts) : { text: '' };
                const { text: tgtTxt } = targetNode
                    ? Xliff.extractTaggedText(targetNode, extractOpts) : { text: '' };
                if (!String(tgtTxt || '').trim()) continue;

                pushUnique(fallbackId || `tu${fi}_${ti}`, makeRow({
                    sourceText: srcTxt,
                    targetText: tgtTxt,
                    key: fallbackId,
                    writtenFile,
                    sourceLang,
                    targetLang
                }));
            }
        }

        return out;
    }

    global.CatToolXliffToTm = {
        parseXliffForTm
    };
})(typeof window !== 'undefined' ? window : globalThis);
