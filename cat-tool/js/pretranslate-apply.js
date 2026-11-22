/**
 * 預先翻譯套用決策。
 * 同分保留先出現的候選；分數必須高過目前最佳才換人。
 * 自動確認只在譯文成功寫入、而且仍是這次選定的文字時才做。
 * 編輯器較早的草稿世代不得在批次之後把舊字寫回去。
 */
(function (root) {
    function choosePreTranslateCandidate(candidates, threshold) {
        const list = Array.isArray(candidates) ? candidates : [];
        const gate = Number(threshold);
        const min = Number.isFinite(gate) ? gate : 100;
        let best = null;
        let bestScore = 0;
        for (const item of list) {
            const score = Number(item && item.score);
            if (!(score > bestScore)) continue;
            best = item;
            bestScore = score;
        }
        if (!best || !(bestScore >= min)) return null;
        const entry = best.entry != null ? best.entry : best.candidate;
        return { candidate: entry, score: bestScore };
    }

    function planPreTranslateWrite(input) {
        const src = input || {};
        const score = Number(src.score);
        const text = src.candidateText == null ? '' : String(src.candidateText);
        const tags = Array.isArray(src.candidateTags)
            ? src.candidateTags.map((tag) => ({ ...tag }))
            : [];
        return {
            text,
            tags,
            matchValue: String(score),
            confirmAfterSave: !!(src.autoConfirm && score >= 100)
        };
    }

    function editorDraftMustYield(capturedEpoch, liveEpoch) {
        return Number(capturedEpoch) !== Number(liveEpoch);
    }

    /** 畫面外沒有格子就不要擋。正在組字，或格子裡的字和已保存的不同，這一批不要蓋掉。 */
    function preTranslateShouldSkipLiveDraft(modelText, liveText, composing) {
        if (liveText == null) return false;
        if (composing) return true;
        return String(liveText) !== String(modelText || '');
    }

    /** 還有格子正在組字時，不要整表重畫，以免組字被拆掉。 */
    function preTranslateMayRebuildGrid(composing) {
        return !composing;
    }

    root.CatPretranslateApply = {
        choosePreTranslateCandidate,
        planPreTranslateWrite,
        editorDraftMustYield,
        preTranslateShouldSkipLiveDraft,
        preTranslateMayRebuildGrid
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
