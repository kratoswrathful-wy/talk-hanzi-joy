/**
 * XLIFF／mqxliff／sdlxliff：由 XML 建立與編輯器相同形狀之句段列（供 TM 匯入篩選與 xliff-import 共用）。
 * 載入順序：xliff-tag-pipeline.js → **本檔** → xliff-import.js → xliff-to-tm.js → app.js
 */
(function (global) {
    'use strict';

    function _xliffAncestorFile(el) {
        let n = el;
        while (n) {
            if (n.nodeType === 1 && n.localName === 'file') return n;
            n = n.parentElement;
        }
        return null;
    }

    function isXliff2Document(xml) {
        const root = xml.documentElement;
        if (!root || root.localName !== 'xliff') return false;
        const v = (root.getAttribute('version') || '').trim();
        if (v.startsWith('2')) return true;
        const ns = root.namespaceURI || '';
        return ns.indexOf('document/2.0') !== -1;
    }

    function findAncestorFileEl(unit) {
        let n = unit;
        while (n) {
            if (n.nodeType === 1 && n.localName === 'file') return n;
            n = n.parentElement;
        }
        return null;
    }

    /** XLIFF 2.0：&lt;unit&gt;／&lt;segment&gt; */
    function buildXliff2SegmentRows(xml, fileName) {
        const Xliff = global.CatToolXliffTags;
        if (!Xliff || typeof Xliff.extractTaggedText !== 'function') {
            throw new Error('XLIFF 標籤模組未載入');
        }
        const root = xml.documentElement;
        const rootSrc = (root.getAttribute('srcLang') || root.getAttribute('source-language') || '').trim();
        const rootTgt = (root.getAttribute('trgLang') || root.getAttribute('target-language') || '').trim();
        const fileNode = xml.getElementsByTagName('file')[0];
        const originalSourceLang = fileNode
            ? (fileNode.getAttribute('source-language') || fileNode.getAttribute('srcLang') || rootSrc || '').trim()
            : rootSrc;
        const originalTargetLang = fileNode
            ? (fileNode.getAttribute('target-language') || fileNode.getAttribute('trgLang') || rootTgt || '').trim()
            : rootTgt;
        const segments = [];
        let segCounter = 0;
        function walkUnits(node, acc) {
            if (!node || node.nodeType !== 1) return;
            if (node.localName === 'unit') acc.push(node);
            for (const c of node.children) walkUnits(c, acc);
        }
        const units = [];
        walkUnits(root, units);
        function firstChildEl(parent, localName) {
            if (!parent) return null;
            for (const c of parent.children) {
                if (c.nodeType === 1 && c.localName === localName) return c;
            }
            return null;
        }
        for (const unit of units) {
            const segment = unit.getElementsByTagName('segment')[0];
            if (!segment) continue;
            const sourceNode = segment.getElementsByTagName('source')[0];
            const targetNode = segment.getElementsByTagName('target')[0];
            if (!sourceNode && !targetNode) continue;
            const srcEx = sourceNode ? Xliff.extractTaggedText(sourceNode, {}) : { text: '', tags: [] };
            const tgtEx = targetNode ? Xliff.extractTaggedText(targetNode, {}) : { text: '', tags: [] };
            const sourceText = srcEx.text;
            const targetText = tgtEx.text;
            const sourceTags = srcEx.tags || [];
            const targetTags = tgtEx.tags || [];
            let status = 'unconfirmed';
            if (targetNode) {
                const st = (targetNode.getAttribute('state') || '').toLowerCase();
                if (['translated', 'final', 'signed-off', 'reviewed', 'approved', 'confirmed'].includes(st)) {
                    status = 'confirmed';
                }
            }
            const fe = findAncestorFileEl(unit);
            const writtenFile = fe ? (fe.getAttribute('original') || fe.getAttribute('id') || '').trim() : '';
            const fileSourceLang = fe
                ? (fe.getAttribute('source-language') || fe.getAttribute('srcLang') || '').trim()
                : '';
            const fileTargetLang = fe
                ? (fe.getAttribute('target-language') || fe.getAttribute('trgLang') || '').trim()
                : '';
            const uid = (unit.getAttribute('id') || '').trim() || ('u' + segCounter);
            segments.push({
                sheetName: 'XLIFF',
                rowIdx: segCounter++,
                colSrc: 0,
                colTgt: 0,
                idValue: uid,
                extraValue: '',
                sourceText,
                targetText,
                isLocked: false,
                isLockedSystem: false,
                isLockedUser: false,
                status,
                matchValue: null,
                importMatchKind: null,
                comments: [],
                sourceFormat: 'xliff2',
                confirmationRole: null,
                originalRole: null,
                sourceTags,
                targetTags,
                writtenFile,
                fileSourceLang,
                fileTargetLang
            });
        }
        return { segments, originalSourceLang, originalTargetLang };
    }

    function buildSegmentsFromXliffXml(xml, fileName) {
        const Xliff = global.CatToolXliffTags;
        if (!Xliff || typeof Xliff.extractTaggedText !== 'function') {
            throw new Error('XLIFF 標籤模組未載入（請確認 index.html 已引入 js/xliff-tag-pipeline.js）');
        }

                // 讀取原始檔的語言對（XLIFF <file> 元素屬性）
                const fileNode = xml.getElementsByTagName('file')[0];
                const originalSourceLang = fileNode ? (fileNode.getAttribute('source-language') || fileNode.getAttribute('xml:lang') || '') : '';
                const originalTargetLang = fileNode ? (fileNode.getAttribute('target-language') || '') : '';

                if (isXliff2Document(xml)) {
                    return buildXliff2SegmentRows(xml, fileName);
                }

                const transUnits = Array.from(xml.getElementsByTagName('trans-unit'));
                if (!transUnits.length) {
                    const fileNodeEarly = xml.getElementsByTagName('file')[0];
                    const osl = fileNodeEarly ? (fileNodeEarly.getAttribute('source-language') || fileNodeEarly.getAttribute('xml:lang') || '') : '';
                    const otl = fileNodeEarly ? (fileNodeEarly.getAttribute('target-language') || '') : '';
                    return { segments: [], originalSourceLang: osl, originalTargetLang: otl };
                }

                const segments = [];
                let segCounter = 0; // 全域句段計數器，確保 rowIdx 連續不重複

                const lowerFileName = (fileName || '').toLowerCase();
                const isMqxliffFile = lowerFileName.endsWith('.mqxliff') ||
                    !!xml.documentElement.lookupNamespaceURI('mq');
                // sdlxliff：<g> 是文件結構包裝（SDL Studio 預設隱藏），使用 transparentG 模式
                // 讓每行不顯示多餘的 <g>...</g> 標籤佔位符；匯出時由 _updateSdlxliffMrkContent 保留結構
                const isSdlxliffFile = lowerFileName.endsWith('.sdlxliff');
                const extractOpts = isSdlxliffFile ? { transparentG: true } : {};

                /**
                 * memoQ 譯文有時把行內 tag 以**實體純文字**放在 <target>，解析後變成 `<mq:.../>` 字元，
                 * 未形成 ph，導致 targetTags=[] 但原文有 ph。從已具 mq: 的 sourceTags 複製到 targetTags（Bug #3 情況 A）。
                 */
                function augmentTargetTagsForPlainInlineMemoQ({ isMqxliffFile, targetText, sourceTags, targetTags }) {
                    if (!isMqxliffFile) return;
                    if (!sourceTags || !sourceTags.length) return;
                    if (!targetText || !String(targetText).trim()) return;
                    if (!/<mq:/i.test(String(targetText))) return;
                    const existingPhs = new Set((targetTags || []).map(t => t && t.ph).filter(Boolean));
                    for (const st of sourceTags) {
                        if (!st || existingPhs.has(st.ph)) continue;
                        const x = st.xml != null ? String(st.xml) : '';
                        const d = st.display != null ? String(st.display) : '';
                        if (!/mq:/i.test(x) && !/mq:/i.test(d)) continue;
                        targetTags.push({ ...st });
                        existingPhs.add(st.ph);
                    }
                }

                /**
                 * Bug #5：譯文 targetTags 僅部分解析時，依 targetText 內佔位符從 sourceTags 補齊缺漏 ph。
                 * 已存在之條目不覆寫（保留自 &lt;target&gt; 解析到的 xml 等）。
                 */
                function mergePartialTargetTagsFromSource({ targetText, sourceTags, targetTags }) {
                    if (!sourceTags || !sourceTags.length) return;
                    if (!targetText) return;
                    const presentPhs = new Set((String(targetText).match(/\{\/?\d+\}/g) || []));
                    if (!presentPhs.size) return;
                    const existingPhs = new Set((targetTags || []).map(t => t && t.ph).filter(Boolean));
                    for (const st of sourceTags) {
                        if (!st || existingPhs.has(st.ph)) continue;
                        if (presentPhs.has(st.ph)) {
                            targetTags.push({ ...st });
                            existingPhs.add(st.ph);
                        }
                    }
                }

                // sdlxliff 專用：以 localName 做遞迴搜尋，找出所有 <mrk mtype="seg"> 元素。
                // 使用 localName 而非 getElementsByTagName 以避免 XML namespace 問題。
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

                transUnits.forEach((tu) => {
            const fileEl = _xliffAncestorFile(tu);
            const writtenFile = fileEl ? (fileEl.getAttribute('original') || fileEl.getAttribute('id') || '').trim() : '';
            const fileSourceLang = fileEl ? (fileEl.getAttribute('source-language') || fileEl.getAttribute('xml:lang') || '').trim() : '';
            const fileTargetLang = fileEl ? (fileEl.getAttribute('target-language') || '').trim() : '';
                    const fallbackId = tu.getAttribute('id') || tu.getAttribute('resname') || tu.getAttribute('mq:unitId') || '';
                    const sourceNode = tu.getElementsByTagName('source')[0];
                    const targetNode = tu.getElementsByTagName('target')[0];

                    // ── sdlxliff 多段 TU 處理 ─────────────────────────────────────────
                    // SDL Trados 可在一個 trans-unit 內放多個 <mrk mtype="seg" mid="N">。
                    // 重要：SDL Trados 通常將 mrk 放在 <seg-source> 而非 <source> 中；
                    // <source> 只含純文字（無 mrk），mrk 在 <seg-source>（或 <target>）。
                    // 偵測順序：source → seg-source（找到 mrk 就停止）。
                    if (isSdlxliffFile) {
                        const segSourceNode = Array.from(tu.childNodes)
                            .find(n => n.nodeType === 1 && n.localName === 'seg-source') || null;

                        let srcMrks = collectSegMrks(sourceNode);
                        if (srcMrks.length === 0 && segSourceNode) {
                            srcMrks = collectSegMrks(segSourceNode);
                        }

                        if (srcMrks.length > 1) {
                            // 取得 sdl:seg-defs，用於讀取各句段的確認狀態
                            const segDefsEl = Array.from(tu.getElementsByTagName('*'))
                                .find(n => n.localName === 'seg-defs');

                            // TU 層級的系統鎖定（通常為 0，多段 TU 裡各 mrk 繼承）
                            const mqLocked = tu.getAttribute('mq:locked');
                            const isLockedSystem = !!(mqLocked && mqLocked.toLowerCase() === 'locked');

                            srcMrks.forEach(srcMrk => {
                                const mid = srcMrk.getAttribute('mid') || '';
                                const tgtMrk = collectSegMrks(targetNode)
                                    .find(m => m.getAttribute('mid') === mid) || null;

                                const { text: srcTxt, tags: srcTags } =
                                    Xliff.extractTaggedText(srcMrk, { transparentG: false });
                                const { text: tgtTxt, tags: tgtTags } = tgtMrk
                                    ? Xliff.extractTaggedText(tgtMrk, { transparentG: false })
                                    : { text: '', tags: [] };

                                if (!srcTxt && !tgtTxt) return;

                                // 從 sdl:seg-defs 的 sdl:seg id=mid 讀取 conf 屬性
                                let segStatus = 'unconfirmed';
                                if (segDefsEl) {
                                    const sdlSeg = Array.from(segDefsEl.getElementsByTagName('*'))
                                        .find(n => n.localName === 'seg' && n.getAttribute('id') === mid);
                                    if (sdlSeg) {
                                        const conf = sdlSeg.getAttribute('conf') || '';
                                        if (['Translated', 'ApprovedTranslation', 'ApprovedSignOff'].includes(conf)) {
                                            segStatus = 'confirmed';
                                        }
                                    }
                                }

                                segments.push({
                                    sheetName: 'XLIFF',
                                    rowIdx: segCounter++,
                                    colSrc: 0,
                                    colTgt: 0,
                                    idValue: `${fallbackId}#${mid}`,
                                    extraValue: '',
                                    sourceText: srcTxt,
                                    targetText: tgtTxt,
                                    isLocked: isLockedSystem,
                                    isLockedSystem,
                                    isLockedUser: false,
                                    status: segStatus,
                                    matchValue: null,
                                    importMatchKind: null,
                                    comments: [],
                                    sourceFormat: 'sdlxliff',
                                    confirmationRole: null,
                                    originalRole: null,
                                    sourceTags: srcTags,
                                    targetTags: tgtTags,
                            writtenFile,
                            fileSourceLang,
                            fileTargetLang
                        });
                            });
                            return; // 跳過後面的單段邏輯
                        }

                        // 單個 mrk：從 mrk 節點本身直接抽取（transparentG: false）
                        // 結構性外層 <g>（包住整個 mrk）不在 mrk 內，自然被排除（不生成佔位符）
                        // mrk 內的行內 <g>、<ph> 等則正確生成佔位符
                        if (srcMrks.length === 1) {
                            const srcMrk = srcMrks[0];
                            const mid = srcMrk.getAttribute('mid') || '';

                            const { text: srcTxt, tags: srcTags } =
                                Xliff.extractTaggedText(srcMrk, { transparentG: false });

                            // 目標語：先確認 mrk 有實際內容，避免空 mrk 產生多餘的 {1}{/1}
                            const tgtMrk = targetNode
                                ? (collectSegMrks(targetNode).find(m => m.getAttribute('mid') === mid) || null)
                                : null;
                            const tgtHasContent = tgtMrk
                                ? tgtMrk.textContent.trim() !== ''
                                : (targetNode ? targetNode.textContent.trim() !== '' : false);
                            const { text: tgtTxt, tags: tgtTags } = tgtHasContent
                                ? Xliff.extractTaggedText(tgtMrk || targetNode, { transparentG: false })
                                : { text: '', tags: [] };

                            if (!srcTxt && !tgtTxt) return;

                            let segStatus = 'unconfirmed';
                            const segDefsEl = Array.from(tu.getElementsByTagName('*'))
                                .find(n => n.localName === 'seg-defs');
                            if (segDefsEl) {
                                const sdlSeg = Array.from(segDefsEl.getElementsByTagName('*'))
                                    .find(n => n.localName === 'seg' && n.getAttribute('id') === mid)
                                    || Array.from(segDefsEl.getElementsByTagName('*'))
                                        .find(n => n.localName === 'seg');
                                if (sdlSeg) {
                                    const conf = sdlSeg.getAttribute('conf') || '';
                                    if (['Translated', 'ApprovedTranslation', 'ApprovedSignOff'].includes(conf)) {
                                        segStatus = 'confirmed';
                                    }
                                }
                            }

                            const mqLocked = tu.getAttribute('mq:locked');
                            const isLockedSystem = !!(mqLocked && mqLocked.toLowerCase() === 'locked');

                            segments.push({
                                sheetName: 'XLIFF',
                                rowIdx: segCounter++,
                                colSrc: 0,
                                colTgt: 0,
                                idValue: fallbackId,
                                extraValue: '',
                                sourceText: srcTxt,
                                targetText: tgtTxt,
                                isLocked: isLockedSystem,
                                isLockedSystem,
                                isLockedUser: false,
                                status: segStatus,
                                matchValue: null,
                                importMatchKind: null,
                                comments: [],
                                sourceFormat: 'sdlxliff',
                                confirmationRole: null,
                                originalRole: null,
                                sourceTags: srcTags,
                                targetTags: tgtTags,
                            writtenFile,
                            fileSourceLang,
                            fileTargetLang
                        });
                    return;
                        }
                    }
                    // ── 單段 TU（一般 XLIFF / mqxliff / sdlxliff 單段）────────────────

                    const { text: sourceText, tags: sourceTags } = sourceNode
                        ? Xliff.extractTaggedText(sourceNode, extractOpts) : { text: '', tags: [] };
                    const tgtExtracted = targetNode
                        ? Xliff.extractTaggedText(targetNode, extractOpts) : { text: '', tags: [] };
                    let targetText = tgtExtracted.text;
                    let targetTags = tgtExtracted.tags || [];

                    // mqxliff literal-placeholder 模式：有些 memoQ 檔案把行內 tag 直接以
                    // 純文字 {1}、{2}… 存入 XML（不使用 <ph> 等 XLIFF 元素）。
                    // extractTaggedText 掃不到元素 → sourceTags=[]；但文字裡已有 {N}。
                    // 此時合成 synthetic tags，讓 UI 顯示 pill、F8 可插入。
                    // xml 欄位直接存 "{N}" 本身，export 時 replacePlaceholders 會把 {N}
                    // 換回 "{N}"，memoQ 即可正確讀取（literal round-trip）。
                    if (isMqxliffFile && sourceTags.length === 0 && /\{\/?\d+\}/.test(sourceText)) {
                        const seenNums = new Set();
                        for (const m of sourceText.matchAll(/\{(\d+)\}/g)) {
                            const n = parseInt(m[1], 10);
                            if (!seenNums.has(n)) {
                                seenNums.add(n);
                                sourceTags.push({
                                    ph: `{${n}}`, xml: `{${n}}`,
                                    display: `{${n}}`, type: 'standalone',
                                    pairNum: n, num: n
                                });
                            }
                        }
                        // 成對 {N}/{/N}
                        for (const m of sourceText.matchAll(/\{\/(\d+)\}/g)) {
                            const n = parseInt(m[1], 10);
                            sourceTags.push({
                                ph: `{/${n}}`, xml: `{/${n}}`,
                                display: `{/${n}}`, type: 'close',
                                pairNum: n, num: n
                            });
                            // 確保對應的 open tag 存在
                            const openExists = sourceTags.some(t => t.ph === `{${n}}` && t.type !== 'close');
                            if (!openExists) {
                                sourceTags.push({
                                    ph: `{${n}}`, xml: `{${n}}`,
                                    display: `{${n}}`, type: 'open',
                                    pairNum: n, num: n
                                });
                            } else {
                                // 把已加入的 standalone 改為 open
                                const st = sourceTags.find(t => t.ph === `{${n}}` && t.type === 'standalone');
                                if (st) st.type = 'open';
                            }
                        }
                    }

                    // target 端同樣處理：若 sourceTags 已合成（literal 模式），
                    // targetTags 也應從 sourceTags 複製對應項目（保持 xml="{N}" round-trip）。
                    if (isMqxliffFile && sourceTags.length > 0 && targetTags.length === 0 && targetText) {
                        const presentPhs = new Set((targetText.match(/\{\/?\d+\}/g) || []));
                        for (const t of sourceTags) {
                            if (presentPhs.has(t.ph)) {
                                targetTags.push({ ...t });
                            }
                        }
                    }

                    augmentTargetTagsForPlainInlineMemoQ({ isMqxliffFile, targetText, sourceTags, targetTags });
                    mergePartialTargetTagsFromSource({ targetText, sourceTags, targetTags });

                    if (!sourceText && !targetText) return;

                    let keyFromContext = '';
                    const extraParts = [];

                    const ctxGroups = tu.getElementsByTagName('context-group');
                    Array.from(ctxGroups).forEach(cg => {
                        const ctxNodes = cg.getElementsByTagName('context');
                        Array.from(ctxNodes).forEach(ctxEl => {
                            const t = ctxEl.textContent.trim();
                            if (!t) return;
                            const cType = ctxEl.getAttribute('context-type') || '';
                            if (!keyFromContext && cType === 'x-mmq-context') {
                                keyFromContext = t;
                            } else {
                                extraParts.push(t);
                            }
                        });
                    });

                    const notes = tu.getElementsByTagName('note');
                    Array.from(notes).forEach(n => {
                        const t = n.textContent.trim();
                        if (t) extraParts.push(t);
                    });

                    const comments = tu.getElementsByTagName('comment');
                    Array.from(comments).forEach(c => {
                        const t = c.textContent.trim();
                        if (t) extraParts.push(t);
                    });

                    let extraValue = extraParts.join('\n');

                    let structuredComments = [];
                    if (isMqxliffFile) {
                        const mqCommentsNode = Array.from(tu.getElementsByTagName('*')).find(n => n.localName === 'comments');
                        if (mqCommentsNode) {
                            structuredComments = Array.from(mqCommentsNode.childNodes).filter(n => n.nodeType === 1 && n.localName === 'comment').map(c => ({
                                id: c.getAttribute('id') || '',
                                creator: c.getAttribute('creatoruser') || '',
                                time: c.getAttribute('time') || '',
                                appliesTo: c.getAttribute('appliesto') || '',
                                origin: c.getAttribute('origin') || '',
                                text: (c.textContent || '').trim()
                            })).filter(c => c.text);
                        }
                        // mqxliff 的 <note> 和 <mq:comment> 元素都是 memoQ 自動產生的重複資訊
                        // （<comment> 被 getElementsByTagName 匹配到 <mq:comment>，內容和 structuredComments 重複）
                        // 改為使用 structuredComments 去重後的文字作為 extraValue
                        if (structuredComments.length > 0) {
                            const seen = new Set();
                            const dedupedParts = [];
                            structuredComments.forEach(sc => {
                                const t = sc.text.trim();
                                if (t && !seen.has(t)) {
                                    seen.add(t);
                                    dedupedParts.push(t);
                                }
                            });
                            extraValue = dedupedParts.join('\n');
                        } else if (extraParts.length > 0) {
                            // 無 structuredComments 時保留 note 內容（移除重複行）
                            const seen = new Set();
                            extraValue = extraParts.filter(p => {
                                if (seen.has(p)) return false;
                                seen.add(p);
                                return true;
                            }).join('\n');
                        }
                    }

                    let status = 'unconfirmed';
                    let matchValue = null;
                    let confirmationRole = null;
                    let originalRole = null;

                    if (targetNode) {
                        const stateAttr = targetNode.getAttribute('state') || targetNode.getAttribute('mq:state');
                        const confirmedStates = ['translated', 'final', 'signed-off', 'reviewed', 'approved', 'confirmed'];
                        if (stateAttr && confirmedStates.includes(stateAttr.toLowerCase())) {
                            status = 'confirmed';
                        }
                    }

                    // sdlxliff 單段 TU：從 sdl:seg-defs 讀取確認狀態（比 <target state> 更精確）
                    if (isSdlxliffFile) {
                        const segDefsEl = Array.from(tu.getElementsByTagName('*'))
                            .find(n => n.localName === 'seg-defs');
                        if (segDefsEl) {
                            const sdlSegs = Array.from(segDefsEl.getElementsByTagName('*'))
                                .filter(n => n.localName === 'seg');
                            if (sdlSegs.length > 0) {
                                const conf = sdlSegs[0].getAttribute('conf') || '';
                                if (['Translated', 'ApprovedTranslation', 'ApprovedSignOff'].includes(conf)) {
                                    status = 'confirmed';
                                } else {
                                    status = 'unconfirmed';
                                }
                            }
                        }
                    }

                    const mqPercent = tu.getAttribute('mq:percent') ||
                                      (targetNode && (targetNode.getAttribute('mq:percent') || targetNode.getAttribute('percent')));
                    if (mqPercent && !Number.isNaN(parseInt(mqPercent, 10))) {
                        matchValue = parseInt(mqPercent, 10);
                    }

                    let importMatchKind = null;
                    const mqMatchType = tu.getAttribute('mq:match-type') || tu.getAttribute('match-type') || '';
                    const sdlOrig = tu.getAttribute('sdl:origin') || '';
                    const upperHint = `${mqMatchType} ${sdlOrig}`.toUpperCase();
                    if (upperHint.includes('ICE')) importMatchKind = 'ICE';
                    else if (upperHint.includes('XTL')) importMatchKind = 'XTL';
                    else if (matchValue != null && matchValue > 100) importMatchKind = '101';

                    const mqLocked = tu.getAttribute('mq:locked');
                    const isLockedSystem = !!(mqLocked && mqLocked.toLowerCase() === 'locked');

                    if (isMqxliffFile) {
                        const commitInfos = Array.from(tu.getElementsByTagName('*')).filter(n => n.localName === 'commitinfo');
                        const roleMap = { 1000: 'T', 2000: 'R1', 3000: 'R2' };
                        for (let i = commitInfos.length - 1; i >= 0; i--) {
                            const ci = commitInfos[i];
                            const roleAttr = ci.getAttribute('role');
                            const roleNum = roleAttr ? parseInt(roleAttr, 10) : NaN;
                            const mapped = roleMap[roleNum];
                            if (!mapped) continue;
                            const username = ci.getAttribute('username') || '';
                            const timestamp = ci.getAttribute('timestamp') || '';
                            if (!username || timestamp.startsWith('0001-01-01')) continue;
                            originalRole = mapped;
                            break;
                        }
                        if (!originalRole) {
                            const mqStatus = tu.getAttribute('mq:status') || '';
                            if (mqStatus === 'Proofread' || mqStatus === 'Reviewer2Confirmed') originalRole = 'R2';
                            else if (mqStatus === 'Reviewer1Confirmed') originalRole = 'R1';
                            else if (mqStatus === 'ManuallyConfirmed' || mqStatus === 'TranslationApproved') originalRole = 'T';
                        }
                        if (originalRole) {
                            confirmationRole = originalRole;
                            status = 'confirmed';
                        }
                    }

                    segments.push({
                        sheetName: 'XLIFF',
                        rowIdx: segCounter++,
                        colSrc: 0,
                        colTgt: 0,
                        idValue: keyFromContext || fallbackId,
                        extraValue,
                        sourceText,
                        targetText,
                        isLocked: isLockedSystem,
                        isLockedSystem,
                        isLockedUser: false,
                        status,
                        matchValue,
                        importMatchKind,
                        comments: structuredComments,
                        sourceFormat: isMqxliffFile ? 'mqxliff' : 'xliff',
                        confirmationRole,
                        originalRole,
                        sourceTags,
                        targetTags,
                        writtenFile,
                        fileSourceLang,
                        fileTargetLang
                    });
                });

        return { segments, originalSourceLang, originalTargetLang };
    }

    async function parseXliffFileToSegmentRows(file) {
        const Xliff = global.CatToolXliffTags;
        if (!Xliff || typeof Xliff.extractTaggedText !== 'function') {
            throw new Error('XLIFF 標籤模組未載入（請確認 index.html 已引入 js/xliff-tag-pipeline.js）');
        }
        const text = await file.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const parseError = xml.getElementsByTagName('parsererror')[0];
        if (parseError) {
            throw new Error('無法解析為有效的 XML / XLIFF 檔案');
        }
        const pack = buildSegmentsFromXliffXml(xml, file.name || '');
        return { ...pack, text };
    }

    global.CatToolXliffBuildSegments = {
        buildSegmentsFromXliffXml,
        parseXliffFileToSegmentRows
    };
})(typeof window !== 'undefined' ? window : globalThis);
