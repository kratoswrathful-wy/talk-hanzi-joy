/**
 * CatToolFileUpdate — 更新作業檔核心合併邏輯
 *
 * 負責：
 *   1. 依格式選出比對鍵，對舊句段與新句段陣列做 diff
 *   2. 套用合併規則（保留譯文、重置狀態、記錄原文變更資訊）
 *   3. 回傳可直接傳給 DBService.refreshFileSegments 的操作集
 *
 * 使用：
 *   const result = CatToolFileUpdate.mergeSegments(existingSegs, incomingSegs, format, nowIso);
 *   // result: { keep, update, insert, remove, stats }
 */

(function (global) {
    'use strict';

    // ── 比對鍵輔助 ────────────────────────────────────────────────────────────

    /**
     * 依格式回傳句段的「穩定比對鍵」字串。
     * - xliff / po：優先用 idValue（Segment ID / TU id），其次序號（rowIdx）
     * - excel / gsheet：優先用 idValue（Key 欄），其次 sheetName+rowIdx
     *
     * @param {object} seg
     * @param {'xliff'|'po'|'excel'|'gsheet'} format
     * @returns {string|null}  null 表示無法比對
     */
    function segmentMatchKey(seg, format) {
        const idVal = seg.idValue != null ? String(seg.idValue).trim() : '';
        if (format === 'xliff' || format === 'po') {
            // XLIFF/PO 一定有 Segment ID，無則退回 rowIdx
            if (idVal) return 'id:' + idVal;
            return 'row:' + (seg.rowIdx ?? '');
        }
        // Excel / Google Sheet
        if (idVal) return 'id:' + idVal;
        const sheet = String(seg.sheetName || '').trim() || 'Sheet1';
        return 'row:' + sheet + ':' + (seg.rowIdx ?? '');
    }

    // ── 狀態重置輔助 ──────────────────────────────────────────────────────────

    function shouldResetToUnconfirmed(existingSeg) {
        return existingSeg.status === 'confirmed';
    }

    // ── 句段相等比較（判斷是否完全無變動） ────────────────────────────────────

    function segmentsFullyEqual(a, b) {
        return (
            (a.sourceText || '') === (b.sourceText || '') &&
            (a.targetText || '') === (b.targetText || '') &&
            (a.idValue ?? null) === (b.idValue ?? null) &&
            (a.extraValue ?? null) === (b.extraValue ?? null) &&
            (a.status || '') === (b.status || '') &&
            !!(a.isLocked) === !!(b.isLocked)
        );
    }

    // ── 主函式 ────────────────────────────────────────────────────────────────

    /**
     * 比對舊句段與新句段，套用合併規則，回傳操作集。
     *
     * @param {object[]} existingSegs  資料庫現有句段（含 id、status、targetText 等欄位）
     * @param {object[]} incomingSegs  新匯入的句段（含 idValue、sourceText、targetText 等）
     * @param {'xliff'|'po'|'excel'|'gsheet'} format
     * @param {string}   nowIso        ISO 日期字串（用於 source_change_info.changedAt）
     * @returns {{
     *   keep:   object[],   // 無變動，維持現狀
     *   update: object[],   // 需更新的句段 { id, patch }
     *   insert: object[],   // 新增的句段（完整 segment 物件，不含 id）
     *   remove: (string|number)[],  // 要刪除的句段 id 陣列
     *   stats: {
     *     kept, updated, updatedSourceChanged, inserted, removed
     *   }
     * }}
     */
    function mergeSegments(existingSegs, incomingSegs, format, nowIso) {
        const today = nowIso
            ? nowIso.slice(0, 10)
            : new Date().toISOString().slice(0, 10);

        // 建立「現有句段」的 key → seg map
        const existingByKey = new Map();
        for (const seg of existingSegs) {
            const key = segmentMatchKey(seg, format);
            if (key != null) existingByKey.set(key, seg);
        }

        // 建立「新句段」的 key set（用於偵測刪除）
        const incomingKeys = new Set();
        for (const seg of incomingSegs) {
            const key = segmentMatchKey(seg, format);
            if (key != null) incomingKeys.add(key);
        }

        const keep   = [];
        const update = [];
        const insert = [];
        let updatedSourceChanged = 0;

        for (const incoming of incomingSegs) {
            const key = segmentMatchKey(incoming, format);
            const existing = key != null ? existingByKey.get(key) : undefined;

            if (!existing) {
                // 新句段：直接插入
                insert.push({ ...incoming });
                continue;
            }

            const sourceChanged = (existing.sourceText || '') !== (incoming.sourceText || '');
            const newTargetEmpty = !String(incoming.targetText || '').trim();

            // 決定最終譯文
            let finalTarget = incoming.targetText || '';
            let targetActuallyChanged = false;

            if (format === 'excel' || format === 'gsheet') {
                if (newTargetEmpty) {
                    // 新版目標欄空白 → 嘗試恢復舊版譯文
                    finalTarget = existing.targetText || '';
                } else {
                    finalTarget = incoming.targetText;
                    targetActuallyChanged = (finalTarget !== (existing.targetText || ''));
                }
            } else {
                // XLIFF / PO：新版有譯文就用新版，否則保留舊版
                if (!String(finalTarget).trim()) {
                    finalTarget = existing.targetText || '';
                } else {
                    targetActuallyChanged = (finalTarget !== (existing.targetText || ''));
                }
            }

            // 判斷是否完全無變動
            const effectiveIncoming = { ...incoming, targetText: finalTarget };
            if (!sourceChanged && !targetActuallyChanged && segmentsFullyEqual(existing, effectiveIncoming)) {
                keep.push(existing);
                continue;
            }

            // 計算 patch
            const patch = {};

            // 原文
            if (sourceChanged) {
                patch.sourceText = incoming.sourceText;
                patch.sourceTags = incoming.sourceTags || [];
                patch.sourceChangeInfo = {
                    changedAt: today,
                    previousSource: existing.sourceText || ''
                };
                updatedSourceChanged++;
            }

            // 譯文
            patch.targetText = finalTarget;
            if (incoming.targetTags && incoming.targetTags.length) {
                patch.targetTags = incoming.targetTags;
            } else if (targetActuallyChanged) {
                patch.targetTags = [];
            }

            // idValue / extraValue（新版為準）
            patch.idValue    = incoming.idValue ?? existing.idValue;
            patch.extraValue = incoming.extraValue ?? existing.extraValue;

            // 鎖定：原文有變就解除
            if (sourceChanged) {
                patch.isLocked       = false;
                patch.isLockedUser   = false;
                patch.isLockedSystem = false;
            }

            // 狀態重置：原文有變 OR 譯文有實際改動，且原本是「已確認」
            if ((sourceChanged || targetActuallyChanged) && shouldResetToUnconfirmed(existing)) {
                patch.status = 'unconfirmed';
            }

            update.push({ id: existing.id, patch });
        }

        // 舊有但新版沒有的句段 → 刪除
        const remove = [];
        for (const existing of existingSegs) {
            const key = segmentMatchKey(existing, format);
            if (key == null || !incomingKeys.has(key)) {
                remove.push(existing.id);
            }
        }

        const stats = {
            kept:                keep.length,
            updated:             update.length,
            updatedSourceChanged,
            inserted:            insert.length,
            removed:             remove.length,
        };

        return { keep, update, insert, remove, stats };
    }

    /**
     * 依句段的屬性與 filterSummary 比對，判斷是否應加入句段集。
     * 用於更新作業檔後同步句段集的新增句段。
     *
     * @param {object} seg           句段物件（含 status、matchValue 等）
     * @param {object} filterSummary 句段集的 filterSummary
     * @returns {boolean}
     */
    function segmentMatchesFilter(seg, filterSummary) {
        if (!filterSummary || typeof filterSummary !== 'object') return true;
        const { type } = filterSummary;

        // 快速結合型（全部句段）
        if (type === 'quick') return true;

        // 自訂篩選型
        const { status: fsStatus, matchMin, matchMax, hasNoMatch } = filterSummary;

        // 狀態條件
        if (Array.isArray(fsStatus) && fsStatus.length) {
            if (!fsStatus.includes(seg.status || '')) return false;
        }

        // TM 相符度條件
        const mv = seg.matchValue ?? null;
        if (hasNoMatch) {
            if (mv !== null && mv !== undefined && mv !== '' && Number(mv) > 0) return false;
        } else {
            if (matchMin != null || matchMax != null) {
                const n = mv != null ? Number(mv) : 0;
                if (matchMin != null && n < matchMin) return false;
                if (matchMax != null && n > matchMax) return false;
            }
        }

        return true;
    }

    // ── 格式偵測輔助 ──────────────────────────────────────────────────────────

    /**
     * 從 cat_files 的 name 欄位推斷格式分類。
     * @param {string} fileName
     * @returns {'xliff'|'po'|'excel'|'gsheet'|null}
     */
    function detectFormat(fileName) {
        if (!fileName) return null;
        const lower = String(fileName).toLowerCase();
        if (lower.endsWith('.xliff') || lower.endsWith('.xlf') ||
            lower.endsWith('.mqxliff') || lower.endsWith('.sdlxliff')) return 'xliff';
        if (lower.endsWith('.po') || lower.endsWith('.pot')) return 'po';
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel';
        return null;
    }

    // ── 公開 API ──────────────────────────────────────────────────────────────

    global.CatToolFileUpdate = {
        mergeSegments,
        segmentMatchesFilter,
        detectFormat,
    };

})(typeof window !== 'undefined' ? window : this);
