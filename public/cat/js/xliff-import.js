/**
 * XLIFF / mqxliff / sdlxliff 匯入：解析 trans-unit、狀態與 memoQ 結構，
 * 標籤文字與 sourceTags/targetTags 交由 CatToolXliffTags.extractTaggedText。
 *
 * 載入順序：js/xliff-tag-pipeline.js → 本檔 → app.js
 *
 * sdlxliff 多段 TU：一個 trans-unit 可含多個 <mrk mtype="seg" mid="N">。
 * 每個 mrk 對建立獨立 segment，idValue 格式為 {tuId}#{mid}。
 */
(function (global) {
    'use strict';

    function applyImportConfirmOptions(segments, opts) {
        if (!opts || !opts.markSystemConfirmed) return segments;
        const now = new Date().toISOString();
        const userId = String((typeof window !== 'undefined' && window._tmsCurrentUserId) || '').trim() || null;
        return segments.map((s) => {
            if (!s || s.status !== 'confirmed') return s;
            return {
                ...s,
                wfTransConfirmedAt: now,
                wfTransConfirmedBy: userId,
            };
        });
    }

    /**
     * @param {object} ctx
     * @param {object} ctx.Xliff - window.CatToolXliffTags
     * @param {object} ctx.DBService
     * @param {string|number|null} ctx.currentProjectId
     * @param {Element} ctx.wizardOverlay
     * @param {function} ctx.makeBaseLogEntry
     * @param {function} ctx.appendProjectChangeLog
     * @param {function} ctx.loadFilesList
     * @param {string} [ctx.selectedSourceLang]  匯入前使用者從語言對選擇器選定的原文語言
     * @param {string} [ctx.selectedTargetLang]  匯入前使用者從語言對選擇器選定的譯文語言
     * @param {function} [ctx.showConfirmedSegmentsDialog]  B-7e 原檔已確認句段對話框
     * @param {function} [ctx.writeImportConfirmedToProjectTms]  B-7e 寫入專案 TM
     * @param {function} [ctx.showCatToast]  匯入 TM 寫入結果提示
     * @param {File} file
     * @param {string} [defaultMqRole]  mqxliff 匯入時由 UI 選擇的身分，寫入檔案中繼
     * @returns {Promise<{originalSourceLang:string, originalTargetLang:string}>}
     */
    async function handleXliffLikeImport(ctx, file, defaultMqRole) {
        const Xliff = ctx.Xliff;
        const {
            DBService,
            currentProjectId,
            wizardOverlay,
            makeBaseLogEntry,
            appendProjectChangeLog,
            loadFilesList,
            selectedSourceLang = '',
            selectedTargetLang = '',
            caseInfo = null,
            showConfirmedSegmentsDialog,
            writeImportConfirmedToProjectTms,
            showCatToast,
        } = ctx;

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

        const BS = global.CatToolXliffBuildSegments;
        if (!BS || typeof BS.buildSegmentsFromXliffXml !== 'function') {
            throw new Error('XLIFF 句段建構模組未載入（請確認 index.html 已引入 js/xliff-build-segments.js）');
        }
        const { segments: rawSegments, originalSourceLang, originalTargetLang } =
            BS.buildSegmentsFromXliffXml(xml, file.name || '');
        if (!rawSegments.length) {
            throw new Error('檔案中沒有可匯入的句段（原文與譯文皆空白）');
        }

        let segments = rawSegments;
        let importOpts = null;
        const confirmedCount = segments.filter((s) => s && s.status === 'confirmed').length;

        if (confirmedCount > 0 && typeof showConfirmedSegmentsDialog === 'function') {
            importOpts = await showConfirmedSegmentsDialog({
                originalSourceLang,
                originalTargetLang,
                confirmedCount,
                systemSourceLang: selectedSourceLang,
                systemTargetLang: selectedTargetLang,
            });
            if (!importOpts || importOpts.cancelled) {
                throw new Error('已取消匯入');
            }
            segments = applyImportConfirmOptions(segments, importOpts);
        }

        const encoder = new TextEncoder();
        const buffer = encoder.encode(text).buffer;

        const fileId = await DBService.createFile(
            currentProjectId,
            file.name,
            buffer,
            selectedSourceLang,
            selectedTargetLang,
            originalSourceLang,
            originalTargetLang
        );
        if (defaultMqRole && (file.name || '').toLowerCase().endsWith('.mqxliff')) {
            await DBService.updateFile(fileId, { defaultMqRole });
        }
        if (caseInfo && caseInfo.caseId) {
            await DBService.updateFile(fileId, {
                relatedLmsCaseId: caseInfo.caseId,
                relatedLmsCaseTitle: caseInfo.caseTitle || ''
            });
        }
        const entry = makeBaseLogEntry('create', 'project-file', {
            entityId: fileId,
            entityName: file.name
        });
        if (currentProjectId) {
            await appendProjectChangeLog(currentProjectId, entry);
            await DBService.addModuleLog('projects', entry);
        }
        const mappedSegments = segments.map((s, idx) => ({ ...s, fileId, globalId: idx + 1 }));
        try {
            await DBService.addSegments(mappedSegments);
        } catch (err) {
            await DBService.deleteFile(fileId).catch(() => {});
            throw err;
        }

        if (importOpts && importOpts.writeToTm && typeof writeImportConfirmedToProjectTms === 'function') {
            try {
                const tmResult = await writeImportConfirmedToProjectTms(file, {
                    tmSourceLang: importOpts.tmSourceLang || selectedSourceLang,
                    tmTargetLang: importOpts.tmTargetLang || selectedTargetLang,
                    includeLocked: importOpts.includeLocked !== false,
                });
                if (typeof showCatToast === 'function') {
                    const written = tmResult && tmResult.written != null ? tmResult.written : 0;
                    if (written > 0) {
                        showCatToast(`已將 ${written} 筆原檔已確認句段寫入翻譯記憶庫`, 'info');
                    } else if (tmResult && tmResult.skippedReason === 'no_write_tm') {
                        showCatToast('專案未掛載寫入用的翻譯記憶庫，已確認句段未寫入 TM', 'info');
                    } else if (written === 0) {
                        showCatToast('沒有符合條件的已確認句段寫入翻譯記憶庫', 'info');
                    }
                }
            } catch (tmErr) {
                console.warn('[import] TM write after xliff import', tmErr);
                if (typeof showCatToast === 'function') {
                    showCatToast('寫入翻譯記憶庫時發生錯誤，請稍後再試', 'error');
                }
            }
        }

        if (wizardOverlay) wizardOverlay.classList.add('hidden');
        await loadFilesList();
        return { originalSourceLang, originalTargetLang };
    }

    global.CatToolXliffImport = {
        handleXliffLikeImport
    };
})(typeof window !== 'undefined' ? window : globalThis);
