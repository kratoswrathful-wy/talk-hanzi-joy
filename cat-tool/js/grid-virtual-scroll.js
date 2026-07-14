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
    let _catScrollWriteSeq = 0;
    let _renderTrigger = 'unknown';
    let _navAnchorLockExplicitHold = false;

    function isCatNavDebug() {
        return typeof localStorage !== 'undefined' && localStorage.getItem('catNavDebug') === '1';
    }

    /** Phase R：每次寫入 #editorGrid.scrollTop 都記錄來源與序號，供揪出「最後寫入者」。 */
    function logScrollTopWrite(source, trigger, scrollEl, before, after, extra) {
        if (!isCatNavDebug()) return;
        _catScrollWriteSeq++;
        console.log('[catNav] scrollTop write', {
            seq: _catScrollWriteSeq,
            t: Math.round(performance.now()),
            source,
            trigger: trigger || _renderTrigger,
            before: Math.round(before),
            after: Math.round(after),
            delta: Math.round(after - before),
            navAnchorLock: _navAnchorLock,
            anchorSegId: _anchorSegId,
            ...(extra || {}),
        });
    }

    function assignScrollTop(scrollEl, value, source, trigger, extra) {
        if (!scrollEl) return;
        const before = scrollEl.scrollTop;
        scrollEl.scrollTop = value;
        const after = scrollEl.scrollTop;
        logScrollTopWrite(source, trigger, scrollEl, before, after, extra);
    }

    function adjustScrollTop(scrollEl, adjust, source, trigger, extra) {
        if (!scrollEl || !adjust) return;
        const before = scrollEl.scrollTop;
        scrollEl.scrollTop += adjust;
        const after = scrollEl.scrollTop;
        logScrollTopWrite(source, trigger, scrollEl, before, after, { adjust: Math.round(adjust), ...(extra || {}) });
    }

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
        const headerH = getGridHeaderScrollOffset();
        const adjusted = Math.max(0, scrollTop - headerH);
        let acc = 0;
        for (let i = 0; i < list.length; i++) {
            const h = heightOf(list[i].id);
            if (acc + h > adjusted) return Math.max(0, i - BUFFER);
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

    /** Phase R：sticky #gridHeaderRow 在 scroll 內容頂部，center 公式須納入。 */
    function getGridHeaderScrollOffset() {
        const header = document.getElementById('gridHeaderRow');
        if (header && header.dataset.layoutHeight) {
            const fromData = parseInt(header.dataset.layoutHeight, 10);
            if (fromData > 1) return fromData;
        }
        if (cfg && typeof cfg.getHeaderScrollOffset === 'function') {
            const fromCfg = cfg.getHeaderScrollOffset();
            if (fromCfg > 0) return fromCfg;
        }
        const scrollEl = (cfg && cfg.scrollEl) || document.getElementById('editorGrid');
        const headerEl = header || document.getElementById('gridHeaderRow');
        if (headerEl) {
            const hb = headerEl.getBoundingClientRect();
            if (hb.height > 1) return Math.ceil(hb.height);
            const statusCell = headerEl.querySelector('.grid-header-cell[data-col-id="col-status"]');
            if (statusCell) {
                const cellH = statusCell.getBoundingClientRect().height;
                if (cellH > 1) return Math.ceil(cellH);
            }
            if (headerEl.offsetHeight > 0) return headerEl.offsetHeight;
        }
        const top = topSpacer || document.getElementById('gridVirtualSpacerTop');
        const topH = top ? top.offsetHeight : 0;
        const body = (cfg && cfg.gridBody) || document.getElementById('gridBody');
        if (body && body.offsetTop > topH) {
            return body.offsetTop - topH;
        }
        if (scrollEl && headerEl) {
            const gb = scrollEl.getBoundingClientRect();
            const hb = headerEl.getBoundingClientRect();
            const visibleHeader = Math.max(0, Math.min(hb.bottom, gb.bottom) - Math.max(hb.top, gb.top));
            if (visibleHeader > 1) return Math.round(visibleHeader);
        }
        return 0;
    }

    function findRowForCenter(segId) {
        let row = queryRow(segId);
        if (row || segId == null) return row;
        const sid = String(segId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return document.querySelector(`.grid-data-row[data-seg-id="${sid}"]`);
    }

    /**
     * Phase R：virt explicit center 的 scrollTop 與 anchor offset。
     * targetTop = headerH + sumRange(0, ai) - (vh/2 - h/2)
     */
    function computeCenterScrollTop(list, segId, scrollEl, anchorRowEl) {
        const ai = list.findIndex((s) => String(s.id) === String(segId));
        if (ai < 0 || !scrollEl) return { targetTop: 0, anchorOffsetPx: 0 };
        const vh = scrollEl.clientHeight;
        const h = heightOf(String(segId));
        const headerH = getGridHeaderScrollOffset();
        const anchorOffsetPx = vh / 2 - h / 2;
        const targetTop = Math.max(0, headerH + sumRange(list, 0, ai) - anchorOffsetPx);
        return { targetTop, anchorOffsetPx, headerH };
    }

    /** Phase R：以 DOM 量測對齊 #editorGrid 中心（與 app.js measureRowCenterDeltaPx 一致）。 */
    function applyCenterScrollCorrection(segId, scrollEl, anchorRowEl) {
        if (!scrollEl || segId == null) return 0;
        const wasSuppress = _suppressScroll;
        _suppressScroll = true;
        let lastDelta = 0;
        try {
            for (let pass = 0; pass < 6; pass++) {
                const row = anchorRowEl || findRowForCenter(segId);
                if (!row) break;
                const rb = row.getBoundingClientRect();
                const gb = scrollEl.getBoundingClientRect();
                const delta = Math.round(((rb.top + rb.bottom) / 2) - ((gb.top + gb.bottom) / 2));
                lastDelta = delta;
                if (Math.abs(delta) <= 1) break;
                const adjust = -delta;
                const beforeTop = scrollEl.scrollTop;
                adjustScrollTop(scrollEl, adjust, 'applyCenterScrollCorrection', 'centerCorrection', { pass, delta });
                if (scrollEl.scrollTop === beforeTop) break;
            }
        } finally {
            _suppressScroll = wasSuppress;
        }
        if (isCatNavDebug() && lastDelta !== 0) {
            console.log('[catNav] explicit center diagnostic', {
                phase: 'after applyCenterScrollCorrection',
                source: 'CatVirtGrid',
                segId: String(segId),
                lastDelta,
                scrollTop: scrollEl.scrollTop,
                maxScroll: scrollEl.scrollHeight - scrollEl.clientHeight,
            });
        }
        return lastDelta;
    }

    function releaseNavAnchorLock() {
        _navAnchorLockExplicitHold = false;
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
        if (_navAnchorLockExplicitHold) {
            _navAnchorLockTimer = null;
            return;
        }
        _navAnchorLockTimer = setTimeout(() => {
            _navAnchorLockTimer = null;
            _navAnchorLock = false;
        }, NAV_ANCHOR_LOCK_MS);
    }

    /** Phase R：explicit center 導覽進行中，鎖定直到 cancelNavigationAnchor／releaseNavAnchorLock。 */
    function holdNavAnchorLockForExplicitNav(block) {
        _navAnchorLockExplicitHold = true;
        _navAnchorLock = true;
        _navAnchorBlock = block === 'center' ? 'center' : 'start';
        if (_navAnchorLockTimer) {
            clearTimeout(_navAnchorLockTimer);
            _navAnchorLockTimer = null;
        }
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

    function setScrollTopDeferred(scrollEl, targetTop, trigger) {
        assignScrollTop(scrollEl, targetTop, 'setScrollTopDeferred', trigger || _renderTrigger, { targetTop: Math.round(targetTop) });
        if (isCatNavDebug()) {
            console.log('[catNav] explicit center diagnostic', {
                phase: 'after setScrollTopDeferred',
                source: 'CatVirtGrid',
                targetTop,
                scrollTop: scrollEl.scrollTop,
                headerH: getGridHeaderScrollOffset(),
                virt: {
                    anchorSegId: _anchorSegId,
                    navAnchorLock: _navAnchorLock,
                    lastStartIdx: _lastStartIdx,
                    lastEndIdx: _lastEndIdx,
                },
            });
        }
        requestAnimationFrame(() => {
            _suppressScroll = false;
        });
    }

    /**
     * Phase R：center 路徑在 rAF 解除 suppress 後觸發 onAfterRender（flush 鏈）。
     * 置中依 computeCenterScrollTop 模型（含 headerH）；不在 suppress 期間做 DOM 迭代修正。
     */
    function finishCenterAfterScroll(scrollEl, segId, anchorRowEl, startIdx, endIdx, runAfterRender) {
        requestAnimationFrame(() => {
            _suppressScroll = false;
            if (isCatNavDebug() && scrollEl && segId != null) {
                console.log('[catNav] explicit center diagnostic', {
                    phase: 'after renderWindow',
                    source: 'CatVirtGrid',
                    anchorSegId: String(segId),
                    block: 'center',
                    scrollTop: scrollEl.scrollTop,
                    headerH: getGridHeaderScrollOffset(),
                    anchorRowFound: !!(anchorRowEl || findRowForCenter(segId)),
                    lastStartIdx: _lastStartIdx,
                    lastEndIdx: _lastEndIdx,
                    navAnchorLock: _navAnchorLock,
                });
            }
            if (runAfterRender && cfg && typeof cfg.onAfterRender === 'function') {
                cfg.onAfterRender(startIdx, endIdx);
            }
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
            // Phase R：explicit center 導覽鎖期間 RO 不重繪（避免 setScrollTopDeferred 蓋掉 DOM 修正）
            if (_navAnchorLockExplicitHold && _navAnchorBlock === 'center') return;
            if (_navAnchorLock && _anchorSegId) {
                _restoreFromAnchor = false;
                renderWindow(_anchorSegId, _navAnchorBlock, 'resizeRepaint:navLock');
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
            renderWindow(null, null, 'resizeRepaint');
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
            if (typeof localStorage !== 'undefined' && localStorage.getItem('catNavDebug') === '1') {
                console.log('[catNav] explicit center diagnostic', {
                    phase: 'after ResizeObserver/invalidateHeights',
                    source: 'CatVirtGrid',
                    trigger: 'resizeObserver',
                    navAnchorLock: _navAnchorLock,
                    anchorSegId: _anchorSegId,
                });
            }
            // Phase R3：explicit nav 進行中僅更新高度快取，不重繪窗口（避免 focus 後 RO 洗掉 scrollTop）
            if (_navAnchorLock) return;
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

    function renderWindow(anchorSegId, block, trigger) {
        if (!enabled || !cfg || _rendering) return;
        const scrollBlock = block === 'center' ? 'center' : 'start';
        const prevTrigger = _renderTrigger;
        _renderTrigger = trigger || (anchorSegId != null
            ? `renderWindow:${scrollBlock}`
            : 'renderWindow');
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
                setScrollTopDeferred(scrollEl, savedScrollTop, 'renderWindow:sameWindow');
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
            let anchorRowEl = null;
            if (explicitAnchor != null) {
                const sid = String(explicitAnchor).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                anchorRowEl = gridBody.querySelector(`.grid-data-row[data-seg-id="${sid}"]`);
            }
            _lastStartIdx = startIdx;
            _lastEndIdx = endIdx;

            const deferAfterRender = !!(explicitAnchor && scrollBlock === 'center');
            if (!deferAfterRender && typeof cfg.onAfterRender === 'function') {
                cfg.onAfterRender(startIdx, endIdx);
            }

            if (scrollEl) {
                let targetTop;
                if (explicitAnchor) {
                    if (scrollBlock === 'center') {
                        const center = computeCenterScrollTop(list, explicitAnchor, scrollEl, anchorRowEl);
                        targetTop = center.targetTop;
                        _anchorOffsetPx = center.anchorOffsetPx;
                        if (typeof localStorage !== 'undefined' && localStorage.getItem('catNavDebug') === '1') {
                            console.log('[catNav] explicit center diagnostic', {
                                phase: 'computeCenterScrollTop',
                                headerH: center.headerH,
                                targetTop: center.targetTop,
                                anchorRowFound: !!anchorRowEl,
                            });
                        }
                    } else {
                        targetTop = scrollTopFromAnchor(list, explicitAnchor, 0);
                        _anchorOffsetPx = 0;
                    }
                    _anchorSegId = explicitAnchor;
                } else {
                    targetTop = savedScrollTop;
                }
                if (explicitAnchor && scrollBlock === 'center') {
                    assignScrollTop(scrollEl, targetTop, 'setScrollTopDeferred', _renderTrigger, {
                        targetTop: Math.round(targetTop),
                    });
                    deferSuppress = true;
                    finishCenterAfterScroll(
                        scrollEl,
                        explicitAnchor,
                        anchorRowEl,
                        startIdx,
                        endIdx,
                        deferAfterRender,
                    );
                } else {
                    deferSuppress = true;
                    setScrollTopDeferred(scrollEl, targetTop, _renderTrigger);
                    if (deferAfterRender && typeof cfg.onAfterRender === 'function') {
                        cfg.onAfterRender(startIdx, endIdx);
                    }
                }
            }
            if (!deferAfterRender && typeof localStorage !== 'undefined' && localStorage.getItem('catNavDebug') === '1') {
                console.log('[catNav] explicit center diagnostic', {
                    phase: 'after renderWindow',
                    source: 'CatVirtGrid',
                    anchorSegId: explicitAnchor || _anchorSegId,
                    block: scrollBlock,
                    scrollTop: scrollEl ? scrollEl.scrollTop : null,
                    headerH: scrollBlock === 'center' && explicitAnchor ? getGridHeaderScrollOffset() : undefined,
                    anchorRowFound: !!(explicitAnchor && anchorRowEl),
                    lastStartIdx: _lastStartIdx,
                    lastEndIdx: _lastEndIdx,
                    navAnchorLock: _navAnchorLock,
                });
            }
        } finally {
            _rendering = false;
            _renderTrigger = prevTrigger;
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
            renderWindow(null, null, 'userScroll');
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
                assignScrollTop(cfg.scrollEl, cfg.savedScrollTop, 'mount', 'mount:restore', {
                    savedScrollTop: cfg.savedScrollTop,
                });
            }
        } finally {
            _suppressScroll = false;
        }
        renderWindow(null, null, 'mount');
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
        renderWindow(segId, block, `scrollToSegId:${scrollBlock}`);
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
        const { targetTop, anchorOffsetPx } = computeCenterScrollTop(list, segId, scrollEl);
        const nextStart = scrollTopToStartIdx(list, targetTop);
        const nextEnd = Math.min(list.length, nextStart + WINDOW + BUFFER * 2);
        if (nextStart !== _lastStartIdx || nextEnd !== _lastEndIdx) {
            return scrollToSegId(segId, 'center') != null;
        }
        _anchorSegId = String(segId);
        _anchorOffsetPx = anchorOffsetPx;
        assignScrollTop(scrollEl, targetTop, 'centerOnSegId', 'centerOnSegId:fastPath', {
            targetTop: Math.round(targetTop),
        });
        return true;
    }

    function invalidateHeights(anchorSegId, block) {
        if (!enabled) return;
        if (typeof localStorage !== 'undefined' && localStorage.getItem('catNavDebug') === '1') {
            console.log('[catNav] explicit center diagnostic', {
                phase: 'after ResizeObserver/invalidateHeights',
                source: 'CatVirtGrid',
                trigger: 'invalidateHeights',
                anchorSegId,
                block,
            });
        }
        rowHeights.clear();
        _restoreFromAnchor = false;
        _lastStartIdx = -1;
        _lastEndIdx = -1;
        // Phase R3：explicit nav 進行中保留 nav lock，避免 RO 連鎖釋放後 scrollTop 亂跳
        if (!_navAnchorLock) {
            releaseNavAnchorLock();
        }
        _navAnchorBlock = 'center';
        const list = getRenderableList();
        let passAnchor = anchorSegId;
        if (passAnchor != null && passAnchor !== '') {
            const ai = list.findIndex((s) => String(s.id) === String(passAnchor));
            if (ai < 0) passAnchor = null;
        }
        renderWindow(passAnchor != null ? passAnchor : null, block, 'invalidateHeights');
    }

    /** 量測單列 DOM 高度並更新 spacer（額外資訊展開／收合等顯示層變更用）。 */
    function remeasureSegHeight(segId) {
        if (!enabled || !cfg || !cfg.gridBody || segId == null) return false;
        const sid = String(segId);
        const esc = sid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const row = cfg.gridBody.querySelector(`.grid-data-row[data-seg-id="${esc}"]`);
        if (!row) return false;
        const h = Math.ceil(row.getBoundingClientRect().height);
        if (h > 0) rowHeights.set(sid, h);
        if (_lastStartIdx >= 0 && _lastEndIdx > _lastStartIdx) {
            updateSpacerHeights(getRenderableList(), _lastStartIdx, _lastEndIdx);
        }
        return true;
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
            navAnchorLockExplicitHold: _navAnchorLockExplicitHold,
            navAnchorBlock: _navAnchorBlock,
            lastStartIdx: _lastStartIdx,
            lastEndIdx: _lastEndIdx,
            lastNavScrollKey: _lastNavScrollKey,
            scrollWriteSeq: _catScrollWriteSeq,
        };
    }

    function resetScrollWriteSeq() {
        _catScrollWriteSeq = 0;
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
        nudgeCenterScroll: (segId) => {
            if (!cfg || !cfg.scrollEl || segId == null) return 0;
            return applyCenterScrollCorrection(segId, cfg.scrollEl);
        },
        invalidateHeights,
        remeasureSegHeight,
        releaseNavigationAnchor,
        cancelNavigationAnchor,
        getDebugState,
        resetScrollWriteSeq,
        holdNavAnchorLockForExplicitNav,
    };
})(typeof window !== 'undefined' ? window : globalThis);
