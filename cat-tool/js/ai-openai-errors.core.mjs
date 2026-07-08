/**
 * OpenAI API 錯誤分類與使用者可讀訊息（純函式，無 DOM）。
 */

export const ERROR_MESSAGES = {
    invalid_api_key:      'API Key 無效或已過期，請至「AI 設定」重新輸入。',
    insufficient_quota:   '帳號額度不足或未加值，請至 OpenAI 平台 Billing 儲值後再試。',
    rate_limit_exceeded:  '請求速率超過上限，請稍後再試。',
    context_length_exceeded: '提示內容過長，請縮短準則或減少批次大小後再試。',
    model_not_found:      '指定的模型不存在，請至「AI 設定」確認模型名稱。',
    server_error:         'OpenAI 伺服器發生錯誤，請稍後再試。',
    network_error:        '網路連線失敗，請確認網路狀態後再試。',
    parse_error:          'AI 回傳格式不正確，正在重試……',
    unknown:              '發生未知錯誤，請稍後再試。'
};

/**
 * @param {unknown} err
 * @param {number|undefined|null} status
 * @param {{ error?: { code?: string, type?: string, message?: string } }|null|undefined} body
 */
export function classifyError(err, status, body) {
    if (!status) return 'network_error';
    if (status === 401 || status === 403) return 'invalid_api_key';
    if (status === 429) {
        const code = body?.error?.code || body?.error?.type || '';
        if (code === 'insufficient_quota') return 'insufficient_quota';
        const msg = String(body?.error?.message || '');
        if (/exceeded your current quota|insufficient_quota/i.test(msg)) return 'insufficient_quota';
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

/**
 * @param {unknown} err
 * @param {number|undefined|null} status
 * @param {{ error?: { code?: string, type?: string, message?: string } }|null|undefined} body
 */
export function friendlyError(err, status, body) {
    const key = classifyError(err, status, body);
    return ERROR_MESSAGES[key] || ERROR_MESSAGES.unknown;
}
