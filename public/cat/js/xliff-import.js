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
            caseInfo = null
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
        const { segments, originalSourceLang, originalTargetLang } = BS.buildSegmentsFromXliffXml(xml, file.name || '');
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

        if (wizardOverlay) wizardOverlay.classList.add('hidden');
        await loadFilesList();
        return { originalSourceLang, originalTargetLang };
    }

    global.CatToolXliffImport = {
        handleXliffLikeImport
    };
})(typeof window !== 'undefined' ? window : globalThis);
