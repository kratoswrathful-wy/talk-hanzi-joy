/**
 * TM：由 XLIFF 檔建立候選句 + TM 寫入 payload（篩選於 app.js 用 evaluateSegment）。
 * 依賴：xliff-tag-pipeline.js → xliff-build-segments.js → 本檔
 */
(function (global) {
    'use strict';

    /**
     * @param {File} file
     * @param {object} opts
     * @param {string|number} opts.tmId
     * @param {string} [opts.tmSourceLang]
     * @param {string} [opts.tmTargetLang]
     * @returns {Promise<{ candidates: Array<{ evalSeg: object, tmPayload: object }>, rawCount: number }>}
     */
    async function buildTmImportCandidates(file, opts) {
        const BS = global.CatToolXliffBuildSegments;
        if (!BS || typeof BS.parseXliffFileToSegmentRows !== 'function') {
            throw new Error('句段建構模組未載入（js/xliff-build-segments.js）');
        }
        const tmId = opts && opts.tmId;
        if (tmId == null || tmId === '') throw new Error('缺少 tmId');

        const tmSourceLang = (opts && opts.tmSourceLang) || '';
        const tmTargetLang = (opts && opts.tmTargetLang) || '';
        const creator = (opts && opts.creatorBase) ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('localCatUserProfile')) ||
            'Unknown User';
        const ts = new Date().toLocaleString('zh-TW', { hour12: false });
        const changeMsg = `${ts} - ${creator} (以檔案匯入) 建立`;
        const iso = new Date().toISOString();
        const writtenProject = (file && file.name) || '';

        const pack = await BS.parseXliffFileToSegmentRows(file);
        const segments = pack.segments || [];
        const seenKeys = new Set();
        const candidates = [];

        for (let si = 0; si < segments.length; si++) {
            const seg = segments[si];
            const dedupKey = String(seg.idValue || '').trim() || `_row_${si}`;
            if (seenKeys.has(dedupKey)) continue;
            seenKeys.add(dedupKey);

            const st = seg.status === 'confirmed' ? 'confirmed' : 'unconfirmed';
            const evalSeg = {
                sourceText: seg.sourceText || '',
                targetText: seg.targetText || '',
                sourceTags: seg.sourceTags || [],
                targetTags: seg.targetTags || [],
                extraValue: seg.extraValue || '',
                keys: seg.idValue ? [String(seg.idValue)] : [],
                status: st,
                isLocked: !!(seg.isLocked || seg.isLockedSystem),
                matchValue: seg.matchValue != null ? seg.matchValue : null,
                tmMatch: seg.matchValue != null ? seg.matchValue : null
            };

            const srcLang = (seg.fileSourceLang || '').trim() || tmSourceLang || (pack.originalSourceLang || '');
            const tgtLang = (seg.fileTargetLang || '').trim() || tmTargetLang || (pack.originalTargetLang || '');

            const tmPayload = {
                tmId,
                sourceText: seg.sourceText || '',
                targetText: seg.targetText || '',
                key: String(seg.idValue || ''),
                prevSegment: '',
                nextSegment: '',
                writtenFile: seg.writtenFile || '',
                writtenProject,
                createdBy: `${creator} (以檔案匯入)`,
                changeLog: [changeMsg],
                sourceLang: srcLang,
                targetLang: tgtLang,
                createdAt: iso,
                lastModified: iso
            };

            candidates.push({ evalSeg, tmPayload });
        }

        return { candidates, rawCount: segments.length };
    }

    global.CatToolXliffToTm = {
        buildTmImportCandidates,
        /** @deprecated 請使用 buildTmImportCandidates */
        parseXliffForTm: async function () {
            throw new Error('請使用匯入篩選對話框（buildTmImportCandidates）');
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
