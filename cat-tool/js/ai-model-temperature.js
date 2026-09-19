/**
 * CAT AI：OpenAI chat/completions request body 的 temperature 相容性。
 * GPT-5.5／GPT-5.6 系列與 GPT-6 Astra 不支援自訂 temperature（僅預設 1），帶入會 400 unsupported_value。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.CatAiModelTemperature = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * @param {string|undefined|null} model
     * @returns {boolean}
     */
    function shouldOmitTemperature(model) {
        var id = String(model || '').trim().toLowerCase();
        if (!id) return false;
        return /^gpt-5\.5(-pro)?(-\d{4}-\d{2}-\d{2})?$/.test(id)
            || /^gpt-5\.6(-sol|-terra|-luna)?(-\d{4}-\d{2}-\d{2})?$/.test(id)
            || /^gpt-6-astra(-\d{4}-\d{2}-\d{2})?$/.test(id);
    }

    /**
     * 組裝 chat/completions body；GPT-5.5／5.6 與 Astra 省略 temperature，其餘維持既有預設 0.3。
     * @param {{ model?: string }} settings
     * @param {Array<{role: string, content: string}>} messages
     * @param {Record<string, unknown>} [extra]
     */
    function buildOpenAiChatBody(settings, messages, extra) {
        extra = extra || {};
        var model = (settings && settings.model) ? settings.model : 'gpt-5.6-luna';
        var body = Object.assign({ model: model, messages: messages }, extra);
        if (shouldOmitTemperature(model)) {
            delete body.temperature;
            return body;
        }
        body.temperature = extra.temperature != null ? extra.temperature : 0.3;
        return body;
    }

    return {
        shouldOmitTemperature: shouldOmitTemperature,
        buildOpenAiChatBody: buildOpenAiChatBody
    };
});
