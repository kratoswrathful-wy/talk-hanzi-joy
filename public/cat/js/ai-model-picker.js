/**
 * CAT AI 設定：精選模型選單（僅 enabled=true registry 列）。
 * 依賴 CatAiModelTemperature.shouldOmitTemperature（與 model-capabilities 規則一致）。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.CatAiModelPicker = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var FALLBACK_MODEL_ID = 'gpt-4.1-mini';
    var DEFAULT_MODEL_ID = 'gpt-5.5';
    var TEMPERATURE_HINT_ZH = '此模型需省略 temperature（CAT 呼叫時不送自訂 temperature）';

    /** 2026-07-06 production 精選五模型；offline / RPC 失敗時使用。 */
    var OFFLINE_MANIFEST = [
        {
            modelId: 'gpt-5.5',
            displayNameZh: 'GPT-5.5',
            shortLabelZh: '高品質預設',
            usageHintZh: '品質優先，適合正式譯稿、QA 複查與需較高語意準確度的句段。此模型呼叫時不送自訂 temperature。',
            enabled: true,
            isDefault: true,
            sortOrder: 10,
            supportsChatCompletions: true,
            supportsResponsesApi: true,
            providerAvailable: true
        },
        {
            modelId: 'gpt-5.4-mini',
            displayNameZh: 'GPT-5.4 mini',
            shortLabelZh: '快速省用',
            usageHintZh: '速度與成本較平衡，適合日常批次翻譯與大量句段初稿。',
            enabled: true,
            isDefault: false,
            sortOrder: 20,
            supportsChatCompletions: true,
            supportsResponsesApi: true,
            providerAvailable: true
        },
        {
            modelId: 'gpt-4.1',
            displayNameZh: 'GPT-4.1',
            shortLabelZh: '穩定通用',
            usageHintZh: 'GPT-5 系列以外的穩定選項，輸出風格可預期，適合一般翻譯與確認作業。',
            enabled: true,
            isDefault: false,
            sortOrder: 30,
            supportsChatCompletions: true,
            supportsResponsesApi: true,
            providerAvailable: true
        },
        {
            modelId: 'gpt-4.1-mini',
            displayNameZh: 'GPT-4.1 mini',
            shortLabelZh: '低成本備援',
            usageHintZh: '成本最低，適合大量預翻、初稿與可接受較輕量品質的批次；亦作系統備援模型。',
            enabled: true,
            isDefault: false,
            sortOrder: 40,
            supportsChatCompletions: true,
            supportsResponsesApi: true,
            providerAvailable: true
        },
        {
            modelId: 'gpt-5.5-pro',
            displayNameZh: 'GPT-5.5 pro',
            shortLabelZh: '最高品質',
            usageHintZh: '最高品質手動選項，適合特別重要、成本不敏感或需要更強語意推理的譯稿與 QA 複查。此模型呼叫時不送自訂 temperature。',
            enabled: true,
            isDefault: false,
            sortOrder: 50,
            supportsChatCompletions: true,
            supportsResponsesApi: true,
            providerAvailable: true
        }
    ];

    function shouldOmitTemperature(modelId) {
        if (window.CatAiModelTemperature && typeof window.CatAiModelTemperature.shouldOmitTemperature === 'function') {
            return window.CatAiModelTemperature.shouldOmitTemperature(modelId);
        }
        var id = String(modelId || '').trim().toLowerCase();
        if (!id) return false;
        return /^gpt-5\.5(-pro)?(-\d{4}-\d{2}-\d{2})?$/.test(id);
    }

    function sortRows(rows) {
        return rows.slice().sort(function (a, b) {
            var ao = Number(a.sortOrder != null ? a.sortOrder : a.sort_order) || 0;
            var bo = Number(b.sortOrder != null ? b.sortOrder : b.sort_order) || 0;
            if (ao !== bo) return ao - bo;
            var an = String(a.displayNameZh || a.display_name_zh || a.modelId || a.model_id || '');
            var bn = String(b.displayNameZh || b.display_name_zh || b.modelId || b.model_id || '');
            return an.localeCompare(bn, 'zh-Hant');
        });
    }

    function rowModelId(row) {
        return String(row.modelId || row.model_id || '').trim();
    }

    function pickDefaultModelId(rows) {
        if (!rows || !rows.length) return DEFAULT_MODEL_ID;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].isDefault || rows[i].is_default) return rowModelId(rows[i]);
        }
        return rowModelId(rows[0]);
    }

    function resolveSelectedModelId(savedModel, rows) {
        var normalized = String(savedModel || '').trim();
        var ids = rows.map(rowModelId);
        if (normalized && ids.indexOf(normalized) >= 0) return normalized;
        return pickDefaultModelId(rows);
    }

    function formatOptionLabel(row) {
        var name = row.displayNameZh || row.display_name_zh || rowModelId(row);
        var short = (row.shortLabelZh || row.short_label_zh || '').trim();
        var badges = [];
        if (row.isDefault || row.is_default) badges.push('預設');
        if (rowModelId(row) === FALLBACK_MODEL_ID && !(row.isDefault || row.is_default)) {
            badges.push('備援');
        }
        var badgeText = badges.length ? ' [' + badges.join(' · ') + ']' : '';
        var shortText = short ? ' · ' + short : '';
        return name + shortText + badgeText + ' (' + rowModelId(row) + ')';
    }

    function findRowByModelId(rows, modelId) {
        var target = String(modelId || '').trim();
        for (var i = 0; i < rows.length; i++) {
            if (rowModelId(rows[i]) === target) return rows[i];
        }
        return null;
    }

    function renderHint(row, source) {
        var parts = [];
        if (source === 'offline') {
            parts.push('目前使用離線精選清單（可能與雲端 registry 不同步）。');
        }
        if (!row) {
            parts.push('請選擇精選模型。');
            return parts.join(' ');
        }
        var hint = (row.usageHintZh || row.usage_hint_zh || '').trim();
        if (hint) parts.push(hint);
        if (shouldOmitTemperature(rowModelId(row))) {
            parts.push(TEMPERATURE_HINT_ZH);
        }
        if (row.providerAvailable === false || row.provider_available === false) {
            parts.push('供應商回報此模型目前不可用，仍可依需求選用。');
        }
        return parts.join(' ');
    }

    async function loadEnabledModels() {
        try {
            var svc = typeof DBService !== 'undefined' ? DBService : null;
            if (svc && typeof svc.listEnabledCatAiModelOptions === 'function') {
                var rows = await svc.listEnabledCatAiModelOptions();
                if (Array.isArray(rows) && rows.length > 0) {
                    return { rows: sortRows(rows), source: 'live' };
                }
            }
        } catch (_) { /* offline fallback */ }
        return { rows: sortRows(OFFLINE_MANIFEST), source: 'offline' };
    }

    /**
     * @param {HTMLSelectElement|null} selectEl
     * @param {HTMLElement|null} hintEl
     * @param {HTMLElement|null} statusEl
     * @param {string|null|undefined} savedModel
     * @returns {Promise<{ rows: object[], selectedModelId: string, source: string }>}
     */
    async function populate(selectEl, hintEl, statusEl, savedModel) {
        var loaded = await loadEnabledModels();
        var rows = loaded.rows;
        var source = loaded.source;
        var selectedId = resolveSelectedModelId(savedModel, rows);

        if (statusEl) {
            statusEl.textContent = source === 'offline'
                ? '離線精選清單'
                : '雲端精選模型（enabled=true）';
            statusEl.style.color = source === 'offline' ? '#b45309' : '#64748b';
        }

        if (selectEl) {
            selectEl.innerHTML = '';
            rows.forEach(function (row) {
                var opt = document.createElement('option');
                opt.value = rowModelId(row);
                opt.textContent = formatOptionLabel(row);
                if (rowModelId(row) === selectedId) opt.selected = true;
                selectEl.appendChild(opt);
            });
            selectEl.onchange = function () {
                if (hintEl) {
                    hintEl.textContent = renderHint(findRowByModelId(rows, selectEl.value), source);
                }
            };
        }

        if (hintEl) {
            hintEl.textContent = renderHint(findRowByModelId(rows, selectedId), source);
        }

        return { rows: rows, selectedModelId: selectedId, source: source };
    }

    function getSelectedModelId(selectEl) {
        if (!selectEl || !selectEl.value) return DEFAULT_MODEL_ID;
        return String(selectEl.value).trim() || DEFAULT_MODEL_ID;
    }

    return {
        OFFLINE_MANIFEST: OFFLINE_MANIFEST,
        DEFAULT_MODEL_ID: DEFAULT_MODEL_ID,
        TEMPERATURE_HINT_ZH: TEMPERATURE_HINT_ZH,
        shouldOmitTemperature: shouldOmitTemperature,
        resolveSelectedModelId: resolveSelectedModelId,
        loadEnabledModels: loadEnabledModels,
        populate: populate,
        getSelectedModelId: getSelectedModelId,
        formatOptionLabel: formatOptionLabel
    };
});
