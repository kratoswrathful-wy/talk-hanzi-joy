/**
 * CAT 內嵌編輯器：暫存游標（假游標）記錄、捲動提示、還原焦點。
 * Phase 2.3h：#catEditorChromeLayer 改 position:fixed 掛 body，syncChromeLayerRect 釘在 #editorGrid 可視區。
 */
(function (global) {
    'use strict';

    /**
     * @typedef {Object} CatFakeCaretDeps
     * @property {(segId: *) => string} getSegDisplayIndex
     * @property {() => HTMLElement | null} getEditorFromSelection
     * @property {(editorEl: HTMLElement) => *} getEditorSegId
     * @property {(editor: HTMLElement) => number|null} [getPlainCaretOffset]
     * @property {(editor: HTMLElement, offset: number) => Range|null} [buildRangeAtPlainOffset]
     * @property {(segId: *, opts?: { scroll?: boolean }) => { row: HTMLElement|null, editor: HTMLElement|null }} [ensureEditorMountedForSegId]
     * @property {(segId: *) => number|null} [getSegListIndex]
     * @property {() => number|null} [getVirtWindowStartIndex]
     * @property {(segId: *, plainOffset: number|null) => boolean} [scheduleEditorFocusForSaved]
     */

    /**
     * @param {CatFakeCaretDeps} deps
     */
    function create(deps) {
        const getSegDisplayIndex = deps.getSegDisplayIndex;
        const getEditorFromSelection = deps.getEditorFromSelection;
        const getEditorSegId = deps.getEditorSegId;
        const getPlainCaretOffset = deps.getPlainCaretOffset || null;
        const buildRangeAtPlainOffset = deps.buildRangeAtPlainOffset || null;
        const ensureEditorMountedForSegId = deps.ensureEditorMountedForSegId || null;
        const getSegListIndex = deps.getSegListIndex || null;
        const getVirtWindowStartIndex = deps.getVirtWindowStartIndex || null;
        const scheduleEditorFocusForSaved = deps.scheduleEditorFocusForSaved || null;

        /** @type {{ segId: *, plainOffset: number|null, editor: HTMLElement|null, range: Range|null } | null} */
        let saved = null;

        let fakeEl = null;
        let fakeTipEl = null;
        let realTipEl = null;
        let listenersInstalled = false;
        let chromeResizeObserver = null;

        function getEditorGridEl() {
            return document.getElementById('editorGrid');
        }

        function isEditorGridVisible() {
            const editorGrid = getEditorGridEl();
            if (!editorGrid) return false;
            const ve = document.getElementById('viewEditor');
            if (ve && ve.classList.contains('hidden')) return false;
            const rect = editorGrid.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        /** Phase 2.3h：以 editorGrid 視窗矩形同步 fixed 覆蓋層。 */
        function syncChromeLayerRect() {
            let layer = document.getElementById('catEditorChromeLayer');
            if (!layer) layer = ensureEditorChromeLayer();
            if (!layer) return false;
            if (!isEditorGridVisible()) {
                layer.style.display = 'none';
                return false;
            }
            const rect = getEditorGridEl().getBoundingClientRect();
            layer.style.display = '';
            layer.style.left = `${rect.left}px`;
            layer.style.top = `${rect.top}px`;
            layer.style.width = `${rect.width}px`;
            layer.style.height = `${rect.height}px`;
            return true;
        }

        function observeEditorGridResize() {
            if (chromeResizeObserver) return;
            const editorGrid = getEditorGridEl();
            if (!editorGrid || typeof ResizeObserver === 'undefined') return;
            chromeResizeObserver = new ResizeObserver(() => {
                if (syncChromeLayerRect()) repaintChromeOverlays();
            });
            chromeResizeObserver.observe(editorGrid);
        }

        function repaintChromeOverlays() {
            const active = document.activeElement;
            if (active && active.classList && active.classList.contains('grid-textarea')) {
                const activeSegId = getEditorSegId(active);
                if (saved && saved.segId != null && activeSegId != null
                    && String(activeSegId) === String(saved.segId)) {
                    showRealCaretTipIfNeeded();
                    hide();
                    return;
                }
                showRealCaretTipIfNeeded();
                return;
            }
            show();
        }

        /** Phase 2.3k：以 list 索引判斷離屏 tip 貼頂（above）或貼底（below）。 */
        function resolveOffScreenDirection(segId) {
            const sid = segId != null ? segId : (saved && saved.segId);
            if (sid == null) return 'above';
            if (typeof getSegListIndex !== 'function') return 'above';
            const listIdx = getSegListIndex(sid);
            if (listIdx == null) return 'above';
            let windowStart = null;
            if (typeof getVirtWindowStartIndex === 'function') {
                windowStart = getVirtWindowStartIndex();
            }
            if (windowStart == null || windowStart < 0) {
                const vg = global.CatVirtGrid;
                if (vg && typeof vg.getAnchorSegId === 'function' && typeof getSegListIndex === 'function') {
                    const anchorId = vg.getAnchorSegId();
                    if (anchorId != null) {
                        const anchorIdx = getSegListIndex(anchorId);
                        if (anchorIdx != null) windowStart = anchorIdx;
                    }
                }
            }
            if (windowStart == null || windowStart < 0) return 'above';
            return listIdx < windowStart ? 'above' : 'below';
        }

        function resolveOffScreenTipAbove(segId) {
            return resolveOffScreenDirection(segId) === 'above';
        }

        function onScrollOrResize() {
            if (!syncChromeLayerRect()) return;
            repaintChromeOverlays();
        }

        function getEditorGridRect() {
            if (!syncChromeLayerRect()) return null;
            const editorGrid = getEditorGridEl();
            return editorGrid ? editorGrid.getBoundingClientRect() : null;
        }

        /** @returns {HTMLElement | null} */
        function ensureEditorChromeLayer() {
            let layer = document.getElementById('catEditorChromeLayer');
            if (!layer) {
                layer = document.createElement('div');
                layer.id = 'catEditorChromeLayer';
                layer.className = 'cat-editor-chrome-layer';
                layer.setAttribute('aria-hidden', 'true');
                document.body.appendChild(layer);
                observeEditorGridResize();
            } else if (layer.parentNode !== document.body) {
                document.body.appendChild(layer);
                observeEditorGridResize();
            }
            return layer;
        }

        function appendToChromeLayer(el) {
            const layer = ensureEditorChromeLayer();
            if (!layer) {
                document.body.appendChild(el);
                return;
            }
            if (el.parentNode !== layer) {
                layer.appendChild(el);
            }
        }

        function positionScrollTipInLayer(tip, anchorLeftClient, gridRect, outAbove) {
            if (!gridRect) return;
            const left = anchorLeftClient - gridRect.left + 4;
            const maxW = Math.max(120, gridRect.right - anchorLeftClient - 8);
            tip.style.left = `${Math.max(0, left)}px`;
            tip.style.maxWidth = `${maxW}px`;
            if (outAbove) {
                tip.style.top = '4px';
                tip.style.bottom = '';
            } else {
                tip.style.top = '';
                tip.style.bottom = '4px';
            }
        }

        function ensureFakeTipEl() {
            if (!fakeTipEl) {
                fakeTipEl = document.createElement('div');
                fakeTipEl.className = 'cat-fake-caret-scroll-tip hidden';
                fakeTipEl.setAttribute('role', 'status');
            }
            appendToChromeLayer(fakeTipEl);
            return fakeTipEl;
        }

        function hideFakeTip() {
            if (fakeTipEl) {
                fakeTipEl.classList.add('hidden');
                fakeTipEl.textContent = '';
            }
        }

        function ensureRealTipEl() {
            if (!realTipEl) {
                realTipEl = document.createElement('div');
                realTipEl.className = 'cat-fake-caret-scroll-tip hidden';
                realTipEl.setAttribute('role', 'status');
            }
            appendToChromeLayer(realTipEl);
            return realTipEl;
        }

        function hideRealTip() {
            if (realTipEl) {
                realTipEl.classList.add('hidden');
                realTipEl.textContent = '';
            }
        }

        /** 列未掛載時：listIdx < windowStart → 提示貼頂，否則貼底（Phase 2.3c／2.3k）。 */

        /** @param {{ scroll?: boolean }} [opts] scroll 預設 true（使用者導覽）；false 為被動重畫。 */
        function findRowAndEditorForSegId(segId, opts) {
            if (segId == null || segId === '') return { row: null, editor: null };
            if (ensureEditorMountedForSegId) {
                return ensureEditorMountedForSegId(segId, opts);
            }
            const row = document.querySelector(`.grid-data-row[data-seg-id="${CSS.escape(String(segId))}"]`);
            if (!row) return { row: null, editor: null };
            const editor = row.querySelector('.grid-textarea');
            if (!editor || editor.contentEditable === 'false') return { row: null, editor: null };
            return { row, editor };
        }

        function rebuildRangeForSaved(editor) {
            if (!editor || editor.contentEditable === 'false') return null;
            if (saved && saved.plainOffset != null && buildRangeAtPlainOffset) {
                const r = buildRangeAtPlainOffset(editor, saved.plainOffset);
                if (r) return r;
            }
            if (saved && saved.range) {
                try {
                    if (saved.editor === editor && document.body.contains(saved.editor)) {
                        return saved.range.cloneRange();
                    }
                } catch (_) { /* ignore */ }
            }
            try {
                const r = document.createRange();
                r.selectNodeContents(editor);
                r.collapse(false);
                return r;
            } catch (_) {
                return null;
            }
        }

        function syncSavedEditorRef(editor) {
            if (!saved || !editor) return;
            saved.editor = editor;
            const r = rebuildRangeForSaved(editor);
            if (r) saved.range = r;
        }

        /** @param {{ scroll?: boolean }} [opts] */
        function resolveSavedEditor(opts) {
            if (!saved || saved.segId == null) return { row: null, editor: null };
            const { row, editor } = findRowAndEditorForSegId(saved.segId, opts);
            if (editor) syncSavedEditorRef(editor);
            return { row, editor };
        }

        function showOffScreenFakeTip(outAbove) {
            if (!syncChromeLayerRect()) return;
            const gridRect = getEditorGridEl() ? getEditorGridEl().getBoundingClientRect() : null;
            if (!gridRect || saved.segId == null) return;
            const segNum = getSegDisplayIndex(saved.segId);
            const mark = ensureFakeEl();
            const tip = ensureFakeTipEl();
            mark.classList.add('hidden');
            tip.textContent = `暫存游標位於第 ${segNum} 號句段（點此或按 Ctrl+Alt+↓ 捲至該列）`;
            tip.classList.remove('hidden');
            tip.style.pointerEvents = 'auto';
            bindFakeTipNavigation(tip);
            const colTarget = document.querySelector('.col-target');
            const anchorLeft = colTarget ? colTarget.getBoundingClientRect().left : gridRect.left;
            const dir = typeof outAbove === 'boolean' ? outAbove : (resolveOffScreenDirection(saved.segId) === 'above');
            positionScrollTipInLayer(tip, anchorLeft, gridRect, dir);
        }

        /** 真／假游標提示共用：捲至句段列、聚焦譯文格、還原暫存 Range（若有）。 */
        function navigateToSegmentBySegId(segId) {
            const active = document.activeElement;
            if (active && active.classList && active.classList.contains('grid-textarea')) {
                saveFromSelection(active);
            }

            if (saved && String(saved.segId) === String(segId)) {
                const result = restore();
                hideRealTip();
                return result != null;
            }

            if (scheduleEditorFocusForSaved) {
                const ok = scheduleEditorFocusForSaved(segId, null);
                hide();
                hideRealTip();
                return ok;
            }

            const { row, editor } = findRowAndEditorForSegId(segId, { scroll: true });
            if (!editor) return false;
            if (row && typeof row.scrollIntoView === 'function') {
                try {
                    row.scrollIntoView({ behavior: 'auto', block: 'center' });
                } catch (_) { /* ignore */ }
            }
            try {
                editor.focus();
            } catch (_) {
                hideRealTip();
                return false;
            }
            hide();
            hideRealTip();
            return true;
        }

        function bindRealTipNavigation(tip) {
            if (tip.dataset.catRealTipNavBound) return;
            tip.dataset.catRealTipNavBound = '1';
            tip.style.cursor = 'pointer';
            tip.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const storedSegId = tip.dataset.catRealTipSegId;
                if (storedSegId) navigateToSegmentBySegId(storedSegId);
            });
        }

        function bindFakeTipNavigation(tip) {
            if (tip.dataset.catFakeTipNavBound) return;
            tip.dataset.catFakeTipNavBound = '1';
            tip.style.cursor = 'pointer';
            tip.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const sid = saved && saved.segId != null ? saved.segId : null;
                if (sid != null && navigateToSegmentBySegId(sid)) return;
                requestAnimationFrame(() => {
                    if (!restore()) show();
                });
            });
        }

        function showRealCaretTipIfNeeded() {
            const active = document.activeElement;
            if (!active || !active.classList.contains('grid-textarea')) {
                hideRealTip();
                return;
            }
            if (!syncChromeLayerRect()) { hideRealTip(); return; }
            const gridRect = getEditorGridEl() ? getEditorGridEl().getBoundingClientRect() : null;
            if (!gridRect) { hideRealTip(); return; }
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) { hideRealTip(); return; }
            let caretRect = null;
            try {
                const r = sel.getRangeAt(0);
                const rects = r.getClientRects ? Array.from(r.getClientRects()) : [];
                caretRect = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
            } catch (_) { hideRealTip(); return; }
            if (!caretRect || (!caretRect.width && !caretRect.height)) {
                const edRect = active.getBoundingClientRect();
                const st = getComputedStyle(active);
                caretRect = { left: edRect.left + (parseFloat(st.paddingLeft) || 8), top: edRect.top + (parseFloat(st.paddingTop) || 4), height: 16 };
            }
            const outAbove = (caretRect.top + (caretRect.height || 0)) < gridRect.top;
            const outBelow = caretRect.top > gridRect.bottom;
            if (!outAbove && !outBelow) { hideRealTip(); return; }
            const segId = getEditorSegId(active);
            const segNum = getSegDisplayIndex(segId);
            const tip = ensureRealTipEl();
            tip.textContent = `游標位於第 ${segNum} 號句段（點此或按 Ctrl+Alt+↓ 捲至該列）`;
            tip.dataset.catRealTipSegId = String(segId ?? '');
            tip.classList.remove('hidden');
            tip.style.pointerEvents = 'auto';
            const colTarget = document.querySelector('.col-target');
            const anchorLeft = colTarget ? colTarget.getBoundingClientRect().left : gridRect.left;
            positionScrollTipInLayer(tip, anchorLeft, gridRect, outAbove);
            bindRealTipNavigation(tip);
        }

        function ensureFakeEl() {
            if (!fakeEl) {
                fakeEl = document.createElement('div');
                fakeEl.className = 'cat-fake-caret hidden';
                fakeEl.setAttribute('aria-hidden', 'true');
            }
            appendToChromeLayer(fakeEl);
            return fakeEl;
        }

        function hide() {
            if (fakeEl) fakeEl.classList.add('hidden');
            hideFakeTip();
        }

        function getRectForRange(range) {
            if (!range) return null;
            const rects = range.getClientRects ? Array.from(range.getClientRects()) : [];
            if (rects.length) return rects[rects.length - 1];
            const rect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
            if (rect && (rect.width || rect.height)) return rect;
            return null;
        }

        function show() {
            if (!saved || saved.segId == null) return;
            if (!syncChromeLayerRect()) return;
            const passiveOpts = { scroll: false };
            const { row, editor } = resolveSavedEditor(passiveOpts);
            if (!row || !editor || editor.contentEditable === 'false') {
                showOffScreenFakeTip(resolveOffScreenTipAbove(saved.segId));
                return;
            }
            if (document.activeElement === editor) {
                hide();
                return;
            }
            const gridRect = getEditorGridEl() ? getEditorGridEl().getBoundingClientRect() : null;
            const range = rebuildRangeForSaved(editor);

            let rect = null;
            try { rect = getRectForRange(range); } catch (_) { rect = null; }
            if (!rect || (rect.width === 0 && rect.height === 0)) {
                const edRect = editor.getBoundingClientRect();
                const st = getComputedStyle(editor);
                const pl = parseFloat(st.paddingLeft) || 8;
                const pt = parseFloat(st.paddingTop) || 4;
                const h0 = Math.max(14, Math.min(28, edRect.height - pt * 2));
                rect = { left: edRect.left + pl, top: edRect.top + pt, width: 2, height: h0 };
            }
            const h = Math.max(14, Math.min(28, rect.height || 18));
            const mark = ensureFakeEl();
            const segNum = getSegDisplayIndex(saved.segId);
            const tip = ensureFakeTipEl();

            if (gridRect) {
                const trueTop = rect.top;
                const trueBottom = rect.top + h;
                const outAbove = trueBottom < gridRect.top;
                const outBelow = trueTop > gridRect.bottom;
                if (outAbove || outBelow) {
                    mark.classList.add('hidden');
                    tip.textContent = `暫存游標位於第 ${segNum} 號句段（點此或按 Ctrl+Alt+↓ 捲至該列）`;
                    tip.classList.remove('hidden');
                    tip.style.pointerEvents = 'auto';
                    bindFakeTipNavigation(tip);
                    const colTarget = document.querySelector('.col-target');
                    const anchorLeft = colTarget ? colTarget.getBoundingClientRect().left : gridRect.left;
                    const dirAbove = resolveOffScreenDirection(saved.segId) === 'above';
                    positionScrollTipInLayer(tip, anchorLeft, gridRect, dirAbove);
                    return;
                }
            }
            tip.classList.add('hidden');
            let left = rect.left;
            let top = rect.top;
            if (gridRect) {
                left = left - gridRect.left;
                top = top - gridRect.top;
                const gw = gridRect.width;
                const gh = gridRect.height;
                left = Math.min(Math.max(left, 1), gw - 3);
                top = Math.min(Math.max(top, 1), gh - h - 1);
            }
            mark.style.left = `${left}px`;
            mark.style.top = `${top}px`;
            mark.style.height = `${h}px`;
            mark.classList.remove('hidden');
        }

        function saveFromSelection(editorEl) {
            const editor = editorEl || getEditorFromSelection();
            const sel = window.getSelection();
            if (!editor || !sel || sel.rangeCount === 0 || editor.contentEditable === 'false') return false;
            const range = sel.getRangeAt(0);
            if (!editor.contains(range.commonAncestorContainer)) return false;
            let plainOffset = null;
            if (getPlainCaretOffset) {
                try { plainOffset = getPlainCaretOffset(editor); } catch (_) { plainOffset = null; }
            }
            saved = {
                segId: getEditorSegId(editor),
                plainOffset,
                editor,
                range: range.cloneRange()
            };
            return true;
        }

        function restore() {
            if (!saved || saved.segId == null) return null;
            if (scheduleEditorFocusForSaved) {
                const ok = scheduleEditorFocusForSaved(saved.segId, saved.plainOffset);
                if (ok) hide();
                return ok ? saved : null;
            }
            const { row, editor } = resolveSavedEditor({ scroll: true });
            if (!editor || editor.contentEditable === 'false') return null;
            if (row && typeof row.scrollIntoView === 'function') {
                try {
                    row.scrollIntoView({ behavior: 'auto', block: 'center' });
                } catch (_) { /* ignore */ }
            }
            editor.focus();
            try {
                const range = rebuildRangeForSaved(editor);
                if (!range) return null;
                const sel = window.getSelection();
                if (!sel) return null;
                sel.removeAllRanges();
                sel.addRange(range);
                saved.range = range.cloneRange();
                saved.editor = editor;
                hide();
                return editor;
            } catch (_) {
                try {
                    if (row && typeof row.scrollIntoView === 'function') {
                        row.scrollIntoView({ behavior: 'auto', block: 'center' });
                    }
                    editor.focus();
                } catch (_) { /* ignore */ }
                return null;
            }
        }

        function clear() {
            saved = null;
            if (fakeEl) fakeEl.classList.add('hidden');
            if (fakeTipEl) {
                fakeTipEl.classList.add('hidden');
                fakeTipEl.textContent = '';
            }
            if (realTipEl) {
                realTipEl.classList.add('hidden');
                realTipEl.textContent = '';
            }
        }

        function restoreOrShowFake() {
            requestAnimationFrame(() => {
                const sid = saved && saved.segId != null ? saved.segId : null;
                if (sid != null && navigateToSegmentBySegId(sid)) return;
                if (!restore()) show();
            });
        }

        function setSavedCaret(payload) {
            if (!payload || !payload.editor || !payload.range) return;
            let plainOffset = payload.plainOffset != null ? payload.plainOffset : null;
            if (plainOffset == null && getPlainCaretOffset) {
                try { plainOffset = getPlainCaretOffset(payload.editor); } catch (_) { plainOffset = null; }
            }
            saved = {
                segId: payload.segId != null ? payload.segId : getEditorSegId(payload.editor),
                plainOffset,
                editor: payload.editor,
                range: payload.range.cloneRange ? payload.range.cloneRange() : payload.range
            };
        }

        function getSaved() {
            return saved;
        }

        function isSavedSegMountedInWindow() {
            if (!saved || saved.segId == null) return false;
            const { row, editor } = findRowAndEditorForSegId(saved.segId, { scroll: false });
            return !!(row && editor);
        }

        function refreshAfterVirtRender() {
            if (!saved || saved.segId == null) return;
            if (!syncChromeLayerRect()) return;
            // Phase 2.3q Layer C：如果 nav pipeline 正在導覽此句段，先 defer 不 show 假游標。
            const navState = window.__catNavState;
            if (navState && typeof navState.hasPendingEditorFocusForSeg === 'function'
                && navState.hasPendingEditorFocusForSeg(saved.segId)) {
                return;
            }
            const active = document.activeElement;
            if (active && active.classList && active.classList.contains('grid-textarea')) {
                const activeSegId = getEditorSegId(active);
                if (activeSegId != null && String(activeSegId) === String(saved.segId)) {
                    hide();
                    showRealCaretTipIfNeeded();
                    return;
                }
            }
            if (!isSavedSegMountedInWindow()) {
                showOffScreenFakeTip();
                return;
            }
            show();
        }

        function onSelectionChange() {
            const editor = getEditorFromSelection();
            if (editor && editor.contentEditable !== 'false' && document.activeElement === editor) {
                saveFromSelection(editor);
                hide();
            }
        }

        function installGlobalListeners() {
            if (listenersInstalled) return;
            listenersInstalled = true;
            document.addEventListener('selectionchange', onSelectionChange);
            window.addEventListener('scroll', onScrollOrResize, true);
            window.addEventListener('resize', onScrollOrResize);
            const editorGrid = getEditorGridEl();
            if (editorGrid) {
                editorGrid.addEventListener('scroll', onScrollOrResize, { passive: true });
            }
            observeEditorGridResize();
        }

        return {
            saveFromSelection,
            show,
            hide,
            restore,
            clear,
            restoreOrShowFake,
            showRealCaretTipIfNeeded,
            hideRealCaretTip: hideRealTip,
            installGlobalListeners,
            setSavedCaret,
            getSaved,
            refreshAfterVirtRender,
            syncChromeLayerRect
        };
    }

    global.CatFakeCaret = { create };
})(typeof window !== 'undefined' ? window : globalThis);
