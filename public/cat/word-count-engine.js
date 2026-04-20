/**
 * 字數與 TM 加權分析（Memsource 風格簡化版）
 * 依賴：無；以 window.WordCountEngine 匯出。
 */
(function (global) {
    'use strict';

    function stripTags(html) {
        if (html == null) return '';
        const s = String(html);
        try {
            const doc = new DOMParser().parseFromString(s, 'text/html');
            const text = doc.body && doc.body.textContent ? doc.body.textContent : s.replace(/<[^>]+>/g, ' ');
            return text.replace(/\s+/g, ' ').trim();
        } catch (_) {
            return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    function normKey(text) {
        return stripTags(text).toLowerCase().replace(/\s+/g, ' ').trim();
    }

    /** 加權單位：中日韓為字元數，其餘以空白斷詞 */
    function weightedUnits(text) {
        const t = stripTags(text);
        if (!t) return 0;
        const cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
        const ratio = t.length ? cjk / t.length : 0;
        if (ratio >= 0.35) return t.replace(/\s/g, '').length;
        const parts = t.trim().split(/\s+/).filter(Boolean);
        return parts.length || 1;
    }

    function isEmptyTarget(t) {
        return !stripTags(t);
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

    /**
     * @param {object} opts
     * @param {Array<{sourceText?:string,targetText?:string,isLocked?:boolean,isLockedUser?:boolean,isLockedSystem?:boolean}>} opts.segments
     * @param {string[]} opts.tmSourcesNormalized — 已正規化之 TM 原文列表
     * @param {boolean} opts.includeLocked
     */
    function analyze(opts) {
        const segments = opts.segments || [];
        const tmList = opts.tmSourcesNormalized || [];
        const includeLocked = opts.includeLocked !== false;
        const tmExact = new Set(tmList.filter(Boolean));

        const buckets = {
            lockedSkipped: { label: '鎖定（略過）', segments: 0, weighted: 0 },
            repetition: { label: '檔內重複', segments: 0, weighted: 0 },
            tm100: { label: 'TM 100%', segments: 0, weighted: 0 },
            tm8599: { label: 'TM 高相似 (85–99%)', segments: 0, weighted: 0 },
            tm7584: { label: 'TM 中相似 (75–84%)', segments: 0, weighted: 0 },
            tmLow: { label: 'TM 低相似 (<75%)', segments: 0, weighted: 0 },
            newWords: { label: '新字／無 TM（含空白譯文）', segments: 0, weighted: 0 }
        };

        const seenTranslatedSrc = new Map();

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const lockInfo = segLocked(seg, includeLocked);
            const src = seg.sourceText;
            const tgt = seg.targetText;
            const w = weightedUnits(src);
            const srcN = normKey(src);

            if (lockInfo.skip) {
                buckets.lockedSkipped.segments += 1;
                buckets.lockedSkipped.weighted += w;
                continue;
            }

            if (isEmptyTarget(tgt)) {
                buckets.newWords.segments += 1;
                buckets.newWords.weighted += w;
                continue;
            }

            let bucketKey = 'newWords';
            if (tmExact.has(srcN)) {
                bucketKey = 'tm100';
            } else if (seenTranslatedSrc.has(srcN)) {
                bucketKey = 'repetition';
            } else {
                seenTranslatedSrc.set(srcN, true);
                const sim = tmList.length ? bestTmSimilarity(srcN, tmList) : 0;
                if (sim >= 0.995) bucketKey = 'tm100';
                else if (sim >= 0.85) bucketKey = 'tm8599';
                else if (sim >= 0.75) bucketKey = 'tm7584';
                else if (sim > 0.01) bucketKey = 'tmLow';
                else bucketKey = 'newWords';
            }

            buckets[bucketKey].segments += 1;
            buckets[bucketKey].weighted += w;
        }

        const order = ['lockedSkipped', 'repetition', 'tm100', 'tm8599', 'tm7584', 'tmLow', 'newWords'];
        const rows = order.map((k) => ({
            key: k,
            label: buckets[k].label,
            segments: buckets[k].segments,
            weighted: Math.round(buckets[k].weighted * 100) / 100
        }));

        const totalSeg = segments.filter((s) => {
            const L = segLocked(s, includeLocked);
            return !L.skip;
        }).length;

        const totalW = rows
            .filter((r) => r.key !== 'lockedSkipped')
            .reduce((a, r) => a + r.weighted, 0);

        return {
            rows,
            totals: {
                segmentsAnalyzed: totalSeg,
                weightedExcludingSkipped: Math.round(totalW * 100) / 100
            },
            buckets
        };
    }

    global.WordCountEngine = {
        stripTags,
        normKey,
        weightedUnits,
        analyze,
        _bestTmSimilarity: bestTmSimilarity
    };
})(typeof window !== 'undefined' ? window : globalThis);
