/**
 * CAT 編輯器虛擬捲動（Phase 2 / 2.1 / 2.1b）：大檔僅渲染可見列 + buffer。
 * Phase 2.1b：視窗頂端錨點 + 列內偏移、scrollTop 推窗、量高後重算 scrollTop。
 */
(function (global) {
    const THRESHOLD = 800;
    const ESTIMATE_H = 48;
    const BUFFER = 12;
    const WINDOW = 45;

    let cfg = null;
    let enabled = false;
    const rowHeights = new Map();
    let resizeObserver = null;
    let scrollHandler = null;
    let scrollRaf = null;
    let topSpacer = null;
    let bottomSpacer = null;
    let _suppressScroll = false;
    let _rendering = false;
    let _anchorSegId = null;
    let _anchorOffsetPx = 0;
    let _restoreFromAnchor = false;

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
            inferAnchorFromDom(getRenderableList());
            _restoreFromAnchor = true;
            renderWindow(null);
        }
    }

    function renderWindow(anchorSegId) {
        if (!enabled || !cfg || _rendering) return;
        _rendering = true;
        _suppressScroll = true;
        const scrollEl = cfg.scrollEl;
        const savedScrollTop = scrollEl ? scrollEl.scrollTop : 0;
        const useAnchorRestore = _restoreFromAnchor;
        _restoreFromAnchor = false;
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
                return;
            }

            let startIdx = 0;
            const explicitAnchor = anchorSegId != null ? String(anchorSegId) : null;
            const inferredAnchor = _anchorSegId;
            const inferredOffset = _anchorOffsetPx;

            if (explicitAnchor) {
                const ai = list.findIndex((s) => String(s.id) === explicitAnchor);
                if (ai >= 0) {
                    startIdx = Math.max(0, ai - BUFFER);
                    _anchorSegId = explicitAnchor;
                    _anchorOffsetPx = 0;
                }
            } else if (useAnchorRestore && inferredAnchor) {
                const ai = list.findIndex((s) => String(s.id) === String(inferredAnchor));
                if (ai >= 0) {
                    startIdx = Math.max(0, ai - BUFFER);
                } else if (scrollEl) {
                    startIdx = scrollTopToStartIdx(list, savedScrollTop);
                }
            } else if (scrollEl && savedScrollTop > 0) {
                startIdx = scrollTopToStartIdx(list, savedScrollTop);
            } else {
                inferAnchorFromDom(list);
                if (_anchorSegId) {
                    const ai = list.findIndex((s) => String(s.id) === String(_anchorSegId));
                    if (ai >= 0) startIdx = Math.max(0, ai - BUFFER);
                }
            }

            const endIdx = Math.min(list.length, startIdx + WINDOW + BUFFER * 2);
            if (topSpacer) topSpacer.style.height = sumRange(list, 0, startIdx) + 'px';
            if (bottomSpacer) bottomSpacer.style.height = sumRange(list, endIdx, list.length) + 'px';

            if (typeof cfg.onBeforeRender === 'function') cfg.onBeforeRender();

            const frag = document.createDocumentFragment();
            for (let i = startIdx; i < endIdx; i++) {
                const seg = list[i];
                const rowIdx = seg.rowIdx != null ? seg.rowIdx : i;
                const row = cfg.buildRow(seg, rowIdx);
                if (row) {
                    frag.appendChild(row);
                    observeRow(row, seg.id);
                    if (typeof cfg.onRowMounted === 'function') cfg.onRowMounted(row, seg);
                }
            }
            gridBody.replaceChildren(frag);

            if (typeof cfg.onAfterRender === 'function') cfg.onAfterRender(startIdx, endIdx);

            if (scrollEl) {
                let targetTop;
                if (explicitAnchor) {
                    const ai = list.findIndex((s) => String(s.id) === explicitAnchor);
                    targetTop = ai >= 0 ? scrollTopFromAnchor(list, explicitAnchor, 0) : savedScrollTop;
                    _anchorSegId = explicitAnchor;
                    _anchorOffsetPx = 0;
                } else if (useAnchorRestore && inferredAnchor) {
                    targetTop = scrollTopFromAnchor(list, inferredAnchor, inferredOffset);
                    _anchorSegId = inferredAnchor;
                    _anchorOffsetPx = inferredOffset;
                } else if (inferredAnchor) {
                    targetTop = scrollTopFromAnchor(list, inferredAnchor, inferredOffset);
                    _anchorSegId = inferredAnchor;
                    _anchorOffsetPx = inferredOffset;
                } else {
                    targetTop = savedScrollTop;
                }
                scrollEl.scrollTop = targetTop;
            }
        } finally {
            _suppressScroll = false;
            _rendering = false;
        }
    }

    function onScroll() {
        if (!enabled || _suppressScroll || _rendering) return;
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = null;
            inferAnchorFromDom(getRenderableList());
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

    function scrollToSegId(segId) {
        if (!enabled || !cfg || segId == null) return null;
        const list = getRenderableList();
        const idx = list.findIndex((s) => String(s.id) === String(segId));
        if (idx < 0) return null;
        _anchorSegId = String(segId);
        _anchorOffsetPx = 0;
        _restoreFromAnchor = true;
        renderWindow(segId);
        return queryRow(segId);
    }

    function ensureRowMounted(segId) {
        let row = queryRow(segId);
        if (row) return row;
        return scrollToSegId(segId);
    }

    function invalidateHeights() {
        if (!enabled) return;
        inferAnchorFromDom(getRenderableList());
        rowHeights.clear();
        _restoreFromAnchor = true;
        renderWindow(_anchorSegId);
    }

    global.CatVirtGrid = {
        shouldUse,
        isEnabled,
        getAnchorSegId,
        mount,
        destroy,
        renderWindow,
        scrollToSegId,
        ensureRowMounted,
        invalidateHeights
    };
})(typeof window !== 'undefined' ? window : globalThis);
