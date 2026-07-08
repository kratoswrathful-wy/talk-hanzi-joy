import { describe, it, expect } from 'vitest';
import { classifyError, friendlyError } from './ai-openai-errors.core.mjs';

describe('ai-openai-errors', () => {
    it('429 insufficient_quota 回傳專屬加值訊息', () => {
        const body = { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } };
        expect(classifyError(null, 429, body)).toBe('insufficient_quota');
        expect(friendlyError(null, 429, body)).toContain('未加值');
        expect(friendlyError(null, 429, body)).toContain('Billing');
    });

    it('429 無 quota 代碼時視為速率限制', () => {
        const body = { error: { code: 'rate_limit_exceeded' } };
        expect(classifyError(null, 429, body)).toBe('rate_limit_exceeded');
        expect(friendlyError(null, 429, body)).toContain('速率');
    });

    it('401/403 回傳 API Key 無效', () => {
        expect(classifyError(null, 401, {})).toBe('invalid_api_key');
        expect(classifyError(null, 403, {})).toBe('invalid_api_key');
        expect(friendlyError(null, 401, {})).toContain('API Key');
        expect(friendlyError(null, 403, {})).toContain('API Key');
    });
});
