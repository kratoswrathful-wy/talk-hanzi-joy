/**
 * CAT AI 操作橋接：window.__catAgent
 * 依賴 app.js 掛載後的全域函式與狀態。
 */
(function (global) {
    'use strict';

    function agentOk(data) {
        return { ok: true, data: data };
    }

    function agentFail(error, allowed) {
        var out = { ok: false, error: String(error || 'unknown') };
        if (allowed) out.allowed = allowed;
        return out;
    }

    function getBatchUserId() {
        return String(global._tmsCurrentUserId || global.window?._tmsCurrentUserId || 'local');
    }

    function readDomBatchSettings() {
        if (typeof global._readAiBatchRefOptionsFromDom === 'function') {
            return global._readAiBatchRefOptionsFromDom();
        }
        return {};
    }

    function snapshotPool() {
        if (typeof global._snapshotAiBatchPool === 'function') {
            return global._snapshotAiBatchPool();
        }
        return null;
    }

    function applyPool(pool) {
        if (!pool || typeof pool !== 'object') return;
        global.__aiBatchPool = pool;
        if (typeof global._renderAiBatchCandidatePool === 'function') {
            global._renderAiBatchCandidatePool();
        }
    }

  async function loadUserPrefs(projectId) {
        var uid = getBatchUserId();
        if (!projectId || !global.DBService || !global.DBService.getAiUserBatchPrefs) {
            return { prefs: {} };
        }
        try {
            return await global.DBService.getAiUserBatchPrefs(projectId, uid);
        } catch (_) {
            return { prefs: {} };
        }
    }

    async function saveUserPrefs(projectId, patch) {
        var uid = getBatchUserId();
        if (!projectId || !global.DBService || !global.DBService.saveAiUserBatchPrefs) return null;
        try {
            return await global.DBService.saveAiUserBatchPrefs(projectId, uid, patch);
        } catch (_) {
            return null;
        }
    }

    async function getSettings() {
        var projectId = global.currentProjectId;
        var loaded = await loadUserPrefs(projectId);
        var prefs = loaded.prefs || {};
        var rowLimitEl = document.getElementById('aiBatchLimitRows');
        var charLimitEl = document.getElementById('aiBatchLimitChars');
        return agentOk({
            projectId: projectId || null,
            fileId: global.currentFileId || null,
            virtGrid: !!(global.CatVirtGrid && global.CatVirtGrid.isEnabled && global.CatVirtGrid.isEnabled()),
            rangeMode: global.__catAiBatchRangeMode || 'all',
            rangeExpr: document.getElementById('aiBatchRangeExpr')?.value || '',
            batchRowLimit: rowLimitEl ? parseInt(rowLimitEl.value || '20', 10) : (prefs.batchRowLimit || 20),
            batchCharLimit: charLimitEl ? parseInt(charLimitEl.value || '2500', 10) : (prefs.batchCharLimit || 2500),
            batchRefOptions: prefs.batchRefOptions || readDomBatchSettings(),
            candidatePool: prefs.candidatePool || snapshotPool(),
            batchIntroduction: prefs.batchIntroduction || document.getElementById('aiBatchIntroduction')?.value || '',
            handleConfirmed: prefs.handleConfirmed || document.getElementById('aiBatchHandleConfirmed')?.value || 'skip',
            handleUnconfirmed: prefs.handleUnconfirmed || document.getElementById('aiBatchHandleUnconfirmed')?.value || 'skip',
            tmThreshold: prefs.tmThreshold ?? parseInt(document.getElementById('aiBatchTmThreshold')?.value || '102', 10),
            tmAction: prefs.tmAction || document.getElementById('aiBatchTmAction')?.value || 'direct',
            handleRepetitions: prefs.handleRepetitions || document.getElementById('aiBatchHandleRepetitions')?.value || 'yes',
        });
    }

    async function setSettings(patch) {
        if (!patch || typeof patch !== 'object') return agentFail('patch 必須為物件');
        var projectId = global.currentProjectId;
        var toSave = {};
        if (patch.batchRefOptions) {
            if (typeof global._applyAiBatchRefOptionsToDom === 'function') {
                global._applyAiBatchRefOptionsToDom(patch.batchRefOptions);
            }
            toSave.batchRefOptions = patch.batchRefOptions;
        }
        if (patch.candidatePool) {
            applyPool(patch.candidatePool);
            toSave.candidatePool = patch.candidatePool;
        }
        if (patch.rangeMode) {
            global.__catAiBatchRangeMode = patch.rangeMode;
            if (typeof global._setAiBatchRangeMode === 'function') global._setAiBatchRangeMode(patch.rangeMode);
            toSave.rangeMode = patch.rangeMode;
        }
        if (patch.rangeExpr !== undefined) {
            var exprEl = document.getElementById('aiBatchRangeExpr');
            if (exprEl) exprEl.value = String(patch.rangeExpr || '');
            toSave.rangeExpr = patch.rangeExpr;
        }
        if (patch.batchRowLimit !== undefined) {
            var rowEl = document.getElementById('aiBatchLimitRows');
            if (rowEl) rowEl.value = String(patch.batchRowLimit);
            toSave.batchRowLimit = patch.batchRowLimit;
        }
        if (patch.batchCharLimit !== undefined) {
            var charEl = document.getElementById('aiBatchLimitChars');
            if (charEl) charEl.value = String(patch.batchCharLimit);
            toSave.batchCharLimit = patch.batchCharLimit;
        }
        if (patch.batchIntroduction !== undefined) {
            var introEl = document.getElementById('aiBatchIntroduction');
            if (introEl) introEl.value = String(patch.batchIntroduction || '');
            toSave.batchIntroduction = patch.batchIntroduction;
        }
        var selectIds = {
            handleConfirmed: 'aiBatchHandleConfirmed',
            handleUnconfirmed: 'aiBatchHandleUnconfirmed',
            tmAction: 'aiBatchTmAction',
            handleRepetitions: 'aiBatchHandleRepetitions',
        };
        Object.keys(selectIds).forEach(function (key) {
            if (patch[key] !== undefined) {
                var el = document.getElementById(selectIds[key]);
                if (el) el.value = String(patch[key]);
                toSave[key] = patch[key];
            }
        });
        if (patch.tmThreshold !== undefined) {
            var tmEl = document.getElementById('aiBatchTmThreshold');
            if (tmEl) tmEl.value = String(patch.tmThreshold);
            toSave.tmThreshold = patch.tmThreshold;
        }
        if (projectId && Object.keys(toSave).length) {
            await saveUserPrefs(projectId, toSave);
        }
        if (typeof global._updateBatchStats === 'function') global._updateBatchStats();
        return agentOk({ saved: toSave });
    }

    async function importFromBytes(input) {
        if (!input || typeof input !== 'object') return agentFail('input 必須為物件');
        var fileName = String(input.fileName || 'import.bin');
        var base64 = input.base64;
        var bytes = input.bytes;
        var blob;
        if (typeof base64 === 'string' && base64.length) {
            var raw = base64.indexOf(',') >= 0 ? base64.split(',').pop() : base64;
            var bin = atob(raw);
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            blob = new Blob([arr], { type: input.contentType || 'application/octet-stream' });
        } else if (bytes && (bytes instanceof Uint8Array || Array.isArray(bytes))) {
            blob = new Blob([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], { type: input.contentType || 'application/octet-stream' });
        } else {
            return agentFail('需提供 base64 或 bytes');
        }
        var file = new File([blob], fileName, { type: input.contentType || blob.type || 'application/octet-stream' });
        if (typeof global.runBatchImport !== 'function') {
            return agentFail('runBatchImport 不可用（請確認已開啟專案）');
        }
        var langChoice = {
            sourceLang: input.sourceLang || global._importSelectedSrcLang || '',
            targetLang: input.targetLang || global._importSelectedTgtLang || '',
        };
        if (!langChoice.sourceLang || !langChoice.targetLang) {
            return agentFail('請提供 sourceLang 與 targetLang');
        }
        var roleMap = global._batchMqRoles instanceof Map ? global._batchMqRoles : new Map();
        if (input.mqRole && fileName.toLowerCase().endsWith('.mqxliff')) {
            roleMap.set(file, input.mqRole);
        }
        var excelConfigMap = input.excelConfigMap instanceof Map ? input.excelConfigMap : new Map();
        var caseInfo = input.caseInfo || null;
        try {
            await global.runBatchImport([file], langChoice, roleMap, excelConfigMap, caseInfo);
            return agentOk({ fileName: fileName, imported: true });
        } catch (err) {
            return agentFail(err && err.message ? err.message : String(err));
        }
    }

    function describe() {
        return agentOk({
            projectId: global.currentProjectId || null,
            fileId: global.currentFileId || null,
            segmentCount: Array.isArray(global.currentSegmentsList) ? global.currentSegmentsList.length : 0,
            virtGridEnabled: !!(global.CatVirtGrid && global.CatVirtGrid.isEnabled && global.CatVirtGrid.isEnabled()),
            apis: ['describe', 'aiBatch.getSettings', 'aiBatch.setSettings', 'aiBatch.openModal', 'aiBatch.run', 'import.fromBytes'],
        });
    }

    function buildApi() {
        return {
            describe: describe,
            aiBatch: {
                getSettings: getSettings,
                setSettings: setSettings,
                openModal: function () {
                    if (typeof global.openAiBatchModal === 'function') {
                        global.openAiBatchModal();
                        return agentOk({ opened: true });
                    }
                    return agentFail('openAiBatchModal 不可用');
                },
                run: async function () {
                    var runBtn = document.getElementById('btnRunAiBatch');
                    if (!runBtn || typeof runBtn.onclick !== 'function') {
                        return agentFail('請先開啟 AI 批次 Modal');
                    }
                    await runBtn.onclick();
                    return agentOk({ started: true });
                },
                previewPrompt: async function () {
                    if (typeof global._openAiBatchPromptPreview === 'function') {
                        await global._openAiBatchPromptPreview();
                        return agentOk({ preview: true });
                    }
                    return agentFail('preview 不可用');
                },
            },
            import: {
                fromBytes: importFromBytes,
            },
        };
    }

    function handleInvoke(ev) {
        if (!ev || !ev.data || ev.data.type !== 'CAT_AGENT_INVOKE') return;
        var requestId = ev.data.requestId;
        var method = String(ev.data.method || '');
        var args = Array.isArray(ev.data.args) ? ev.data.args : [];
        var api = global.__catAgent;
        if (!api || !requestId) return;

        function reply(result) {
            try {
                global.parent.postMessage({
                    type: 'CAT_AGENT_INVOKE_RESULT',
                    requestId: requestId,
                    ok: result.ok !== false,
                    data: result.data,
                    error: result.error,
                    allowed: result.allowed,
                }, global.location.origin);
            } catch (_) { /* ignore */ }
        }

        (async function () {
            try {
                var parts = method.split('.');
                var target = api;
                for (var i = 0; i < parts.length; i++) {
                    target = target && target[parts[i]];
                }
                if (typeof target !== 'function') {
                    reply(agentFail('未知方法: ' + method));
                    return;
                }
                var out = await target.apply(parts.length === 1 ? api : target, args);
                reply(out && typeof out === 'object' && 'ok' in out ? out : agentOk(out));
            } catch (err) {
                reply(agentFail(err && err.message ? err.message : String(err)));
            }
        })();
    }

    function installCatAgentBridge() {
        global.__catAgent = buildApi();
        global._loadAiUserBatchPrefsForModal = loadUserPrefs;
        global._saveAiUserBatchPrefsPatch = saveUserPrefs;
        if (!global.__catAgentMessageBound) {
            global.__catAgentMessageBound = true;
            global.addEventListener('message', handleInvoke);
        }
    }

    global.installCatAgentBridge = installCatAgentBridge;
})(typeof window !== 'undefined' ? window : globalThis);
