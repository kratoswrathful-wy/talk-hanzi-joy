/**
 * OpenAI / TMS proxy AI 錯誤分類（純函式，無 DOM）。
 * 權威實作：cat-tool 與 api/lib 共用。
 */

/** @typedef {'openai'|'tms_proxy'|'tms_sync'} AiErrorProvider */
/** @typedef {'proxy'|'direct'|'model-sync'|'test-connection'|'batch-translate'|'qa'|'scan'|'unknown'} AiErrorSource */

/**
 * @typedef {Object} AiErrorClassification
 * @property {string} type
 * @property {string} code
 * @property {string} message
 * @property {string} actionHint
 * @property {boolean} retryable
 * @property {number} retryAfterMs
 * @property {number} httpStatus
 * @property {AiErrorProvider} provider
 * @property {AiErrorSource} source
 * @property {string} rawSummary
 */

const MESSAGES = {
    invalid_api_key: 'API Key 無效、已刪除或格式錯誤，請重新貼上 Key。',
    invalid_api_key_org: 'API Key 所屬組織或專案不正確，請確認 OpenAI Project / Organization。',
    invalid_api_key_ip: '目前伺服器 IP 不在 OpenAI 允許清單內，請更新 IP allowlist。',
    unsupported_region: 'OpenAI API 目前不支援此連線地區，請確認執行環境或伺服器區域。',
    permission_denied: 'API Key 權限不足，請確認 Project 權限與模型存取權。',
    model_not_found: '找不到指定模型，請重新選擇模型或同步模型清單。',
    context_length_exceeded: '提示內容過長，請減少批次大小、上下文、TM/TB 或指示內容。',
    unsupported_parameter: '目前模型不支援某個請求參數，請切換模型或調整模型能力設定。',
    invalid_request_error: 'AI 請求格式錯誤，請回報開發者檢查參數。',
    request_too_large: '單次送出的內容過大，請減少批次大小。',
    insufficient_quota: '帳號額度不足或未加值，請至 OpenAI Billing 儲值後再試。',
    rate_limit_exceeded: '請求速率超過上限，請稍後再試或降低批次大小。',
    rate_limit_tpm: '每分鐘 token 用量超過上限，請降低批次大小、減少上下文或稍後再試。',
    rate_limit_rpm: '每分鐘請求數超過上限，請降低並行數或稍後再試。',
    rate_limit_rpd: '每日請求數已達上限，請稍後再試或調整用量限制。',
    server_error: 'OpenAI 服務暫時異常，系統已重試，請稍後再試。',
    proxy_fetch_failed: 'AI 代理服務無法連上 OpenAI，請稍後再試。',
    server_missing_openai_key: '主站未設定 OpenAI API Key，請聯絡管理員或改填本機 Key。',
    overloaded: 'OpenAI 目前負載過高，請稍後再試。',
    slow_down: '請求量上升太快，請降低速度並等待約 15 分鐘後再逐步恢復。',
    timeout: 'AI 請求逾時，請減少批次大小或稍後再試。',
    network_error: '網路或代理連線失敗，請確認網路狀態或稍後再試。',
    response_truncated: 'AI 回覆被截斷，請減少批次大小後重試。',
    content_filter: 'AI 因內容安全限制未回傳完整譯文，請縮小批次或手動處理。',
    empty_response: 'AI 未回傳內容，請稍後重試或切換模型。',
    parse_error: 'AI 回傳格式不正確，已重試；若持續發生，請降低批次大小。',
    translations_missing: 'AI 未回傳部分句段，請使用「只重試缺漏句段」。',
    no_access_configured: '未設定存取方式：主站 /api 不可用，且本機未填 API Key。請在「AI 管理」處理。',
    unknown: '發生未知錯誤，請稍後再試。',
};

const SYNC_MESSAGES = {
    openai_invalid_key: 'OpenAI API Key 無效，請確認主站環境變數 OPENAI_API_KEY。',
    openai_insufficient_quota: 'OpenAI 帳號額度不足或未加值，請至 Billing 儲值後再試。',
    openai_rate_limited: 'OpenAI 請求速率或用量超過上限，請稍後再試。',
    openai_permission_denied: 'OpenAI API Key 權限不足，請確認 Project 權限。',
    openai_unsupported_region: 'OpenAI API 不支援目前伺服器地區。',
    openai_overloaded: 'OpenAI 目前負載過高，請稍後再試。',
    openai_timeout: 'OpenAI 模型清單請求逾時，請稍後再試。',
    openai_invalid_response: 'OpenAI 回傳格式異常，請稍後再試。',
    openai_fetch_failed: '無法取得 OpenAI 模型清單，請稍後再試。',
};

