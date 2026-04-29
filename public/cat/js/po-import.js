/**
 * GNU PO / POT 檔案支援：解析、匯入句段、匯出。
 *
 * 載入順序：本檔 → app.js
 *
 * 支援功能：
 *   - msgctxt / msgid / msgstr（含多行字串拼接）
 *   - msgid_plural / msgstr[N]（複數形：僅取 msgstr[0] 作為譯文）
 *   - #, fuzzy 旗標 → status = 'unconfirmed'，匯出時若填妥譯文自動移除 fuzzy
 *   - 原始 PO 二進位保存於 DB，匯出時原樣還原結構（僅替換 msgstr）
 */
(function (global) {
    'use strict';

    // ── 字串工具 ──────────────────────────────────────────────────────────────

    /** PO 逸出序列 → 實際字元 */
    function unescapePo(s) {
        return s
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
    }

    /** 實際字元 → PO 逸出序列 */
    function escapePo(s) {
        if (!s) return '';
        return s
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t');
    }

    // ── 低階解析 ─────────────────────────────────────────────────────────────

    /**
     * 從 lines[i] 開始讀取一個 PO 關鍵字字串（含後續續行）。
     * @returns {[string, number]} [已解逸出的字串值, 下一行索引]
     */
    function readPoString(lines, i) {
        const firstLine = lines[i] || '';
        // 匹配：keyword "value"  （keyword 可含 [N]，如 msgstr[0]）
        const m = firstLine.match(/^msg\w+(?:\[\d+\])?\s+"(.*)"$/);
        let value = m ? unescapePo(m[1]) : '';
        i++;
        // 後續續行：以 " 開頭的行
        while (i < lines.length) {
            const line = lines[i];
            if (!line.startsWith('"')) break;
            const cm = line.match(/^"(.*)"$/);
            if (cm) value += unescapePo(cm[1]);
            i++;
        }
        return [value, i];
    }

    // ── 解析整份 PO 檔 ────────────────────────────────────────────────────────

    /**
     * 將 PO 檔文字解析為 entry 陣列。
     * 每個 entry 結構：
     *   { translatorComments, extractedComments, references, flags,
     *     msgctxt, msgid, msgidPlural, msgstr, isHeader, isFuzzy }
     */
    function parsePo(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const entries = [];
        let i = 0;

        while (i < lines.length) {
            // 跳過空行
            while (i < lines.length && !lines[i].trim()) i++;
            if (i >= lines.length) break;

            const translatorComments = [];
            const extractedComments = [];
            const references = [];
            const flags = [];

            // 蒐集 # 開頭的行
            while (i < lines.length && lines[i].startsWith('#')) {
                const line = lines[i];
                if (line.startsWith('#. ')) {
                    extractedComments.push(line.slice(3).trimEnd());
                } else if (line.startsWith('#: ')) {
                    references.push(line.slice(3).trimEnd());
                } else if (line.startsWith('#, ')) {
                    flags.push(...line.slice(3).split(',').map(f => f.trim()).filter(Boolean));
                } else if (line.startsWith('#~')) {
                    // 廢棄句段：整條跳過
                } else if (line.startsWith('# ') || line === '#') {
                    translatorComments.push(line.slice(2).trimEnd());
                }
                i++;
            }

            if (i >= lines.length) break;

            // msgctxt（可選）
            let msgctxt = null;
            if (lines[i].startsWith('msgctxt ')) {
                [msgctxt, i] = readPoString(lines, i);
            }

            // msgid（必要）
            if (i >= lines.length || !lines[i].startsWith('msgid ')) {
                i++;
                continue;
            }
            let msgid;
            [msgid, i] = readPoString(lines, i);

            // msgid_plural（可選）
            let msgidPlural = null;
            if (i < lines.length && lines[i].startsWith('msgid_plural ')) {
                [msgidPlural, i] = readPoString(lines, i);
            }

            // msgstr / msgstr[N]
            let msgstr = '';
            if (i < lines.length) {
                if (lines[i].startsWith('msgstr ')) {
                    [msgstr, i] = readPoString(lines, i);
                } else if (lines[i].startsWith('msgstr[')) {
                    // 複數形：只取第一個（msgstr[0]）
                    [msgstr, i] = readPoString(lines, i);
                    while (i < lines.length && lines[i].startsWith('msgstr[')) {
                        let _skip;
                        [_skip, i] = readPoString(lines, i);
                    }
                }
            }

            entries.push({
                translatorComments,
                extractedComments,
                references,
                flags,
                msgctxt,
                msgid,
                msgidPlural,
                msgstr,
                isHeader: msgid === '',
                isFuzzy: flags.includes('fuzzy')
            });
        }

        return entries;
    }

    // ── 序列化單一 entry ──────────────────────────────────────────────────────

    function serializeEntry(entry, overrideMsgstr, overrideFlags) {
        const lines = [];
        const flags = overrideFlags !== undefined ? overrideFlags : entry.flags;

        for (const c of entry.translatorComments) lines.push(c ? `# ${c}` : '#');
        for (const c of entry.extractedComments)  lines.push(`#. ${c}`);
        for (const r of entry.references)          lines.push(`#: ${r}`);
        if (flags.length) lines.push(`#, ${flags.join(', ')}`);

        if (entry.msgctxt !== null) lines.push(`msgctxt "${escapePo(entry.msgctxt)}"`);
        lines.push(`msgid "${escapePo(entry.msgid)}"`);
        if (entry.msgidPlural !== null) lines.push(`msgid_plural "${escapePo(entry.msgidPlural)}"`);

        const ms = overrideMsgstr !== undefined ? overrideMsgstr : entry.msgstr;
        if (entry.msgidPlural !== null) {
            lines.push(`msgstr[0] "${escapePo(ms)}"`);
        } else {
            lines.push(`msgstr "${escapePo(ms)}"`);
        }
        return lines.join('\n');
    }

    // ── 匯入 ─────────────────────────────────────────────────────────────────

    /**
     * 匯入 .po / .pot 檔案至 CAT 工具資料庫。
     *
     * @param {object} ctx - 與 xliffImportCtx() 相同的 context 物件
     * @param {File} file
     */
    async function handlePoImport(ctx, file) {
        const {
            DBService,
            currentProjectId,
            wizardOverlay,
            makeBaseLogEntry,
            appendProjectChangeLog,
            loadFilesList,
            selectedSourceLang = '',
            selectedTargetLang = ''
        } = ctx;

        const text = await file.text();
        const entries = parsePo(text);

        const segments = [];
        let segCounter = 0;

        for (const entry of entries) {
            if (entry.isHeader) continue;  // 略過 header block
            if (!entry.msgid && !entry.msgstr) continue;

            // msgctxt 為首選 ID；否則以 msgid 作為 ID
            const idValue = entry.msgctxt !== null ? entry.msgctxt : entry.msgid;

            // extraValue：保留 reference / extracted comment 供審閱
            const extraParts = [];
            if (entry.references.length)        extraParts.push(entry.references.join('\n'));
            if (entry.extractedComments.length) extraParts.push(entry.extractedComments.join('\n'));
            if (entry.translatorComments.length)extraParts.push(entry.translatorComments.join('\n'));
            const extraValue = extraParts.join('\n');

            // fuzzy → 未確認；有譯文且非 fuzzy → 已確認
            const status = (entry.msgstr && !entry.isFuzzy) ? 'confirmed' : 'unconfirmed';

            segments.push({
                sheetName: 'PO',
                rowIdx: segCounter++,
                colSrc: 0,
                colTgt: 0,
                idValue,
                extraValue,
                sourceText: entry.msgid,
                targetText: entry.msgstr,
                isLocked: false,
                isLockedSystem: false,
                isLockedUser: false,
                status,
                matchValue: null,
                importMatchKind: null,
                comments: [],
                sourceFormat: 'po',
                confirmationRole: null,
                originalRole: null,
                sourceTags: [],
                targetTags: []
            });
        }

        if (!segments.length) {
            throw new Error('檔案中沒有可匯入的句段（原文與譯文皆空白）');
        }

        const encoder = new TextEncoder();
        const buffer = encoder.encode(text).buffer;

        const fileId = await DBService.createFile(
            currentProjectId,
            file.name,
            buffer,
            selectedSourceLang,
            selectedTargetLang,
            '',
            ''
        );

        const logEntry = makeBaseLogEntry('create', 'project-file', {
            entityId: fileId,
            entityName: file.name
        });
        if (currentProjectId) {
            await appendProjectChangeLog(currentProjectId, logEntry);
            await DBService.addModuleLog('projects', logEntry);
        }

        const mappedSegments = segments.map((s, idx) => ({ ...s, fileId, globalId: idx + 1 }));
        try {
            await DBService.addSegments(mappedSegments);
        } catch (err) {
            await DBService.deleteFile(fileId).catch(() => {});
            throw err;
        }

        if (wizardOverlay) wizardOverlay.classList.add('hidden');
        await loadFilesList();
    }

    // ── 匯出 ─────────────────────────────────────────────────────────────────

    /**
     * 將編輯後的句段寫回 .po 格式並觸發下載。
     *
     * @param {object} f      - DB 中的 file 物件（含 originalFileBuffer、name）
     * @param {object[]} segs - 句段陣列（含 idValue、targetText）
     */
    async function exportPo(f, segs) {
        if (!f.originalFileBuffer || !(f.originalFileBuffer.byteLength > 0)) {
            throw new Error('無法匯出：找不到原始 .po 檔案內容，請確認檔案已自雲端完整同步後再試。');
        }

        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(new Uint8Array(f.originalFileBuffer));
        const entries = parsePo(text);

        // 建立 idValue → targetText 的查找表
        const targetMap = new Map();
        for (const s of segs) {
            targetMap.set(String(s.idValue || ''), s.targetText || '');
        }

        const parts = [];
        for (const entry of entries) {
            if (entry.isHeader) {
                parts.push(serializeEntry(entry));
                continue;
            }

            const key = entry.msgctxt !== null ? entry.msgctxt : entry.msgid;
            const newMsgstr = targetMap.has(key) ? targetMap.get(key) : entry.msgstr;

            // 若現在已有譯文，自動移除 fuzzy 旗標
            let flags = entry.flags;
            if (newMsgstr && entry.isFuzzy) {
                flags = flags.filter(f => f !== 'fuzzy');
            }

            parts.push(serializeEntry(entry, newMsgstr, flags));
        }

        const outputText = parts.join('\n\n') + '\n';
        const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name || 'export.po';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // ── 公開介面 ──────────────────────────────────────────────────────────────

    global.CatToolPoImport = {
        handlePoImport,
        exportPo
    };

})(typeof window !== 'undefined' ? window : globalThis);
