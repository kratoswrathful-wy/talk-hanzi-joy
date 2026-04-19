/**
 * AI 翻譯服務模組
 * 掛載於 window.CatAiTranslate
 * 依賴：window.CatToolXliffTags（js/xliff-tag-pipeline.js）
 */
;(function () {
    'use strict';

    // ---- 錯誤訊息對照 ----
    const ERROR_MESSAGES = {
        invalid_api_key:      'API Key 無效或已過期，請至「AI 設定」重新輸入。',
        insufficient_quota:   '帳戶額度已用盡，請至 OpenAI 後台充值後再試。',
        rate_limit_exceeded:  '請求速率超過上限，請稍後再試。',
        context_length_exceeded: '提示內容過長，請縮短準則或減少批次大小後再試。',
        model_not_found:      '指定的模型不存在，請至「AI 設定」確認模型名稱。',
        server_error:         'OpenAI 伺服器發生錯誤，請稍後再試。',
        network_error:        '網路連線失敗，請確認網路狀態後再試。',
        parse_error:          'AI 回傳格式不正確，正在重試……',
        unknown:              '發生未知錯誤，請稍後再試。'
    };

    function classifyError(err, status, body) {
        if (!status) return 'network_error';
        if (status === 401) return 'invalid_api_key';
        if (status === 429) {
            const code = body?.error?.code || '';
            if (code === 'insufficient_quota') return 'insufficient_quota';
            return 'rate_limit_exceeded';
        }
        if (status === 400) {
            const code = body?.error?.code || '';
            if (code === 'context_length_exceeded') return 'context_length_exceeded';
            if (code === 'model_not_found') return 'model_not_found';
            return 'unknown';
        }
        if (status >= 500) return 'server_error';
        return 'unknown';
    }

    function friendlyError(err, status, body) {
        const key = classifyError(err, status, body);
        return ERROR_MESSAGES[key] || ERROR_MESSAGES.unknown;
    }

    // ---- XLIFF tag 處理 ----

    /**
     * 從原文抽出乾淨文字，並建立 placeholder → 原始 tag 的對照表。
     * 若 CatToolXliffTags 不存在（純文字檔案），直接回傳原文。
     */
    function stripTags(sourceText) {
        const Xliff = window.CatToolXliffTags;
        if (!Xliff || !sourceText) return { clean: sourceText || '', tagMap: null };
        try {
            const result = Xliff.extractTaggedText(sourceText);
            if (result && typeof result.clean === 'string') {
                return { clean: result.clean, tagMap: result.tagMap || null };
            }
        } catch (_) {}
        return { clean: sourceText, tagMap: null };
    }

    /**
     * 將 AI 譯文裡的 placeholder 還原成原始 tag。
     */
    function restoreTags(translatedText, tagMap) {
        if (!tagMap || !translatedText) return translatedText || '';
        const Xliff = window.CatToolXliffTags;
        if (!Xliff) return translatedText;
        try {
            const result = Xliff.replacePlaceholders(translatedText, tagMap);
            return typeof result === 'string' ? result : translatedText;
        } catch (_) {
            return translatedText;
        }
    }

    // ---- Prompt 建構 ----

    /**
     * 建構送給 OpenAI 的 messages 陣列。
     * @param {Array} segments - [{ idx, source, contextPrev, contextNext, keys, extraValue }]
     * @param {Object} options - { sourceLang, targetLang, guidelines[], styleExamples[], tbTerms[], batchNote }
     */
    function buildPrompt(segments, options = {}) {
        const {
            sourceLang = '',
            targetLang = '',
            guidelines = [],
            styleExamples = [],
            tbTerms = [],
            batchNote = ''
        } = options;

        const srcLabel = sourceLang ? sourceLang.toUpperCase() : '原文語言';
        const tgtLabel = targetLang ? targetLang.toUpperCase() : '目標語言';

        let system = `你是專業的 ${srcLabel}→${tgtLabel} 翻譯人員，請嚴格依照以下指示進行翻譯。\n`;

        // 翻譯準則
        if (guidelines.length > 0) {
            system += '\n【翻譯準則】\n';
            guidelines.forEach((g, i) => {
                system += `${i + 1}. ${g.content}\n`;
            });
        }

        // 術語規範
        if (tbTerms.length > 0) {
            system += '\n【術語規範（原文 → 譯文）】\n';
            tbTerms.forEach(t => {
                system += `- "${t.source}" → "${t.target}"`;
                if (t.note) system += `（${t.note}）`;
                system += '\n';
            });
        }

        // 風格範例
        if (styleExamples.length > 0) {
            system += '\n【過去翻譯修改範例（請參考以學習譯者的文風偏好）】\n';
            styleExamples.slice(0, 15).forEach((ex, i) => {
                system += `\n範例 ${i + 1}：\n`;
                system += `  原文：${ex.sourceText}\n`;
                system += `  AI 初稿：${ex.aiDraft}\n`;
                system += `  最終採用：${ex.userFinal}\n`;
                const notes = Array.isArray(ex.editNotes) ? ex.editNotes.filter(Boolean) : [];
                if (notes.length > 0) system += `  修改說明：${notes.join('；')}\n`;
                const tags = Array.isArray(ex.modTags) ? ex.modTags.filter(Boolean) : [];
                if (tags.length > 0) system += `  修改類型：${tags.join('、')}\n`;
            });
        }

        // 單批特殊指示
        if (batchNote && batchNote.trim()) {
            system += `\n【本批次特殊指示】\n${batchNote.trim()}\n`;
        }

        system += `\n【回傳格式要求】
請將以下每個句段翻譯為 ${tgtLabel}，以 JSON 物件回傳，格式如下：
{"translations":[{"idx":0,"translation":"..."},{"idx":1,"translation":"..."},...]}
- 請確保 translations 陣列中包含每個句段（idx 0 到 ${segments.length - 1}），不得遺漏。
- 不要在 JSON 以外輸出任何文字。
- 請確保批次內相同術語的翻譯一致。`;

        // 使用者訊息：逐句列出原文
        let user = '請翻譯以下句段：\n\n';
        segments.forEach(seg => {
            user += `[句段 ${seg.idx}]\n`;
            if (seg.keys && seg.keys.length > 0) user += `Key: ${seg.keys.join(' / ')}\n`;
            if (seg.extraValue) user += `備註: ${seg.extraValue}\n`;
            if (seg.contextPrev) user += `前文: ${seg.contextPrev}\n`;
            user += `原文: ${seg.source}\n`;
            if (seg.contextNext) user += `後文: ${seg.contextNext}\n`;
            user += '\n';
        });

        return [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ];
    }

    // ---- API 呼叫 ----

    /**
     * 送出翻譯請求。
     * @returns {{ results: [{idx, translation}], missing: [idx], error: string|null }}
     */
    async function callApi(messages, settings) {
        const { apiKey, apiBaseUrl, model } = settings;
        const baseUrl = (apiBaseUrl || 'https://api.openai.com').replace(/\/$/, '');
        const url = `${baseUrl}/v1/chat/completions`;

        let resp;
        try {
            resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model || 'gpt-4.1-mini',
                    messages,
                    response_format: { type: 'json_object' },
                    temperature: 0.3
                })
            });
        } catch (netErr) {
            return { results: [], missing: [], error: ERROR_MESSAGES.network_error };
        }

        let body;
        try { body = await resp.json(); } catch (_) { body = null; }

        if (!resp.ok) {
            return { results: [], missing: [], error: friendlyError(null, resp.status, body) };
        }

        // 解析 JSON
        const raw = body?.choices?.[0]?.message?.content || '';
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            return { results: [], missing: [], error: ERROR_MESSAGES.parse_error };
        }

        const translations = Array.isArray(parsed.translations) ? parsed.translations : [];
        return { results: translations, missing: [], error: null };
    }

    // ---- 主要 translate 函式 ----

    /**
     * 翻譯一批句段（含 XLIFF tag 去除與還原）。
     * @param {Array} segments - 句段物件陣列，每筆含 { id, sourceText, keys, extraValue, contextPrev, contextNext }
     * @param {Object} options - { settings, sourceLang, targetLang, guidelines, styleExamples, tbTerms, batchNote }
     * @returns {{ results: [{segId, translation, aiDraft}], missing: [segId], error: string|null }}
     */
    async function translate(segments, options = {}) {
        if (!segments || segments.length === 0) return { results: [], missing: [], error: null };

        const settings = options.settings || {};
        if (!settings.apiKey) {
            return { results: [], missing: [], error: 'API Key 未設定，請至「AI 設定」填入 API Key。' };
        }

        // 建立 idx → segment 對照，並 strip tags
        const indexed = segments.map((seg, i) => {
            const { clean, tagMap } = stripTags(seg.sourceText || '');
            return {
                idx: i,
                segId: seg.id,
                source: clean,
                tagMap,
                keys: seg.keys || [],
                extraValue: seg.extraValue || '',
                contextPrev: seg.contextPrev || '',
                contextNext: seg.contextNext || ''
            };
        });

        const messages = buildPrompt(indexed, {
            sourceLang: options.sourceLang,
            targetLang: options.targetLang,
            guidelines: options.guidelines || [],
            styleExamples: options.styleExamples || [],
            tbTerms: options.tbTerms || [],
            batchNote: options.batchNote || ''
        });

        const apiResult = await callApi(messages, settings);
        if (apiResult.error && apiResult.results.length === 0) {
            return { results: [], missing: segments.map(s => s.id), error: apiResult.error };
        }

        // 建立 idx → translation 對照
        const byIdx = new Map(apiResult.results.map(r => [r.idx, r.translation]));

        // 比對哪些 idx 缺失
        const missingIdxs = indexed.filter(s => !byIdx.has(s.idx)).map(s => s.idx);
        const missingSegIds = missingIdxs.map(i => indexed[i].segId);

        // 還原標籤並組建結果
        const results = [];
        indexed.forEach(entry => {
            const raw = byIdx.get(entry.idx);
            if (raw == null) return;
            const translation = restoreTags(raw, entry.tagMap);
            results.push({ segId: entry.segId, translation, aiDraft: translation });
        });

        return {
            results,
            missing: missingSegIds,
            error: apiResult.error || null
        };
    }

    // ---- 局部重試 ----

    /**
     * 只重送 missing 的句段。
     * @param {Array} missingSegIds - 需要重試的 segment ID 陣列
     * @param {Array} allSegments - 所有句段（用來找到對應的 sourceText 等）
     * @param {Object} options - 同 translate()
     * @returns 同 translate()
     */
    async function retryMissing(missingSegIds, allSegments, options) {
        const subset = allSegments.filter(s => missingSegIds.includes(s.id));
        return await translate(subset, options);
    }

    // ---- 輔助工具 ----

    /** 計算兩段文字的差異比例（0–1），用來決定 diff 顯示方式 */
    function diffRatio(textA, textB) {
        if (!textA && !textB) return 0;
        if (!textA || !textB) return 1;
        const maxLen = Math.max(textA.length, textB.length);
        if (maxLen === 0) return 0;
        let same = 0;
        const minLen = Math.min(textA.length, textB.length);
        for (let i = 0; i < minLen; i++) {
            if (textA[i] === textB[i]) same++;
        }
        return 1 - same / maxLen;
    }

    // ---- 公開介面 ----
    window.CatAiTranslate = {
        translate,
        retryMissing,
        buildPrompt,
        diffRatio,
        friendlyError
    };
})();
