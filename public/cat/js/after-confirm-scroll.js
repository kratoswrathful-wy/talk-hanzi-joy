/**
 * 確認跳行後的捲動策略：置中保留；底部模式為倒數第 N 個可見句段列（預設 3）。
 * 掛 window.CatAfterConfirmScroll，供設定與虛擬捲動共用純函式。
 */
(function (global) {
    'use strict';

    var SCROLL_BLOCK_KEY = 'catToolAfterConfirmScrollBlock';
    var BOTTOM_N_KEY = 'catToolAfterConfirmScrollBottomN';
    var DEFAULT_N = 3;

    function parseBottomN(raw) {
        if (raw == null || raw === '') return DEFAULT_N;
        if (typeof raw === 'number') {
            if (!Number.isInteger(raw) || raw < 1) return DEFAULT_N;
            return raw;
        }
        var s = String(raw).trim();
        if (!/^[1-9]\d*$/.test(s)) return DEFAULT_N;
        return parseInt(s, 10);
    }

    function getScrollBlock() {
        try {
            var v = global.localStorage && global.localStorage.getItem(SCROLL_BLOCK_KEY);
            return v === 'nearest' ? 'nearest' : 'center';
        } catch (_) {
            return 'center';
        }
    }

    function getBottomN() {
        try {
            var raw = global.localStorage && global.localStorage.getItem(BOTTOM_N_KEY);
            return parseBottomN(raw);
        } catch (_) {
            return DEFAULT_N;
        }
    }

    function virtScrollBlockFromPending(block) {
        if (block === 'center') return 'center';
        if (block === 'nearest' || block === 'end') return 'nearest';
        return 'center';
    }

    /**
     * 以實際列高把目標列放到視窗倒數第 N 列附近。
     * heights 為 segId → px；list 為目前可見清單（已篩選）。
     */
    function computeNearestTargetTop(input) {
        var list = (input && input.list) || [];
        var segId = input && input.segId;
        var viewportHeight = (input && input.viewportHeight) || 0;
        var headerH = (input && input.headerH) || 0;
        var heights = (input && input.heights) || {};
        var n = parseBottomN(input && input.n);
        var ai = list.findIndex(function (s) { return s && String(s.id) === String(segId); });
        if (ai < 0) {
            return { targetTop: 0, reserved: 0, n: n, skip: false, reachable: false };
        }
        function hOf(id) {
            var h = heights[String(id)];
            return typeof h === 'number' && h > 0 ? h : 0;
        }
        var reserved = 0;
        var count = 0;
        var i;
        for (i = ai + 1; i < list.length && count < n - 1; i++) {
            reserved += hOf(list[i].id);
            count++;
        }
        var h = hOf(list[ai].id);
        var absTop = headerH;
        for (i = 0; i < ai; i++) absTop += hOf(list[i].id);
        var offsetFromViewportTop = Math.max(0, viewportHeight - reserved - h);
        var targetTop = Math.max(0, absTop - offsetFromViewportTop);
        return {
            targetTop: targetTop,
            reserved: reserved,
            n: n,
            skip: false,
            reachable: true,
            offsetFromViewportTop: offsetFromViewportTop,
            rowHeight: h
        };
    }

    /** 目標已在保留區以上且可見時不必捲；進入底部保留區才定位。 */
    function shouldScrollToNearest(input) {
        var currentTop = (input && input.currentScrollTop) || 0;
        var computed = computeNearestTargetTop(input);
        if (!computed.reachable) return { shouldScroll: false, computed: computed };
        var rowBottom = (input && input.rowBottomInViewport);
        var viewportBottom = (input && input.viewportBottom);
        if (typeof rowBottom === 'number' && typeof viewportBottom === 'number') {
            var reserveLine = viewportBottom - computed.reserved;
            if (rowBottom <= reserveLine - 4 && (input.rowTopInViewport == null || input.rowTopInViewport >= 0)) {
                return { shouldScroll: false, computed: computed };
            }
        }
        var delta = Math.abs(computed.targetTop - currentTop);
        return { shouldScroll: delta > 8, computed: computed };
    }

    global.CatAfterConfirmScroll = {
        SCROLL_BLOCK_KEY: SCROLL_BLOCK_KEY,
        BOTTOM_N_KEY: BOTTOM_N_KEY,
        DEFAULT_N: DEFAULT_N,
        parseBottomN: parseBottomN,
        getScrollBlock: getScrollBlock,
        getBottomN: getBottomN,
        virtScrollBlockFromPending: virtScrollBlockFromPending,
        computeNearestTargetTop: computeNearestTargetTop,
        shouldScrollToNearest: shouldScrollToNearest
    };
})(typeof window !== 'undefined' ? window : globalThis);