const RETRYABLE_CODES = new Set([
    'rate_limit_exceeded',
    'rate_limit_tpm',
    'rate_limit_rpm',
    'rate_limit_rpd',
    'server_error',
    'proxy_fetch_failed',
    'overloaded',
    'slow_down',
    'timeout',
    'network_error',
    'parse_error',
    'response_truncated',
    'empty_response',
]);

/**
 * @param {Headers|Record<string, string>|null|undefined} headers
 */
export function parseRetryAfterMs(headers) {
    try {
        let raw = null;
        if (headers && typeof headers.get === 'function') {
            raw = headers.get('retry-after');
        } else if (headers && typeof headers === 'object') {
            raw = headers['retry-after'] || headers['Retry-After'] || null;
        }
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

/**
 * @param {unknown} body
 */
export function sanitizeRawSummary(body) {
    try {
        if (body == null) return '';
        const clone = typeof body === 'object' ? { .../** @type {Record<string, unknown>} */ (body) } : { value: body };
        if (clone.error && typeof clone.error === 'object') {
            const err = { .../** @type {Record<string, unknown>} */ (clone.error) };
            delete err.message;
            clone.error = err;
        }
        const text = JSON.stringify(clone);
        return text.length > 280 ? `${text.slice(0, 277)}…` : text;
    } catch (_) {
        return '';
    }
}

/**
 * @param {string} haystack
 */
function includesAny(haystack, needles) {
    const lower = String(haystack || '').toLowerCase();
    return needles.some((n) => lower.includes(String(n).toLowerCase()));
}

/**
 * @param {{ error?: { code?: string, type?: string, message?: string, param?: string } }|null|undefined} body
 */
function openAiErr(body) {
    return body && body.error && typeof body.error === 'object' ? body.error : {};
}

/**
 * @param {string} code
 * @param {Partial<AiErrorClassification>} extra
 */
function buildResult(code, extra = {}) {
    const message = MESSAGES[code] || MESSAGES.unknown;
    return {
        type: extra.type || code,
        code,
        message: extra.message || message,
        actionHint: extra.actionHint || '',
        retryable: extra.retryable != null ? extra.retryable : RETRYABLE_CODES.has(code),
        retryAfterMs: extra.retryAfterMs || 0,
        httpStatus: extra.httpStatus || 0,
        provider: extra.provider || 'openai',
        source: extra.source || 'unknown',
        rawSummary: extra.rawSummary || '',
    };
}

/**
 * @param {number} status
 * @param {unknown} body
 * @param {string} msg
 * @param {string} errCode
 * @param {string} errType
 */
function classifyOpenAiHttp(status, body, msg, errCode, errType) {
    const combined = `${msg} ${errCode} ${errType}`;

    if (status === 401) {
        if (includesAny(combined, ['ip', 'allowlist', 'not authorized'])) {
            return buildResult('invalid_api_key_ip', { httpStatus: status });
        }
        if (includesAny(combined, ['organization', 'project', 'membership', 'org'])) {
            return buildResult('invalid_api_key_org', { httpStatus: status });
        }
        if (includesAny(combined, ['incorrect_api_key', 'invalid_api_key', 'invalid api key'])) {
            return buildResult('invalid_api_key', { httpStatus: status });
        }
        return buildResult('invalid_api_key', { httpStatus: status });
    }

    if (status === 403) {
        if (includesAny(combined, ['country', 'region', 'territory', 'unsupported'])) {
            return buildResult('unsupported_region', { httpStatus: status });
        }
        if (includesAny(combined, ['permission', 'insufficient permissions'])) {
            return buildResult('permission_denied', { httpStatus: status });
        }
        return buildResult('permission_denied', { httpStatus: status });
    }

    if (status === 404 || errCode === 'model_not_found') {
        return buildResult('model_not_found', { httpStatus: status || 404 });
    }

    if (status === 413 || includesAny(combined, ['request too large', 'payload too large'])) {
        return buildResult('request_too_large', { httpStatus: status || 413 });
    }

    if (status === 400) {
        if (errCode === 'context_length_exceeded' || includesAny(combined, ['context length', 'maximum context'])) {
            return buildResult('context_length_exceeded', { httpStatus: status });
        }
        if (
            errCode === 'unsupported_parameter'
            || errCode === 'unsupported_value'
            || includesAny(combined, ['unsupported parameter', 'unsupported value'])
        ) {
            return buildResult('unsupported_parameter', { httpStatus: status });
        }
        if (errCode === 'invalid_request_error' || errType === 'invalid_request_error') {
            return buildResult('invalid_request_error', { httpStatus: status });
        }
        return buildResult('invalid_request_error', { httpStatus: status });
    }

    if (status === 429) {
        if (
            errCode === 'insufficient_quota'
            || errType === 'insufficient_quota'
            || includesAny(combined, ['insufficient_quota', 'exceeded your current quota', 'billing'])
        ) {
            return buildResult('insufficient_quota', { httpStatus: status, retryable: false });
        }
        if (includesAny(combined, ['tokens per min', 'tpm', 'token rate limit'])) {
            return buildResult('rate_limit_tpm', { httpStatus: status });
        }
        if (includesAny(combined, ['requests per min', 'rpm'])) {
            return buildResult('rate_limit_rpm', { httpStatus: status });
        }
        if (includesAny(combined, ['requests per day', 'rpd'])) {
            return buildResult('rate_limit_rpd', { httpStatus: status });
        }
        return buildResult('rate_limit_exceeded', { httpStatus: status });
    }

    if (status === 500) {
        return buildResult('server_error', { httpStatus: status });
    }

    if (status === 502) {
        return buildResult('proxy_fetch_failed', { httpStatus: status, provider: 'tms_proxy' });
    }

    if (status === 503) {
        if (includesAny(combined, ['slow_down', 'slow down'])) {
            return buildResult('slow_down', { httpStatus: status });
        }
        if (includesAny(combined, ['overloaded', 'capacity'])) {
            return buildResult('overloaded', { httpStatus: status });
        }
        return buildResult('overloaded', { httpStatus: status });
    }

    if (status === 504) {
        return buildResult('timeout', { httpStatus: status });
    }

    return buildResult('unknown', { httpStatus: status });
}

/**
 * @param {string} tmsError
 * @param {number} status
 */
function classifyTmsProxyEnvelope(tmsError, status) {
    const key = String(tmsError || '').toLowerCase();
    if (key === 'server_missing_openai_key') {
        return buildResult('server_missing_openai_key', { httpStatus: status || 503, provider: 'tms_proxy', retryable: false });
    }
    if (key === 'openai_fetch_failed') {
        return buildResult('proxy_fetch_failed', { httpStatus: status || 502, provider: 'tms_proxy' });
    }
    if (key === 'invalid_json' || key === 'missing_openaibody') {
        return buildResult('invalid_request_error', { httpStatus: status || 400, provider: 'tms_proxy', retryable: false });
    }
    return null;
}

/**
 * @param {Object} [opts]
 * @param {AiErrorProvider} [opts.provider]
 * @param {number} [opts.status]
 * @param {unknown} [opts.body]
 * @param {Headers|Record<string, string>|null} [opts.headers]
 * @param {string|null} [opts.finishReason]
 * @param {AiErrorSource} [opts.source]
 * @param {unknown} [opts.err]
 * @param {boolean} [opts.noKey]
 * @param {boolean} [opts.fromProxy]
 */
export function classifyAiError(opts = {}) {
    const {
        provider = 'openai',
        status = 0,
        body = null,
        headers = null,
        finishReason = null,
        source = 'unknown',
        err = null,
        noKey = false,
        fromProxy = false,
    } = opts;

    const retryAfterMs = parseRetryAfterMs(headers);
    const rawSummary = sanitizeRawSummary(body);
    const base = { source, retryAfterMs, rawSummary };

    if (noKey) {
        return buildResult('no_access_configured', { ...base, httpStatus: 0, retryable: false, provider: fromProxy ? 'tms_proxy' : provider });
    }

    if (err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('abort'))) {
        return buildResult('timeout', { ...base, httpStatus: status || 504 });
    }

    if (!status && err) {
        return buildResult('network_error', { ...base, httpStatus: 0 });
    }

    if (finishReason === 'length') {
        return buildResult('response_truncated', { ...base, httpStatus: status || 200, retryable: true });
    }
    if (finishReason === 'content_filter') {
        return buildResult('content_filter', { ...base, httpStatus: status || 200, retryable: false });
    }
    if (finishReason === 'empty' || finishReason === 'empty_response') {
        return buildResult('empty_response', { ...base, httpStatus: status || 200, retryable: true });
    }
    if (finishReason === 'parse_error') {
        return buildResult('parse_error', { ...base, httpStatus: status || 200, retryable: true });
    }

    const envelope = body && typeof body === 'object' ? body : null;
    const tmsError = envelope && typeof envelope.error === 'string' ? envelope.error : '';
    if (tmsError) {
        const proxyResult = classifyTmsProxyEnvelope(tmsError, status);
        if (proxyResult) {
            return { ...proxyResult, ...base, provider: 'tms_proxy' };
        }
    }

    const oai = openAiErr(/** @type {Record<string, unknown>} */ (envelope));
    const errCode = String(oai.code || '');
    const errType = String(oai.type || '');
    const msg = String(oai.message || '');

    if (status) {
        const httpResult = classifyOpenAiHttp(status, envelope, msg, errCode, errType);
        return {
            ...httpResult,
            ...base,
            provider: fromProxy ? 'tms_proxy' : provider,
            retryAfterMs: httpResult.retryable ? Math.max(retryAfterMs, httpResult.retryAfterMs) : 0,
        };
    }

    return buildResult('unknown', { ...base, httpStatus: 0 });
}

/**
 * @param {string} code
 */
export function messageForSyncError(code) {
    return SYNC_MESSAGES[code] || SYNC_MESSAGES.openai_fetch_failed;
}

/**
 * @param {number} status
 * @param {unknown} body
 */
export function classifyOpenAiModelsFetch(status, body) {
    const oai = openAiErr(/** @type {Record<string, unknown>} */ (body));
    const msg = String(oai.message || '');
    const errCode = String(oai.code || oai.type || '');

    if (status === 401) return 'openai_invalid_key';
    if (status === 403) {
        if (includesAny(`${msg} ${errCode}`, ['country', 'region', 'territory'])) return 'openai_unsupported_region';
        return 'openai_permission_denied';
    }
    if (status === 429) {
        if (errCode === 'insufficient_quota' || includesAny(msg, ['insufficient_quota', 'exceeded your current quota'])) {
            return 'openai_insufficient_quota';
        }
        return 'openai_rate_limited';
    }
    if (status === 503 && includesAny(msg, ['overloaded', 'capacity'])) return 'openai_overloaded';
    if (status === 504) return 'openai_timeout';
    if (!status) return 'openai_fetch_failed';
    return 'openai_fetch_failed';
}

/** @deprecated 使用 classifyAiError().message */
export function friendlyError(err, status, body, extra = {}) {
    return classifyAiError({ status, body, err, ...extra }).message;
}

/** @deprecated 使用 classifyAiError().code */
export function classifyError(err, status, body, extra = {}) {
    return classifyAiError({ status, body, err, ...extra }).code;
}

export function buildTaskLogErrorDetail(classified, body, headers) {
    const oai = openAiErr(/** @type {Record<string, unknown>} */ (body));
    return {
        provider: classified.provider,
        source: classified.source,
        httpStatus: classified.httpStatus || 0,
        errorType: String(oai.type || ''),
        errorCode: classified.code,
        errorParam: String(oai.param || ''),
        finishReason: '',
        retryAfter: parseRetryAfterMs(headers) || classified.retryAfterMs || 0,
        message: classified.message,
        rawSummary: classified.rawSummary,
    };
}

export function buildTaskLogErrorDetailFromResponse(classified, body, headers, finishReason) {
    const detail = buildTaskLogErrorDetail(classified, body, headers);
    if (finishReason) detail.finishReason = String(finishReason);
    return detail;
}

export function shouldFallbackToDirectKey({ proxyResponseReceived, hasLocalKey }) {
    if (proxyResponseReceived) return false;
    return !!hasLocalKey;
}

export const ERROR_MESSAGES = MESSAGES;
export const SYNC_ERROR_MESSAGES = SYNC_MESSAGES;
