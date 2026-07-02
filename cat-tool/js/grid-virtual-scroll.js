/**
 * CAT 編輯器虛擬捲動（Phase 2 / 2.1 / 2.1b / 2.1c）。
 * Phase 2.1c：捲動 debounce、窗口未變跳過重畫、savedScrollTop 還原、resize 合批。
 * Phase 2.1d：窗口邊界一變即重畫（移除 scroll debounce 等待）。
 */
(function (global) {
    const THRESHOLD = 800;
    const ESTIMATE_H = 48;
    const BUFFER = 12;
    const WINDOW = 45;
    const RESIZE_DEBOUNCE_MS = 80;

    let cfg = null;
    let enabled = false;
    const rowHeights = new Map();
    let resizeObserver = null;
    let scrollHandler = null;
    let scrollRaf = null;
    let scrollDebounceTimer = null;
    let resizeDebounceTimer = null;
    let topSpacer = null;
    let bottomSpacer = null;
    let _suppressScroll = false;
    let _rendering = false;
    let _anchorSegId = null;
    let _anchorOffsetPx = 0;
    let _restoreFromAnchor = false;
    let _lastStartIdx = -1;
    let _lastEndIdx = -1;
    let _navAnchorLock = false;
    let _navAnchorBlock = 'center';
    let _navAnchorLockTimer = null;
    const NAV_ANCHOR_LOCK_MS = 200;
    let _lastNavScrollKey = '';
    let _lastNavScrollAt = 0;
    const NAV_SCROLL_COALESCE_MS = 48;

    function shouldUse(segmentCount) {
        return segmentCount > THRESHOLD;
    }

    function isEnabled() {
        return enabled;
    }

    function getAnchorSegId() {
        return _anchorSegId;
    }

    function medianCachedHeight() {
        if (rowHeights.size < 3) return ESTIMATE_H;
        const vals = Array.from(rowHeights.values()).sort((a, b) => a - b);
        return vals[Math.floor(vals.length / 2)] || ESTIMATE_H;
    }

    function heightOf(segId) {
        const h = rowHeights.get(String(segId));
        if (h != null && h > 0) return h;
        return medianCachedHeight();
    }

    function sumRange(list, start, end) {
        let total = 0;
        for (let i = start; i < end && i < list.length; i++) {
            total += heightOf(list[i].id);
        }
        return total;
    }

    function getRenderableList() {
        if (!cfg || typeof cfg.getList !== 'function') return [];
        const list = cfg.getList() || [];
        if (typeof cfg.isSegVisible === 'function') {
            return list.filter((seg) => cfg.isSegVisible(seg));
        }
        return list;
    }

    function scrollTopToStartIdx(list, scrollTop) {
        let acc = 0;
        for (let i = 0; i < list.length; i++) {
            const h = heightOf(list[i].id);
            if (acc + h > scrollTop) return Math.max(0, i - BUFFER);
            acc += h;
        }
        return Math.max(0, list.length - WINDOW - BUFFER);
    }

    function scrollTopFromAnchor(list, segId, offsetPx) {
        if (!list.length || segId == null) return 0;
        const ai = list.findIndex((s) => String(s.id) === String(segId));
        if (ai < 0) return 0;
        return Math.max(0, sumRange(list, 0, ai) - (offsetPx || 0));
    }

    function releaseNavAnchorLock() {
        _navAnchorLock = false;
        if (_navAnchorLockTimer) {
            clearTimeout(_navAnchorLockTimer);
            _navAnchorLockTimer = null;
        }
    }

    function armNavAnchorLock(block) {
        _navAnchorLock = true;
        _navAnchorBlock = block === 'center' ? 'center' : 'start';
        if (_navAnchorLockTimer) clearTimeout(_navAnchorLockTimer);
        _navAnchorLockTimer = setTimeout(() => {
            _navAnchorLockTimer = null;
            _navAnchorLock = false;
        }, NAV_ANCHOR_LOCK_MS);
    }

    function inferAnchorFromDom(list) {
        if (!cfg || !cfg.gridBody || !cfg.scrollEl || !list.length) return false;
        const viewportTop = cfg.scrollEl.getBoundingClientRect().top;
        const rows = cfg.gridBody.querySelectorAll('.grid-data-row');
        if (!rows.length) return false;

        let bestRow = null;
        let bestDist = Infinity;
        rows.forEach((row) => {
            const rect = row.getBoundingClientRect();
            if (rect.bottom <= viewportTop) return;
            const dist = Math.abs(rect.top - viewportTop);
            if (dist < bestDist) {
                bestDist = dist;
                bestRow = row;
            }
        });

        if (!bestRow || !bestRow.dataset.segId) return false;
        const sid = String(bestRow.dataset.segId);
        const idx = list.findIndex((s) => String(s.id) === sid);
        if (idx < 0) return false;

        _anchorSegId = sid;
        _anchorOffsetPx = bestRow.getBoundingClientRect().top - viewportTop;
        return true;
    }

    function updateSpacerHeights(list, startIdx, endIdx) {
        if (topSpacer) topSpacer.style.height = sumRange(list, 0, startIdx) + 'px';
        if (bottomSpacer) bottomSpacer.style.height = sumRange(list, endIdx, list.length) + 'px';
    }

    function setScrollTopDeferred(scrollEl, targetTop) {
        scrollEl.scrollTop = targetTop;
        requestAnimationFrame(() => {
            _suppressScroll = false;
        });
    }

    function ensureSpacers() {
        if (!cfg || !cfg.scrollEl || !cfg.gridBody) return;
        const parent = cfg.scrollEl;
        if (!topSpacer) {
            topSpacer = document.createElement('div');
            topSpacer.id = 'gridVirtualSpacerTop';
            topSpacer.className = 'grid-virtual-spacer';
            topSpacer.style.height = '0px';
            parent.insertBefore(topSpacer, cfg.gridBody);
        }
        if (!bottomSpacer) {
            bottomSpacer = document.createElement('div');
            bottomSpacer.id = 'gridVirtualSpacerBottom';
            bottomSpacer.className = 'grid-virtual-spacer';
            bottomSpacer.style.height = '0px';
            parent.appendChild(bottomSpacer);
        }
        cfg.topSpacer = topSpacer;
        cfg.bottomSpacer = bottomSpacer;
    }

    function removeSpacers() {
        if (topSpacer && topSpacer.parentNode) topSpacer.parentNode.removeChild(topSpacer);
        if (bottomSpacer && bottomSpacer.parentNode) bottomSpacer.parentNode.removeChild(bottomSpacer);
        topSpacer = null;
        bottomSpacer = null;
        if (cfg) {
            cfg.topSpacer = null;
            cfg.bottomSpacer = null;
        }
    }

    function observeRow(row, segId) {
        if (!resizeObserver || !row) return;
        row.dataset.virtObs = String(segId);
        resizeObserver.observe(row);
    }

    function scheduleResizeRepaint() {
        if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
            resizeDebounceTimer = null;
            if (!enabled || _rendering) return;
            const list = getRenderableList();
            const scrollEl = cfg && cfg.scrollEl;
            if (!list.length || !scrollEl) return;
            if (_navAnchorLock && _anchorSegId) {
                _restoreFromAnchor = false;
                renderWindow(_anchorSegId, _navAnchorBlock);
                return;
            }
            const savedScrollTop = scrollEl.scrollTop;
            const startIdx = scrollTopToStartIdx(list, savedScrollTop);
            const endIdx = Math.min(list.length, startIdx + WINDOW + BUFFER * 2);
            if (startIdx === _lastStartIdx && endIdx === _lastEndIdx) {
                updateSpacerHeights(list, startIdx, endIdx);
                return;
            }
            inferAnchorFromDom(list);
            _restoreFromAnchor = false;
            renderWindow(null);
        }, RESIZE_DEBOUNCE_MS);
    }

    function onResizeEntries(entries) {
        let dirty = false;
        for (const entry of entries) {
            const row = entry.target;
            const sid = row.dataset && row.dataset.segId;
            if (!sid) continue;
            const h = entry.contentRect.height;
            if (h > 0) {
                const ceil = Math.ceil(h);
                if (Math.abs(heightOf(sid) - ceil) > 1) {
                    rowHeights.set(String(sid), ceil);
                    dirty = true;
                }
            }
        }
        if (dirty && !_rendering) {
            scheduleResizeRepaint();
        }
    }

    function computeWindowRange(list, anchorSegId, savedScrollTop, useAnchorRestore) {
        let startIdx = 0;
        const explicitAnchor = anchorSegId != null ? String(anchorSegId) : null;

        if (explicitAnchor) {
            const ai = list.findIndex((s) => String(s.id) === explicitAnchor);
            if (ai >= 0) {
                startIdx = Math.max(0, ai - BUFFER);
                _anchorSegId = explicitAnchor;
                _anchorOffsetPx = 0;
            }
        } else if (useAnchorRestore && _anchorSegId) {
            const ai = list.findIndex((s) => String(s.id) === String(_anchorSegId));
            if (ai >= 0) {
                startIdx = Math.max(0, ai - BUFFER);
            } else if (cfg.scrollEl) {
                startIdx = scrollTopToStartIdx(list, savedScrollTop);
            }
        } else if (cfg.scrollEl && savedScrollTop > 0) {
            startIdx = scrollTopToStartIdx(list, savedScrollTop);
        } else {
            inferAnchorFromDom(list);
            if (_anchorSegId) {
                const ai = list.findIndex((s) => String(s.id) === String(_anchorSegId));
                if (ai >= 0) startIdx = Math.max(0, ai - BUFFER);
            }
        }

        const endIdx = Math.min(list.length, startIdx + WINDOW + BUFFER * 2);
        return { startIdx, endIdx, explicitAnchor };
    }

    function renderWindow(anchorSegId, block) {
        if (!enabled || !cfg || _rendering) return;
        const scrollBlock = block === 'center' ? 'center' : 'start';
        _rendering = true;
        _suppressScroll = true;
        const scrollEl = cfg.scrollEl;
        const savedScrollTop = scrollEl ? scrollEl.scrollTop : 0;
        const useAnchorRestore = _restoreFromAnchor;
        _restoreFromAnchor = false;
        let deferSuppress = false;
        try {
            const list = getRenderableList();
            const gridBody = cfg.gridBody;
            if (!gridBody) return;

            if (!list.length) {
                gridBody.replaceChildren();
                if (topSpacer) topSpacer.style.height = '0px';
                if (bottomSpacer) bottomSpacer.style.height = '0px';
                _anchorSegId = null;
                _anchorOffsetPx = 0;
                _lastStartIdx = -1;
                _lastEndIdx = -1;
                return;
            }

            const { startIdx, endIdx, explicitAnchor } = computeWindowRange(
                list, anchorSegId, savedScrollTop, useAnchorRestore
            );

            if (!explicitAnchor && !useAnchorRestore &&
                startIdx === _lastStartIdx && endIdx === _lastEndIdx) {
                updateSpacerHeights(list, startIdx, endIdx);
                deferSuppress = true;
                setScrollTopDeferred(scrollEl, savedScrollTop);
                return;
            }

            updateSpacerHeights(list, startIdx, endIdx);

            if (typeof cfg.onBeforeRender === 'function') cfg.onBeforeRender();

            const frag = document.createDocumentFragment();
            for (let i = startIdx; i < endIdx; i++) {
                const seg = list[i];
                let globalIdx = i;
                if (typeof cfg.getGlobalIndex === 'function') {
                    const gi = cfg.getGlobalIndex(seg);
                    if (gi >= 0) globalIdx = gi;
                } else if (seg.rowIdx != null) {
                    globalIdx = seg.rowIdx;
                }
                const row = cfg.buildRow(seg, globalIdx);
                if (row) {
                    frag.appendChild(row);
                    observeRow(row, seg.id);
                    if (typeof cfg.onRowMounted === 'function') cfg.onRowMounted(row, seg);
                }
            }
            gridBody.replaceChildren(frag);
            _lastStartIdx = startIdx;
            _lastEndIdx = endIdx;

            if (typeof cfg.onAfterRender === 'function') cfg.onAfterRender(startIdx, endIdx);

            if (scrollEl) {
                let targetTop;
                if (explicitAnchor) {
                    if (scrollBlock === 'center') {
                        const vh = scrollEl.clientHeight;
                        const h = heightOf(explicitAnchor);
                        targetTop = scrollTopFromAnchor(list, explicitAnchor, vh / 2 - h / 2);
                    } else {
                        targetTop = scrollTopFromAnchor(list, explicitAnchor, 0);
                    }
                    _anchorSegId = explicitAnchor;
                    _anchorOffsetPx = scrollBlock === 'center' ? scrollEl.clientHeight / 2 - heightOf(explicitAnchor) / 2 : 0;
                } else {
                    targetTop = savedScrollTop;
                }
                deferSuppress = true;
                setScrollTopDeferred(scrollEl, targetTop);
            }
        } finally {
            _rendering = false;
            if (!deferSuppress) {
                _suppressScroll = false;
            }
        }
    }

    function onScroll() {
        if (!enabled || _suppressScroll || _rendering) return;
        if (typeof cfg.onUserScroll === 'function') cfg.onUserScroll();
        releaseNavAnchorLock();
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = null;
            if (!enabled || _suppressScroll || _rendering) return;
            const list = getRenderableList();
            const scrollEl = cfg && cfg.scrollEl;
            if (!list.length || !scrollEl) return;
            const nextStart = scrollTopToStartIdx(list, scrollEl.scrollTop);
            const nextEnd = Math.min(list.length, nextStart + WINDOW + BUFFER * 2);
            if (nextStart === _lastStartIdx && nextEnd === _lastEndIdx) return;
            if (scrollDebounceTimer) {
                clearTimeout(scrollDebounceTimer);
                scrollDebounceTimer = null;
            }
            renderWindow(null);
        });
    }

    function mount(options) {
        destroy();
        cfg = options || {};
        enabled = true;
        rowHeights.clear();
        _anchorSegId = null;
        _anchorOffsetPx = 0;
        _restoreFromAnchor = false;
        _lastStartIdx = -1;
        _lastEndIdx = -1;
        releaseNavAnchorLock();
        _navAnchorBlock = 'center';
        ensureSpacers();
        if (!resizeObserver) {
            resizeObserver = new ResizeObserver(onResizeEntries);
        }
        scrollHandler = () => onScroll();
        if (cfg.scrollEl) cfg.scrollEl.addEventListener('scroll', scrollHandler, { passive: true });
        _suppressScroll = true;
        try {
            if (cfg.savedScrollTop != null && cfg.scrollEl) {
                cfg.scrollEl.scrollTop = cfg.savedScrollTop;
            }
        } finally {
            _suppressScroll = false;
        }
        renderWindow(null);
    }

    function destroy() {
        enabled = false;
        _suppressScroll = false;
        _rendering = false;
        _anchorSegId = null;
        _anchorOffsetPx = 0;
        _restoreFromAnchor = false;
        _lastStartIdx = -1;
        _lastEndIdx = -1;
        releaseNavAnchorLock();
        _navAnchorBlock = 'center';
        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
            scrollDebounceTimer = null;
        }
        if (resizeDebounceTimer) {
            clearTimeout(resizeDebounceTimer);
            resizeDebounceTimer = null;
        }
        if (cfg && cfg.scrollEl && scrollHandler) {
            cfg.scrollEl.removeEventListener('scroll', scrollHandler);
        }
        scrollHandler = null;
        if (scrollRaf) {
            cancelAnimationFrame(scrollRaf);
            scrollRaf = null;
        }
        if (resizeObserver) resizeObserver.disconnect();
        removeSpacers();
        rowHeights.clear();
        cfg = null;
    }

    function queryRow(segId) {
        if (!cfg || !cfg.gridBody || segId == null) return null;
        const sid = String(segId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return cfg.gridBody.querySelector(`.grid-data-row[data-seg-id="${sid}"]`);
    }

    function scrollToSegId(segId, block) {
        if (!enabled || !cfg || segId == null) return null;
        const list = getRenderableList();
        const idx = list.findIndex((s) => String(s.id) === String(segId));
        if (idx < 0) return null;
        const scrollBlock = block === 'center' ? 'center' : 'start';
        const navKey = `${String(segId)}:${scrollBlock}`;
        const now = Date.now();
        if (_lastNavScrollKey === navKey && (now - _lastNavScrollAt) < NAV_SCROLL_COALESCE_MS) {
            return queryRow(segId);
        }
        _lastNavScrollKey = navKey;
        _lastNavScrollAt = now;
        armNavAnchorLock(block);
        _anchorSegId = String(segId);
        _anchorOffsetPx = 0;
        _restoreFromAnchor = false;
        _lastStartIdx = -1;
        _lastEndIdx = -1;
        renderWindow(segId, block);
        return queryRow(segId);
    }

    function ensureRowMounted(segId) {
        let row = queryRow(segId);
        if (row) return row;
        return scrollToSegId(segId);
    }

    function isSegIdCentered(segId, tolerancePx) {
        if (!enabled || !cfg || !cfg.scrollEl || segId == null) return false;
        const row = queryRow(segId);
        if (!row) return false;
        const scrollEl = cfg.scrollEl;
        const rowRect = row.getBoundingClientRect();
        const viewportRect = scrollEl.getBoundingClientRect();
        const rowCenter = rowRect.top + rowRect.height / 2;
        const viewportCenter = viewportRect.top + viewportRect.height / 2;
        const tol = tolerancePx != null ? tolerancePx : 24;
        return Math.abs(rowCenter - viewportCenter) <= tol;
    }

    function centerOnSegId(segId) {
        if (!enabled || !cfg || !cfg.scrollEl || segId == null) return false;
        const list = getRenderableList();
        const ai = list.findIndex((s) => String(s.id) === String(segId));
        if (ai < 0) return false;
        const scrollEl = cfg.scrollEl;
        const vh = scrollEl.clientHeight;
        const h = heightOf(String(segId));
        const targetTop = Math.max(0, sumRange(list, 0, ai) - vh / 2 + h / 2);
        const nextStart = scrollTopToStartIdx(list, targetTop);
        const nextEnd = Math.min(list.length, nextStart + WINDOW + BUFFER * 2);
        if (nextStart !== _lastStartIdx || nextEnd !== _lastEndIdx) {
            return scrollToSegId(segId, 'center') != null;
        }
        _suppressScroll = true;
        try {
            scrollEl.scrollTop = targetTop;
            _anchorSegId = String(segId);
            _anchorOffsetPx = vh / 2 - h / 2;
        } finally {
            requestAnimationFrame(() => {
                _suppressScroll = false;
            });
        }
        return true;
    }

    function invalidateHeights(anchorSegId, block) {
        if (!enabled) return;
        rowHeights.clear();
        _restoreFromAnchor = false;
        _lastStartIdx = -1;
        _lastEndIdx = -1;
        releaseNavAnchorLock();
        _navAnchorBlock = 'center';
        const list = getRenderableList();
        let passAnchor = anchorSegId;
        if (passAnchor != null && passAnchor !== '') {
            const ai = list.findIndex((s) => String(s.id) === String(passAnchor));
            if (ai < 0) passAnchor = null;
        }
        renderWindow(passAnchor != null ? passAnchor : null, block);
    }

    /** Phase 2.3g：顯式導覽完成後釋放錨點，避免使用者手動捲動被拉回。 */
    function releaseNavigationAnchor() {
        _anchorSegId = null;
        _anchorOffsetPx = 0;
    }

    /**
     * Phase 2.3q：完全取消導覽錨點（含 lock timer + coalesce key），
     * 避免 resize / repaint 把 viewport 拉回舊錨點。
     * @param {string} [reason] 取消原因（供 debug log 用）
     */
    function cancelNavigationAnchor(reason) {
        const hadLock = _navAnchorLock;
        _anchorSegId = null;
        _anchorOffsetPx = 0;
        releaseNavAnchorLock();
        _lastNavScrollKey = null;
        if (typeof console !== 'undefined' && console && localStorage && localStorage.getItem('catNavDebug') === '1') {
            console.log('[catVirt] cancelNavigationAnchor', { reason, hadLock });
        }
    }

    /** Phase 2.3q：供除錯用，回傳 virt 內部核心狀態快照。 */
    function getDebugState() {
        return {
            enabled,
            anchorSegId: _anchorSegId,
            anchorOffsetPx: _anchorOffsetPx,
            navAnchorLock: _navAnchorLock,
            navAnchorBlock: _navAnchorBlock,
            lastStartIdx: _lastStartIdx,
            lastEndIdx: _lastEndIdx,
            lastNavScrollKey: _lastNavScrollKey,
        };
    }

    function getWindowStartIdx() {
        return _lastStartIdx >= 0 ? _lastStartIdx : -1;
    }

    global.CatVirtGrid = {
        shouldUse,
        isEnabled,
        getAnchorSegId,
        getWindowStartIdx,
        mount,
        destroy,
        renderWindow,
        scrollToSegId,
        ensureRowMounted,
        isSegIdCentered,
        centerOnSegId,
        invalidateHeights,
        releaseNavigationAnchor,
        cancelNavigationAnchor,
        getDebugState,
    };
})(typeof window !== 'undefined' ? window : globalThis);
