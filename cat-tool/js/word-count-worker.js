/**
 * Dedicated worker：TM 加權字數 analyze（與主執行緒 Dexie 讀取分離；見 docs/CAT_WORD_COUNT_WORKER_AND_UI.md）。
 * importScripts 路徑相對於本檔所在目錄（cat-tool/js/）。
 */
importScripts('../word-count-engine.js');

self.onmessage = function (ev) {
    const data = ev.data || {};
    if (data.type !== 'run') return;
    const jobId = data.jobId;
    const payload = data.payload || {};

    (async function () {
        try {
            const WCE = self.WordCountEngine;
            if (!WCE || typeof WCE.analyzeAsync !== 'function') {
                self.postMessage({ type: 'error', jobId, message: 'WordCountEngine.analyzeAsync missing' });
                return;
            }
            const result = await WCE.analyzeAsync({
                segments: payload.segments,
                tmSourcesNormalized: payload.tmSourcesNormalized || [],
                includeLocked: payload.includeLocked !== false,
                discounts: payload.discounts,
                yieldEvery: 35,
                yieldMs: 2,
                onSegmentProgress: function (done, total) {
                    self.postMessage({ type: 'progress', jobId, done, total });
                }
            });
            self.postMessage({ type: 'done', jobId, result });
        } catch (e) {
            self.postMessage({
                type: 'error',
                jobId,
                message: String(e && e.message ? e.message : e)
            });
        }
    })();
};
