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
        insufficient_quota:   '帳號額度已用盡，請至 OpenAI 後台儲值後再試。',
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
     * @param {Object} options - { sourceLang, targetLang, guidelines[], styleExamples[], tbTerms[], batchNote, projectGuidelinesNote }
     */
    function buildPrompt(segments, options = {}) {
        const {
            sourceLang = '',
            targetLang = '',
            guidelines = [],
            styleGuidelines = [],
            styleExamples = [],
            tbTerms = [],
            batchNote = '',
            projectGuidelinesNote = '',
            systemPrefix = ''
        } = options;

        const srcLabel = sourceLang ? sourceLang.toUpperCase() : '原文語言';
        const tgtLabel = targetLang ? targetLang.toUpperCase() : '目標語言';

        let system = (systemPrefix && String(systemPrefix).trim() ? String(systemPrefix).trim() + '\n\n' : '') +
            `你是專業的 ${srcLabel}→${tgtLabel} 翻譯人員，請嚴格依照以下指示進行翻譯。\n`;

        // 翻譯準則（§5.6：有議題群組時前綴〔群組名〕）
        if (guidelines.length > 0) {
            system += '\n【翻譯準則】\n';
            guidelines.forEach((g, i) => {
                const prefix = (g && g.issueGroupName) ? `〔${g.issueGroupName}〕 ` : '';
                system += `${i + 1}. ${prefix}${g.content}\n`;
            });
        }
        if (Array.isArray(styleGuidelines) && styleGuidelines.length > 0) {
            system += '\n【文風偏好】\n';
            styleGuidelines.forEach((g, i) => {
                const prefix = (g && g.issueGroupName) ? `〔${g.issueGroupName}〕 ` : '';
                system += `${i + 1}. ${prefix}${g.content}\n`;
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

        // 專案準則（全專案檔案共用；標題固定為「專案準則」，不併入【本批次特殊指示】）
        if (projectGuidelinesNote && projectGuidelinesNote.trim()) {
            system += `\n專案準則\n${projectGuidelinesNote.trim()}\n`;
        }

        // 單批特殊指示（含本批輸入與檔案已套用的本案特殊指示）
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
            if (seg.tmHint) user += `TM 參考（${seg.tmHint.score}%）：${seg.tmHint.targetText}\n`;
            user += '\n';
        });

        return [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ];
    }

    // ---- API 呼叫 ----

    function _openAiBody(settings, messages, extra = {}) {
        const model = settings.model || 'gpt-4.1-mini';
        return {
            model,
            messages,
            ...extra,
            temperature: extra.temperature != null ? extra.temperature : 0.3
        };
    }

    /**
     * 優先走同源 /api/cat-openai（主站帶金鑰）；失敗或 4xx/5xx 則在具本機 Key 時改直連。
     */
    async function postChatCompletions(settings, openaiBody) {
        const useProxy = settings.preferOpenAiProxy !== false;
        const baseOrigin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
        if (useProxy) {
            try {
                const resp = await fetch(baseOrigin + '/api/cat-openai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ openaiPath: '/v1/chat/completions', openaiBody })
                });
                if (resp.ok) return { resp, fromProxy: true };
            } catch (_) { /* 本機靜態檔或無此路由 */ }
        }
        const apiKey = settings.apiKey;
        if (!apiKey) {
            return { resp: { ok: false, status: 0, async json() { return {}; } }, fromProxy: false, noKey: true };
        }
        const baseUrl = (settings.apiBaseUrl || 'https://api.openai.com').replace(/\/$/, '');
        const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(openaiBody)
        });
        return { resp, fromProxy: false, noKey: false };
    }

    const RETRYABLE_MAX_ATTEMPTS = 4;
    const RETRYABLE_BASE_DELAY_MS = 700;
    const RETRYABLE_MAX_DELAY_MS = 15000;

    function _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function _isRetryableError(status, body) {
        if (!status) return true;
        if (status === 429) {
            const code = body?.error?.code || '';
            return code !== 'insufficient_quota';
        }
        return status >= 500;
    }

    function _retryAfterToMs(resp) {
        try {
            const raw = resp?.headers?.get?.('retry-after');
            if (!raw) return 0;
            const seconds = Number(raw);
            if (Number.isFinite(seconds) && seconds > 0) return Math.floor(seconds * 1000);
            const at = Date.parse(String(raw));
            if (!Number.isFinite(at)) return 0;
            return Math.max(0, at - Date.now());
        } catch (_) {
            return 0;
        }
    }

    async function postChatCompletionsWithRetry(settings, openaiBody) {
        let last = null;
        for (let attempt = 1; attempt <= RETRYABLE_MAX_ATTEMPTS; attempt++) {
            const call = await postChatCompletions(settings, openaiBody);
            let body = null;
            try { body = await call.resp.json(); } catch (_) { body = null; }
            last = { ...call, body };
            if (call.resp && call.resp.ok) return last;
            if (call.noKey) return last;
            if (!_isRetryableError(call.resp && call.resp.status, body) || attempt >= RETRYABLE_MAX_ATTEMPTS) {
                return last;
            }
            const jitter = Math.floor(Math.random() * 240);
            const backoffMs = Math.min(RETRYABLE_MAX_DELAY_MS, RETRYABLE_BASE_DELAY_MS * (2 ** (attempt - 1)) + jitter);
            const retryAfterMs = (call.resp && call.resp.status === 429) ? _retryAfterToMs(call.resp) : 0;
            const waitMs = Math.max(backoffMs, retryAfterMs);
            await _sleep(waitMs);
        }
        return last || { resp: { ok: false, status: 0 }, body: null, noKey: false };
    }

    /**
     * 送出翻譯請求。
     * @param {boolean} jsonMode - true（預設）時要求 JSON 回傳格式；false 時回傳純文字（用於掃描）
     * @returns {{ results: [{idx, translation}], missing: [idx], error: string|null, content?: string }}
     */
    async function callApi(messages, settings, jsonMode = true) {
        const openaiBody = _openAiBody(settings, messages, {
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
            temperature: 0.3
        });
        const { resp, noKey, body } = await postChatCompletionsWithRetry(settings, openaiBody);

        if (!resp || !resp.ok) {
            if (noKey) {
                return { results: [], missing: [], error: '未設定存取方式：主站 /api 不可用，且本機未填 API Key。請在「AI 管理」處理。' };
            }
            return { results: [], missing: [], error: friendlyError(null, resp && resp.status, body) };
        }

        const raw = body?.choices?.[0]?.message?.content || '';

        if (!jsonMode) {
            return { results: [], missing: [], error: null, content: raw };
        }

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            return { results: [], missing: [], error: ERROR_MESSAGES.parse_error };
        }

        const translations = Array.isArray(parsed.translations) ? parsed.translations : [];
        return { results: translations, missing: [], error: null };
    }

    /**
     * 一般 JSON 物件回傳（用於 QA 等非翻譯格式）。
     * @returns {{ data: Object|null, error: string|null }}
     */
    async function callApiJsonObject(messages, settings) {
        const openaiBody = _openAiBody(settings, messages, {
            response_format: { type: 'json_object' },
            temperature: 0.2
        });
        const { resp, noKey, body } = await postChatCompletionsWithRetry(settings, openaiBody);

        if (!resp || !resp.ok) {
            if (noKey) {
                return { data: null, error: '未設定存取方式。請在「AI 管理」處理。' };
            }
            return { data: null, error: friendlyError(null, resp && resp.status, body) };
        }

        const raw = body?.choices?.[0]?.message?.content || '';
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            return { data: null, error: ERROR_MESSAGES.parse_error };
        }
        return { data: parsed, error: null };
    }

    const QA_TYPO_BATCH = 24;

    /**
     * 僅依「譯文」檢查一般中文錯字／打字／缺多字／形近字（不送原文）。
     * @param {Array<{ segId, gid, targetText }>} items
     * @param {Object} settings - 同 translate（apiKey, apiBaseUrl, model）
     * @returns {{ issues: Array<{ segId, gid, detail: string }>, error: string|null }}
     */
    async function qaChineseTypos(items, settings) {
        const issues = [];
        if (!items || items.length === 0) return { issues, error: null };
        if (!settings || (!settings.apiKey && settings.preferOpenAiProxy === false)) {
            return { issues, error: 'API 未設定，請至「AI 管理」處理。' };
        }

        const CJK = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
        const customTypo = (settings.prompts && String(settings.prompts.typoSystem || '').trim()) || '';

        for (let off = 0; off < items.length; off += QA_TYPO_BATCH) {
            const slice = items.slice(off, off + QA_TYPO_BATCH);
            const payload = [];
            let lines = '';
            slice.forEach((it, j) => {
                const { clean } = stripTags(it.targetText || '');
                payload.push({ segId: it.segId, gid: it.gid, clean, j });
                lines += `[#${j}] 譯文：${clean}\n`;
            });

            const n = slice.length;
            const jsonFormatBlock = `請嚴格只輸出一個 JSON 物件（不要 markdown），格式：
{"findings":[{"i":0,"issues":""},{"i":1,"issues":"..."}]}
- findings 必須剛好 ${n} 筆，i 為 0 到 ${n - 1} 的整數且由小到大。
- 無問題時 issues 必須為空字串 ""。
- 有問題時 issues 為一句繁體中文（建議 60 字以內）。`;
            const defaultRole = `你是中文譯文校對助理。以下每一條只提供「譯文」（沒有原文），請只檢查譯文中是否出現：
明顯錯字、缺字、多字、嚴重打字錯誤、易混淆形近字（限一般中文書寫）。

請勿檢查：翻譯是否正確、英文拼字、數字與格式、風格潤飾、專有名詞是否合理。
若該條譯文幾乎沒有中文（例如僅英文或數字），一律視為無需檢查，issues 留空。

` + jsonFormatBlock;
            const system = customTypo ? (customTypo + '\n\n' + jsonFormatBlock) : defaultRole;

            const user = `共 ${n} 條譯文，請逐條檢查：\n\n${lines}`;

            const res = await callApiJsonObject(
                [{ role: 'system', content: system }, { role: 'user', content: user }],
                settings
            );
            if (res.error) return { issues, error: res.error };

            const findings = Array.isArray(res.data?.findings) ? res.data.findings : [];
            const byI = new Map();
            for (const f of findings) {
                const i = Number(f.i);
                if (Number.isFinite(i)) byI.set(i, String(f.issues || '').trim());
            }

            for (let j = 0; j < n; j++) {
                const row = payload[j];
                const note = byI.get(j) || '';
                if (!note) continue;
                if (!CJK.test(row.clean)) continue;
                issues.push({ segId: row.segId, gid: row.gid, detail: note });
            }
        }

        return { issues, error: null };
    }

    // ---- 主要 translate 函式 ----

    /**
     * 翻譯一批句段（含 XLIFF tag 去除與還原）。
     * @param {Array} segments - 句段物件陣列，每筆含 { id, sourceText, keys, extraValue, contextPrev, contextNext }
     * @param {Object} options - { settings, sourceLang, targetLang, guidelines, styleExamples, tbTerms, batchNote, projectGuidelinesNote }
     * @returns {{ results: [{segId, translation, aiDraft}], missing: [segId], error: string|null }}
     */
    async function translate(segments, options = {}) {
        if (!segments || segments.length === 0) return { results: [], missing: [], error: null };

        const settings = options.settings || {};
        if (!settings.apiKey && settings.preferOpenAiProxy === false) {
            return { results: [], missing: [], error: 'API Key 未設定，請至「AI 管理」填入。' };
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
                contextNext: seg.contextNext || '',
                tmHint: seg._tmHint || null
            };
        });

        const messages = buildPrompt(indexed, {
            sourceLang: options.sourceLang,
            targetLang: options.targetLang,
            guidelines: options.guidelines || [],
            styleGuidelines: options.styleGuidelines || [],
            styleExamples: options.styleExamples || [],
            tbTerms: options.tbTerms || [],
            batchNote: options.batchNote || '',
            projectGuidelinesNote: options.projectGuidelinesNote || '',
            systemPrefix: options.systemPrefix || (settings.prompts && settings.prompts.translateSystemPrefix) || ''
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

    // ---- 掃描全文 ----

    /**
     * 估算送出掃描所需的 token 數（粗估：字元數 / 2）
     * @param {Array} segments
     * @returns {{ estimatedTokens: number, willTruncate: boolean, truncatedCount: number, totalCount: number }}
     */
    function estimateScanTokens(segments, extraPrompt) {
        const MODEL_CONTEXT = 120000; // 保守估算可用 context
        const RESERVED = 4000;        // 保留給 system prompt + response
        const available = MODEL_CONTEXT - RESERVED;
        let totalChars = (extraPrompt || '').length;
        segments.forEach(s => { totalChars += (s.sourceText || '').length + (s.targetText || '').length + 20; });
        const estimatedTokens = Math.ceil(totalChars / 2);
        const willTruncate = estimatedTokens > available;
        // 計算截斷後保留幾條
        let kept = segments.length;
        if (willTruncate) {
            let chars = (extraPrompt || '').length;
            const budget = available * 2; // 轉回字元
            for (let i = 0; i < segments.length; i++) {
                chars += (segments[i].sourceText || '').length + (segments[i].targetText || '').length + 20;
                if (chars > budget) { kept = i; break; }
            }
        }
        return { estimatedTokens, willTruncate, keptCount: kept, totalCount: segments.length };
    }

    /**
     * 掃描全文並產生報告。
     * @param {Array} segments - 所有句段
     * @param {Object} options - { settings, extraPrompt, guidelines, styleExamples, tbTerms }
     * @returns {string} 報告文字
     */
    async function scanFullText(segments, options) {
        const { settings, extraPrompt = '', guidelines = [], styleGuidelines = [], styleExamples = [], tbTerms = [], projectGuidelinesNote = '' } = options;

        // 截斷：保留前後各半，去除中間
        const est = estimateScanTokens(segments, extraPrompt);
        let segsToSend = segments;
        if (est.willTruncate && est.keptCount < segments.length) {
            const half = Math.floor(est.keptCount / 2);
            const front = segments.slice(0, half);
            const back = segments.slice(segments.length - (est.keptCount - half));
            segsToSend = [...front, { sourceText: '…（中段已截斷）…', targetText: '' }, ...back];
        }

        const scanPre = (settings && settings.prompts && String(settings.prompts.scanSystemPrefix || '').trim()) || '';
        const systemParts = [
            scanPre || '你是一位翻譯分析助理。請根據以下提供的原文與（部分）譯文，產生一份詳細的翻譯分析報告。',
            '報告應包含以下各節：',
            '1. 整體文件性質與風格建議',
            '2. 建議套用的翻譯準則（請以條列方式說明原因）',
            '3. 建議的類別標籤（例如：遊戲、軟體UI、法律等）',
            '4. 術語一致性觀察（如發現問題請舉例）',
            '5. 其他翻譯注意事項'
        ];

        if (guidelines && guidelines.length > 0) {
            systemParts.push('\n目前已定義的翻譯準則：\n' + guidelines.map((g) => {
                const p = (g && g.issueGroupName) ? `〔${g.issueGroupName}〕 ` : '';
                return `- ${p}${g.content}`;
            }).join('\n'));
        }
        if (Array.isArray(styleGuidelines) && styleGuidelines.length > 0) {
            systemParts.push('\n文風偏好：\n' + styleGuidelines.map((g) => {
                const p = (g && g.issueGroupName) ? `〔${g.issueGroupName}〕 ` : '';
                return `- ${p}${g.content}`;
            }).join('\n'));
        }
        if (tbTerms && tbTerms.length > 0) {
            systemParts.push('\n術語庫：\n' + tbTerms.slice(0, 50).map(t => `${t.source} → ${t.target}`).join('\n'));
        }
        if (projectGuidelinesNote && String(projectGuidelinesNote).trim()) {
            systemParts.push('\n專案準則\n' + String(projectGuidelinesNote).trim());
        }
        if (extraPrompt) {
            systemParts.push('\n使用者附加說明：' + extraPrompt);
        }

        const systemPrompt = systemParts.join('\n');

        // 組裝 user 訊息
        const segLines = segsToSend.map((s, idx) =>
            `[${idx + 1}] 原文：${s.sourceText || ''}${s.targetText ? `\n[${idx + 1}] 譯文：${s.targetText}` : ''}`
        ).join('\n');
        const userMsg = `以下是文件內容（共 ${segsToSend.length} 條）：\n\n${segLines}\n\n請產生分析報告。`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg }
        ];

        const result = await callApi(messages, settings, false);
        if (result.error) throw new Error(result.error);
        const content = result.content;
        if (!content) throw new Error('AI 未回傳報告內容');
        return content.trim();
    }

    // ---- 公開介面 ----
    window.CatAiTranslate = {
        translate,
        retryMissing,
        buildPrompt,
        diffRatio,
        friendlyError,
        scanFullText,
        estimateScanTokens,
        qaChineseTypos
    };
})();
