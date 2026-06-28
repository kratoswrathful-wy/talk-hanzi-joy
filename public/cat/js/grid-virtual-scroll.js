/**
 * CAT 編輯器虛擬捲動（Phase 2）：大檔僅渲染可見列 + buffer。
 * 由 app.js renderEditorSegments 掛載；門檻見 THRESHOLD。
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

    function shouldUse(segmentCount) {
        return segmentCount > THRESHOLD;
    }

    function isEnabled() {
        return enabled;
    }

    function heightOf(segId) {
        return rowHeights.get(String(segId)) || ESTIMATE_H;
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
        if (dirty) renderWindow();
    }

    function renderWindow(anchorSegId) {
        if (!enabled || !cfg) return;
        const list = getRenderableList();
        const gridBody = cfg.gridBody;
        if (!gridBody) return;

        if (!list.length) {
            gridBody.innerHTML = '';
            if (topSpacer) topSpacer.style.height = '0px';
            if (bottomSpacer) bottomSpacer.style.height = '0px';
            return;
        }

        let startIdx = 0;
        if (anchorSegId != null) {
            const ai = list.findIndex((s) => String(s.id) === String(anchorSegId));
            if (ai >= 0) startIdx = Math.max(0, ai - BUFFER);
        } else if (cfg.scrollEl) {
            startIdx = scrollTopToStartIdx(list, cfg.scrollEl.scrollTop);
        }

        const endIdx = Math.min(list.length, startIdx + WINDOW + BUFFER * 2);
        if (topSpacer) topSpacer.style.height = sumRange(list, 0, startIdx) + 'px';
        if (bottomSpacer) bottomSpacer.style.height = sumRange(list, endIdx, list.length) + 'px';

        if (typeof cfg.onBeforeRender === 'function') cfg.onBeforeRender();
        gridBody.innerHTML = '';
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
        gridBody.appendChild(frag);
        if (typeof cfg.onAfterRender === 'function') cfg.onAfterRender(startIdx, endIdx);
    }

    function onScroll() {
        if (!enabled) return;
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = null;
            renderWindow();
        });
    }

    function mount(options) {
        destroy();
        cfg = options || {};
        enabled = true;
        rowHeights.clear();
        ensureSpacers();
        if (!resizeObserver) {
            resizeObserver = new ResizeObserver(onResizeEntries);
        }
        scrollHandler = () => onScroll();
        if (cfg.scrollEl) cfg.scrollEl.addEventListener('scroll', scrollHandler, { passive: true });
        if (cfg.savedScrollTop != null && cfg.scrollEl) {
            cfg.scrollEl.scrollTop = cfg.savedScrollTop;
        }
        renderWindow();
    }

    function destroy() {
        enabled = false;
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
        if (!enabled || !cfg) return null;
        const fullList = typeof cfg.getList === 'function' ? cfg.getList() || [] : [];
        const renderList = getRenderableList();
        const inRender = renderList.findIndex((s) => String(s.id) === String(segId));
        const list = inRender >= 0 ? renderList : fullList;
        const idx = list.findIndex((s) => String(s.id) === String(segId));
        if (idx < 0) return null;
        if (cfg.scrollEl) cfg.scrollEl.scrollTop = sumRange(list, 0, idx);
        renderWindow(segId);
        const row = queryRow(segId);
        if (row && cfg.scrollEl) {
            row.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
        return row;
    }

    function ensureRowMounted(segId) {
        let row = queryRow(segId);
        if (row) return row;
        return scrollToSegId(segId);
    }

    function invalidateHeights() {
        rowHeights.clear();
        if (enabled) renderWindow();
    }

    global.CatVirtGrid = {
        shouldUse,
        isEnabled,
        mount,
        destroy,
        renderWindow,
        scrollToSegId,
        ensureRowMounted,
        invalidateHeights
    };
})(typeof window !== 'undefined' ? window : globalThis);
