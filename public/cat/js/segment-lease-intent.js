/**
 * 句段編輯資格：區分「這次回覆已過期」與「這句已經沒有人需要」。
 * 同一句段加同一個分頁只會有一筆後端資格，過期回覆不能把它刪掉。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.CatSegmentLeaseIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function createLeaseCoordinator() {
        const latestGen = new Map();
        const desiredGen = new Map();
        let focusEpoch = 0;
        let fileEpoch = 0;

        function beginFocus(segId) {
            const key = String(segId);
            const gen = (latestGen.get(key) || 0) + 1;
            latestGen.set(key, gen);
            desiredGen.set(key, gen);
            focusEpoch += 1;
            return { segId: key, gen, focusEpoch, fileEpoch };
        }

        function currentDesired(segId) {
            return desiredGen.get(String(segId)) || 0;
        }

        function abandonIfCurrent(segId, gen) {
            const key = String(segId);
            if ((desiredGen.get(key) || 0) === gen) desiredGen.set(key, 0);
        }

        function bumpFile() {
            fileEpoch += 1;
            desiredGen.clear();
        }

        function onAcquireSettled(ticket, activeSegId, acquired) {
            const key = ticket.segId;
            if ((latestGen.get(key) || 0) !== ticket.gen) return { action: 'ignore-stale' };
            if (ticket.fileEpoch !== fileEpoch) {
                return acquired ? { action: 'release-unneeded', gen: ticket.gen } : { action: 'ignore-stale' };
            }
            const here = String(activeSegId || '') === key && (desiredGen.get(key) || 0) === ticket.gen;
            if (!here) {
                if ((desiredGen.get(key) || 0) === ticket.gen) desiredGen.set(key, 0);
                return acquired ? { action: 'release-unneeded', gen: ticket.gen } : { action: 'ignore-stale' };
            }
            if (!acquired) {
                desiredGen.set(key, 0);
                return { action: 'rejected' };
            }
            return { action: 'hold' };
        }

        function onReleaseSettled(segId, releasedGen) {
            const key = String(segId);
            const want = desiredGen.get(key) || 0;
            if (want > releasedGen) return { action: 'reacquire', gen: want };
            return { action: 'done' };
        }

        function ticketForDesired(segId) {
            const key = String(segId);
            const gen = desiredGen.get(key) || 0;
            if (!gen || latestGen.get(key) !== gen) return null;
            return { segId: key, gen, focusEpoch, fileEpoch };
        }

        function selectReleases(heldIds, keepId, activeSegId) {
            const out = [];
            for (const segId of heldIds) {
                const key = String(segId);
                if (keepId && key === String(keepId)) continue;
                const gen = desiredGen.get(key) || 0;
                if (activeSegId && key === String(activeSegId) && gen > 0) continue;
                out.push({ segId: key, gen });
            }
            return out;
        }

        return {
            beginFocus,
            currentDesired,
            abandonIfCurrent,
            bumpFile,
            onAcquireSettled,
            onReleaseSettled,
            ticketForDesired,
            selectReleases,
            get focusEpoch() { return focusEpoch; },
            get fileEpoch() { return fileEpoch; }
        };
    }

    async function runEditorFocus(coord, env) {
        const ticket = coord.beginFocus(env.seg.id);
        const still = () => coord.currentDesired(env.seg.id) === ticket.gen
            && ticket.fileEpoch === coord.fileEpoch
            && env.activeElement() === env.targetInput;
        if (typeof env.hideFakeCaret === 'function') env.hideFakeCaret();
        if (typeof env.cancelReleaseTimer === 'function') env.cancelReleaseTimer(env.seg.id);
        if (typeof env.blockedByOther === 'function' && env.blockedByOther()) {
            if (still() && typeof env.blur === 'function') env.blur();
            coord.abandonIfCurrent(env.seg.id, ticket.gen);
            return { outcome: 'blocked' };
        }
        const lease = await env.acquire(env.seg);
        const acquired = !!(lease && lease.acquired === true);
        const hereNow = still();
        const activeSeg = hereNow ? String(env.seg.id) : env.activeSegId();
        const decision = coord.onAcquireSettled(ticket, activeSeg, acquired);
        if (decision.action === 'ignore-stale') return { outcome: 'ignore-stale' };
        if (decision.action === 'release-unneeded') {
            await env.release(env.seg.id, ticket.gen);
            return { outcome: 'release-unneeded' };
        }
        if (decision.action === 'rejected') {
            if (hereNow) {
                if (typeof env.alertOccupied === 'function') env.alertOccupied(lease);
                if (typeof env.blur === 'function') env.blur();
            }
            return { outcome: 'rejected' };
        }
        if (typeof env.releaseOthers === 'function') await env.releaseOthers(env.seg.id);
        if (!still()) {
            coord.abandonIfCurrent(env.seg.id, ticket.gen);
            await env.release(env.seg.id, ticket.gen);
            return { outcome: 'left-during-hold' };
        }
        if (typeof env.markHeld === 'function') env.markHeld(env.seg.id);
        if (typeof env.emitStart === 'function') env.emitStart();
        if (typeof env.startRefresh === 'function') env.startRefresh();
        if (typeof env.autofill === 'function') await env.autofill();
        if (!still()) return { outcome: 'left-during-autofill' };
        if (typeof env.captureUndo === 'function') env.captureUndo();
        return { outcome: 'held' };
    }

    return { createLeaseCoordinator, runEditorFocus };
});
