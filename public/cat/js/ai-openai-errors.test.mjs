import { describe, it, expect } from 'vitest';
import {
    classifyAiError,
    classifyOpenAiModelsFetch,
    messageForSyncError,
    shouldFallbackToDirectKey,
} from './ai-openai-errors.core.mjs';

describe('classifyAiError — OpenAI HTTP', () => {
    it('429 insufficient_quota 顯示加值訊息', () => {
        const body = { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } };
        const r = classifyAiError({ status: 429, body, source: 'test-connection' });
        expect(r.code).toBe('insufficient_quota');
        expect(r.message).toContain('未加值');
        expect(r.retryable).toBe(false);
    });

    it('429 rate_limit_exceeded 顯示速率訊息', () => {
        const body = { error: { code: 'rate_limit_exceeded' } };
        const r = classifyAiError({ status: 429, body });
        expect(r.code).toBe('rate_limit_exceeded');
        expect(r.message).toContain('速率');
    });

    it('400 unsupported_parameter 顯示模型參數不支援', () => {
        const body = { error: { code: 'unsupported_parameter', param: 'temperature' } };
        const r = classifyAiError({ status: 400, body });
        expect(r.code).toBe('unsupported_parameter');
        expect(r.message).toContain('參數');
    });

    it('400 context_length_exceeded 顯示內容過長', () => {
        const body = { error: { code: 'context_length_exceeded' } };
        const r = classifyAiError({ status: 400, body });
        expect(r.code).toBe('context_length_exceeded');
        expect(r.message).toContain('過長');
    });

    it('401 incorrect_api_key 顯示 Key 無效', () => {
        const body = { error: { code: 'invalid_api_key', message: 'Incorrect API key provided' } };
        const r = classifyAiError({ status: 401, body });
        expect(r.code).toBe('invalid_api_key');
        expect(r.message).toContain('API Key');
    });

    it('403 permission_denied 顯示權限不足', () => {
        const body = { error: { code: 'permission_denied', type: 'permission_denied' } };
        const r = classifyAiError({ status: 403, body });
        expect(r.code).toBe('permission_denied');
        expect(r.message).toContain('權限');
    });

    it('404 model_not_found 顯示模型不存在', () => {
        const body = { error: { code: 'model_not_found' } };
        const r = classifyAiError({ status: 404, body });
        expect(r.code).toBe('model_not_found');
        expect(r.message).toContain('模型');
    });

    it('503 overloaded 與 slow_down 顯示不同訊息', () => {
        const overloaded = classifyAiError({ status: 503, body: { error: { message: 'The engine is currently overloaded' } } });
        const slowDown = classifyAiError({ status: 503, body: { error: { message: 'Slow down' } } });
        expect(overloaded.code).toBe('overloaded');
        expect(slowDown.code).toBe('slow_down');
        expect(overloaded.message).not.toBe(slowDown.message);
    });
});

describe('classifyAiError — 回應內容', () => {
    it('finish_reason length 顯示回覆被截斷', () => {
        const r = classifyAiError({ status: 200, finishReason: 'length', source: 'batch-translate' });
        expect(r.code).toBe('response_truncated');
        expect(r.message).toContain('截斷');
    });

    it('JSON parse error 代碼為 parse_error', () => {
        const r = classifyAiError({ finishReason: 'parse_error', source: 'batch-translate' });
        expect(r.code).toBe('parse_error');
        expect(r.message).not.toContain('API Key');
    });
});

describe('classifyAiError — TMS proxy', () => {
    it('proxy 429 insufficient_quota 不得變成 no_access_configured', () => {
        const body = { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } };
        const r = classifyAiError({ status: 429, body, fromProxy: true, source: 'batch-translate' });
        expect(r.code).toBe('insufficient_quota');
        expect(r.code).not.toBe('no_access_configured');
        expect(r.code).not.toBe('unknown');
    });

    it('proxy 有回應時不得 fallback 直連', () => {
        expect(shouldFallbackToDirectKey({ proxyResponseReceived: true, hasLocalKey: true })).toBe(false);
    });

    it('proxy 無回應且本機有 Key 才 fallback', () => {
        expect(shouldFallbackToDirectKey({ proxyResponseReceived: false, hasLocalKey: true })).toBe(true);
        expect(shouldFallbackToDirectKey({ proxyResponseReceived: false, hasLocalKey: false })).toBe(false);
    });
});

describe('classifyOpenAiModelsFetch', () => {
    it('401 → openai_invalid_key', () => {
        expect(classifyOpenAiModelsFetch(401, {})).toBe('openai_invalid_key');
    });

    it('429 quota → openai_insufficient_quota', () => {
        expect(classifyOpenAiModelsFetch(429, { error: { code: 'insufficient_quota' } })).toBe('openai_insufficient_quota');
    });

    it('sync 訊息為人話而非 fetch failed', () => {
        expect(messageForSyncError('openai_insufficient_quota')).toContain('加值');
        expect(messageForSyncError('openai_rate_limited')).toContain('速率');
    });
});
