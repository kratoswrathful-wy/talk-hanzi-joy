import {
    ERROR_MESSAGES,
    SYNC_ERROR_MESSAGES,
    classifyAiError,
    classifyError,
    friendlyError,
    messageForSyncError,
    classifyOpenAiModelsFetch,
    buildTaskLogErrorDetail,
    buildTaskLogErrorDetailFromResponse,
    parseRetryAfterMs,
    sanitizeRawSummary,
} from './ai-openai-errors.core.mjs';

window.CatAiOpenaiErrors = {
    ERROR_MESSAGES,
    SYNC_ERROR_MESSAGES,
    classifyAiError,
    classifyError,
    friendlyError,
    messageForSyncError,
    classifyOpenAiModelsFetch,
    buildTaskLogErrorDetail,
    buildTaskLogErrorDetailFromResponse,
    parseRetryAfterMs,
    sanitizeRawSummary,
};
