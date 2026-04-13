/**
 * XLIFF / mqxliff / sdlxliff 匯入：解析 trans-unit、狀態與 memoQ 結構，
 * 標籤文字與 sourceTags/targetTags 交由 CatToolXliffTags.extractTaggedText。
 *
 * 載入順序：js/xliff-tag-pipeline.js → 本檔 → app.js
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
            selectedTargetLang = ''
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

        // 讀取原始檔的語言對（XLIFF <file> 元素屬性）
        const fileNode = xml.getElementsByTagName('file')[0];
        const originalSourceLang = fileNode ? (fileNode.getAttribute('source-language') || fileNode.getAttribute('xml:lang') || '') : '';
        const originalTargetLang = fileNode ? (fileNode.getAttribute('target-language') || '') : '';

        const transUnits = Array.from(xml.getElementsByTagName('trans-unit'));
        if (!transUnits.length) {
            throw new Error('找不到任何 trans-unit，檔案格式可能不符合 XLIFF 規範');
        }

        const segments = [];

        const lowerFileName = (file.name || '').toLowerCase();
        const isMqxliffFile = lowerFileName.endsWith('.mqxliff') ||
            !!xml.documentElement.lookupNamespaceURI('mq');

        transUnits.forEach((tu, idx) => {
            const fallbackId = tu.getAttribute('id') || tu.getAttribute('resname') || tu.getAttribute('mq:unitId') || '';
            const sourceNode = tu.getElementsByTagName('source')[0];
            const targetNode = tu.getElementsByTagName('target')[0];

            const { text: sourceText, tags: sourceTags } = sourceNode
                ? Xliff.extractTaggedText(sourceNode) : { text: '', tags: [] };
            const { text: targetText, tags: targetTags } = targetNode
                ? Xliff.extractTaggedText(targetNode) : { text: '', tags: [] };

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
            }

            let status = 'unconfirmed';
            let matchValue = '';
            let confirmationRole = null;
            let originalRole = null;

            if (targetNode) {
                const stateAttr = targetNode.getAttribute('state') || targetNode.getAttribute('mq:state');
                const confirmedStates = ['translated', 'final', 'signed-off', 'reviewed', 'approved', 'confirmed'];
                if (stateAttr && confirmedStates.includes(stateAttr.toLowerCase())) {
                    status = 'confirmed';
                }
            }

            const mqPercent = tu.getAttribute('mq:percent') ||
                              (targetNode && (targetNode.getAttribute('mq:percent') || targetNode.getAttribute('percent')));
            if (mqPercent && !Number.isNaN(parseInt(mqPercent, 10))) {
                matchValue = parseInt(mqPercent, 10).toString();
            }

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
                rowIdx: idx,
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
                comments: structuredComments,
                sourceFormat: isMqxliffFile ? 'mqxliff' : 'xliff',
                confirmationRole,
                originalRole,
                sourceTags,
                targetTags
            });
        });

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
        const entry = makeBaseLogEntry('create', 'project-file', {
            entityId: fileId,
            entityName: file.name
        });
        if (currentProjectId) {
            await appendProjectChangeLog(currentProjectId, entry);
            await DBService.addModuleLog('projects', entry);
        }
        const mappedSegments = segments.map((s, idx) => ({ ...s, fileId, globalId: idx + 1 }));
        await DBService.addSegments(mappedSegments);

        if (wizardOverlay) wizardOverlay.classList.add('hidden');
        await loadFilesList();
        return { originalSourceLang, originalTargetLang };
    }

    global.CatToolXliffImport = {
        handleXliffLikeImport
    };
})(typeof window !== 'undefined' ? window : globalThis);
