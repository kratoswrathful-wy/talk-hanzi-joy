/**
 * 字數與 TM 加權分析（Memsource 風格簡化版）
 * 依賴：無；以 window.WordCountEngine 匯出。
 */
(function (global) {
    'use strict';

    /** 預設折扣（0–1）；可由 analyze(opts.discounts) 覆寫 tm9599、repetition */
    const DEFAULT_DISCOUNTS = {
        tm9599: 0.10,
        tm8594: 0.25,
        tm7584: 0.50,
        tm5074: 0.75,
        newWords: 1.00,
        repetition: 0.00
    };

    /**
     * 純字串剝標籤（Web Worker 可用；不依賴 DOMParser）。
     * 與舊版以 DOM 解析後之結果在常見 XLIFF／內嵌標記情境下一致足夠作為字數基底。
     */
    function stripTags(html) {
        if (html == null) return '';
        const s = String(html);
        return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function normKey(text) {
        return stripTags(text).toLowerCase().replace(/\s+/g, ' ').trim();
    }

    /** 加權單位：中日韓為字元數，其餘以空白斷詞（分析表「原始字數」亦用此值） */
    function weightedUnits(text) {
        const t = stripTags(text);
        if (!t) return 0;
        const cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
        const ratio = t.length ? cjk / t.length : 0;
        if (ratio >= 0.35) return t.replace(/\s/g, '').length;
        const parts = t.trim().split(/\s+/).filter(Boolean);
        return parts.length || 1;
    }

    /** 原始單位：一律以空白斷詞（保留供舊程式或除錯） */
    function rawUnits(text) {
        const t = stripTags(text);
        if (!t) return 0;
        const parts = t.trim().split(/\s+/).filter(Boolean);
        return parts.length || 1;
    }

    function segLocked(seg, includeLocked) {
        const sys = !!seg.isLockedSystem;
        const usr = !!seg.isLockedUser;
        const leg = !!seg.isLocked;
        const locked = !!(leg || sys || usr);
        if (!includeLocked && locked) return { skip: true, locked: true };
        return { skip: false, locked };
    }

    function levenshtein(a, b) {
        const m = a.length;
        const n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp = new Array(n + 1);
        for (let j = 0; j <= n; j++) dp[j] = j;
        for (let i = 1; i <= m; i++) {
            let prev = dp[0];
            dp[0] = i;
            for (let j = 1; j <= n; j++) {
                const tmp = dp[j];
                const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
                dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
                prev = tmp;
            }
        }
        return dp[n];
    }

    function similarity(a, b) {
        if (!a || !b) return 0;
        if (a === b) return 1;
        const d = levenshtein(a, b);
        return 1 - d / Math.max(a.length, b.length);
    }

    function bestTmSimilarity(srcNorm, tmNormList) {
        let best = 0;
        const len = srcNorm.length;
        const maxScan = Math.min(tmNormList.length, 4000);
        for (let i = 0; i < maxScan; i++) {
            const t = tmNormList[i];
            if (!t) continue;
            if (Math.abs(t.length - len) > Math.max(12, len * 0.45)) continue;
            const sim = similarity(srcNorm, t);
            if (sim > best) best = sim;
            if (best >= 0.999) break;
        }
        return best;
    }

    function mergeDiscounts(overrides) {
        const out = { ...DEFAULT_DISCOUNTS };
        if (overrides && typeof overrides === 'object') {
            Object.keys(overrides).forEach((k) => {
                const v = overrides[k];
                if (typeof v === 'number' && !Number.isNaN(v)) out[k] = v;
            });
        }
        return out;
    }

    /**
     * @param {object} opts
     * @param {Array<{sourceText?:string,targetText?:string,isLocked?:boolean,isLockedUser?:boolean,isLockedSystem?:boolean}>} opts.segments
     * @param {string[]} opts.tmSourcesNormalized — 已正規化之 TM 原文列表
     * @param {boolean} opts.includeLocked
     * @param {object} [opts.discounts] — 可覆寫 tm9599、repetition 等（0–1）
     */
    function analyze(opts) {
        const segments = opts.segments || [];
        const tmList = opts.tmSourcesNormalized || [];
        const includeLocked = opts.includeLocked !== false;
        const discounts = mergeDiscounts(opts.discounts);
        const tmExact = new Set(tmList.filter(Boolean));

        const buckets = {
            lockedSkipped: { label: '鎖定（略過）', segments: 0, raw: 0, weighted: 0 },
            repetition: { label: '檔內重複', segments: 0, raw: 0, weighted: 0 },
            tm9599: { label: 'TM 95–100%', segments: 0, raw: 0, weighted: 0 },
            tm8594: { label: 'TM 85–94%', segments: 0, raw: 0, weighted: 0 },
            tm7584: { label: 'TM 75–84%', segments: 0, raw: 0, weighted: 0 },
            tm5074: { label: 'TM 50–74%', segments: 0, raw: 0, weighted: 0 },
            newWords: { label: '新字／無 TM（含空白譯文）', segments: 0, raw: 0, weighted: 0 }
        };

        const seenSrc = new Set();
        /** @type {Array<{ skip: boolean, rawW: number, weightedW: number, bucketKey: string }>} */
        const perSegment = [];

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const lockInfo = segLocked(seg, includeLocked);
            const src = seg.sourceText;
            const srcN = normKey(src);
            const rawW = weightedUnits(src);

            if (lockInfo.skip) {
                buckets.lockedSkipped.segments += 1;
                buckets.lockedSkipped.raw += rawW;
                buckets.lockedSkipped.weighted += rawW;
                perSegment.push({ skip: true, rawW, weightedW: rawW, bucketKey: 'lockedSkipped' });
                continue;
            }

            let bucketKey = 'newWords';

            if (seenSrc.has(srcN)) {
                bucketKey = 'repetition';
            } else {
                seenSrc.add(srcN);
                if (tmExact.has(srcN)) {
                    bucketKey = 'tm9599';
                } else if (tmList.length) {
                    const sim = bestTmSimilarity(srcN, tmList);
                    if (sim >= 0.95) bucketKey = 'tm9599';
                    else if (sim >= 0.85) bucketKey = 'tm8594';
                    else if (sim >= 0.75) bucketKey = 'tm7584';
                    else if (sim >= 0.50) bucketKey = 'tm5074';
                    else bucketKey = 'newWords';
                } else {
                    bucketKey = 'newWords';
                }
            }

            const disc = discounts[bucketKey] != null ? discounts[bucketKey] : 1.0;
            const weightedW = rawW * disc;
            buckets[bucketKey].segments += 1;
            buckets[bucketKey].raw += rawW;
            buckets[bucketKey].weighted += weightedW;
            perSegment.push({ skip: false, rawW, weightedW, bucketKey });
        }

        const order = ['lockedSkipped', 'repetition', 'tm9599', 'tm8594', 'tm7584', 'tm5074', 'newWords'];
        const rows = order.map((k) => ({
            key: k,
            label: buckets[k].label,
            segments: buckets[k].segments,
            raw: Math.round(buckets[k].raw * 100) / 100,
            weighted: Math.round(buckets[k].weighted * 100) / 100
        }));

        const totalSeg = segments.filter((s) => {
            const L = segLocked(s, includeLocked);
            return !L.skip;
        }).length;

        const totalW = rows
            .filter((r) => r.key !== 'lockedSkipped')
            .reduce((a, r) => a + r.weighted, 0);

        const totalR = rows
            .filter((r) => r.key !== 'lockedSkipped')
            .reduce((a, r) => a + r.raw, 0);

        return {
            rows,
            totals: {
                segmentsAnalyzed: totalSeg,
                rawExcludingSkipped: Math.round(totalR * 100) / 100,
                weightedExcludingSkipped: Math.round(totalW * 100) / 100
            },
            buckets,
            discounts,
            perSegment
        };
    }

    /**
     * 與 analyze 相同結果；可分段 await 讓出 Worker 執行緒並回報進度（供 Web Worker）。
     * @param {object} opts — 同 analyze，另可選：yieldEvery、yieldMs、onSegmentProgress(done,total)
     */
    async function analyzeAsync(opts) {
        const segments = opts.segments || [];
        const tmList = opts.tmSourcesNormalized || [];
        const includeLocked = opts.includeLocked !== false;
        const discounts = mergeDiscounts(opts.discounts);
        const tmExact = new Set(tmList.filter(Boolean));
        const yieldEvery = typeof opts.yieldEvery === 'number' ? opts.yieldEvery : 40;
        const yieldMs = typeof opts.yieldMs === 'number' ? opts.yieldMs : 2;
        const onSegmentProgress = typeof opts.onSegmentProgress === 'function' ? opts.onSegmentProgress : null;

        const buckets = {
            lockedSkipped: { label: '鎖定（略過）', segments: 0, raw: 0, weighted: 0 },
            repetition: { label: '檔內重複', segments: 0, raw: 0, weighted: 0 },
            tm9599: { label: 'TM 95–100%', segments: 0, raw: 0, weighted: 0 },
            tm8594: { label: 'TM 85–94%', segments: 0, raw: 0, weighted: 0 },
            tm7584: { label: 'TM 75–84%', segments: 0, raw: 0, weighted: 0 },
            tm5074: { label: 'TM 50–74%', segments: 0, raw: 0, weighted: 0 },
            newWords: { label: '新字／無 TM（含空白譯文）', segments: 0, raw: 0, weighted: 0 }
        };

        const seenSrc = new Set();
        const perSegment = [];

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const lockInfo = segLocked(seg, includeLocked);
            const src = seg.sourceText;
            const srcN = normKey(src);
            const rawW = weightedUnits(src);

            if (lockInfo.skip) {
                buckets.lockedSkipped.segments += 1;
                buckets.lockedSkipped.raw += rawW;
                buckets.lockedSkipped.weighted += rawW;
                perSegment.push({ skip: true, rawW, weightedW: rawW, bucketKey: 'lockedSkipped' });
            } else {
                let bucketKey = 'newWords';

                if (seenSrc.has(srcN)) {
                    bucketKey = 'repetition';
                } else {
                    seenSrc.add(srcN);
                    if (tmExact.has(srcN)) {
                        bucketKey = 'tm9599';
                    } else if (tmList.length) {
                        const sim = bestTmSimilarity(srcN, tmList);
                        if (sim >= 0.95) bucketKey = 'tm9599';
                        else if (sim >= 0.85) bucketKey = 'tm8594';
                        else if (sim >= 0.75) bucketKey = 'tm7584';
                        else if (sim >= 0.50) bucketKey = 'tm5074';
                        else bucketKey = 'newWords';
                    } else {
                        bucketKey = 'newWords';
                    }
                }

                const disc = discounts[bucketKey] != null ? discounts[bucketKey] : 1.0;
                const weightedW = rawW * disc;
                buckets[bucketKey].segments += 1;
                buckets[bucketKey].raw += rawW;
                buckets[bucketKey].weighted += weightedW;
                perSegment.push({ skip: false, rawW, weightedW, bucketKey });
            }

            if (onSegmentProgress) onSegmentProgress(i + 1, segments.length);
            if (yieldEvery > 0 && (i + 1) % yieldEvery === 0 && i + 1 < segments.length) {
                await new Promise((r) => setTimeout(r, yieldMs));
            }
        }

        const order = ['lockedSkipped', 'repetition', 'tm9599', 'tm8594', 'tm7584', 'tm5074', 'newWords'];
        const rows = order.map((k) => ({
            key: k,
            label: buckets[k].label,
            segments: buckets[k].segments,
            raw: Math.round(buckets[k].raw * 100) / 100,
            weighted: Math.round(buckets[k].weighted * 100) / 100
        }));

        const totalSeg = segments.filter((s) => {
            const L = segLocked(s, includeLocked);
            return !L.skip;
        }).length;

        const totalW = rows
            .filter((r) => r.key !== 'lockedSkipped')
            .reduce((a, r) => a + r.weighted, 0);

        const totalR = rows
            .filter((r) => r.key !== 'lockedSkipped')
            .reduce((a, r) => a + r.raw, 0);

        return {
            rows,
            totals: {
                segmentsAnalyzed: totalSeg,
                rawExcludingSkipped: Math.round(totalR * 100) / 100,
                weightedExcludingSkipped: Math.round(totalW * 100) / 100
            },
            buckets,
            discounts,
            perSegment
        };
    }

    global.WordCountEngine = {
        DEFAULT_DISCOUNTS,
        stripTags,
        normKey,
        rawUnits,
        weightedUnits,
        analyze,
        analyzeAsync,
        _bestTmSimilarity: bestTmSimilarity
    };
})(typeof window !== 'undefined' ? window : globalThis);
