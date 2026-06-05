/**
 * CAT 內嵌編輯器：暫存游標（假游標）記錄、捲動提示、還原焦點。
 * 假游標／提示掛載於 #editorGrid 內 #catEditorChromeLayer（見 docs/CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md）。
 */
(function (global) {
    'use strict';

    /**
     * @typedef {Object} CatFakeCaretDeps
     * @property {(segId: *) => string} getSegDisplayIndex 句段顯示編號（提示用）
     * @property {() => HTMLElement | null} getEditorFromSelection
     * @property {(editorEl: HTMLElement) => *} getEditorSegId
     */

    /**
     * @param {CatFakeCaretDeps} deps
     */
    function create(deps) {
        const getSegDisplayIndex = deps.getSegDisplayIndex;
        const getEditorFromSelection = deps.getEditorFromSelection;
        const getEditorSegId = deps.getEditorSegId;

        /** @type {{ segId: *, editor: HTMLElement, range: Range } | null} */
        let saved = null;

        let fakeEl = null;
        let fakeTipEl = null;
        let realTipEl = null;
        let listenersInstalled = false;

        function getEditorGridEl() {
            return document.getElementById('editorGrid');
        }

        function getEditorGridRect() {
            const editorGrid = getEditorGridEl();
            return editorGrid ? editorGrid.getBoundingClientRect() : null;
        }

        /** @returns {HTMLElement | null} */
        function ensureEditorChromeLayer() {
            const editorGrid = getEditorGridEl();
            if (!editorGrid) return null;
            let layer = document.getElementById('catEditorChromeLayer');
            if (!layer) {
                layer = document.createElement('div');
                layer.id = 'catEditorChromeLayer';
                layer.className = 'cat-editor-chrome-layer';
                layer.setAttribute('aria-hidden', 'true');
                const gridBody = document.getElementById('gridBody');
                if (gridBody && gridBody.parentNode === editorGrid) {
                    editorGrid.insertBefore(layer, gridBody);
                } else {
                    editorGrid.appendChild(layer);
                }
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

        function findRowAndEditorForSegId(segId) {
            if (segId == null || segId === '') return { row: null, editor: null };
            const row = document.querySelector(`.grid-data-row[data-seg-id="${CSS.escape(String(segId))}"]`);
            if (!row) return { row: null, editor: null };
            const editor = row.querySelector('.grid-textarea');
            if (!editor || editor.contentEditable === 'false') return { row: null, editor: null };
            return { row, editor };
        }

        /** 真／假游標提示共用：捲至句段列、聚焦譯文格、還原暫存 Range（若有）。 */
        function navigateToSegmentBySegId(segId) {
            const { row, editor } = findRowAndEditorForSegId(segId);
            if (!editor) return false;

            const active = document.activeElement;
            if (active === editor) {
                saveFromSelection(editor);
            }

            if (saved && saved.editor === editor && String(saved.segId) === String(segId) && saved.range) {
                const result = restore();
                hideRealTip();
                return result !== null;
            }

            if (row && typeof row.scrollIntoView === 'function') {
                try {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (_) { /* ignore */ }
            }
            try {
                editor.focus();
            } catch (_) {
                hideRealTip();
                return false;
            }

            if (saved && saved.editor === editor && saved.range) {
                try {
                    const range = saved.range.cloneRange();
                    const sel = window.getSelection();
                    if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                } catch (_) { /* ignore */ }
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
            const gridRect = getEditorGridRect();
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
            if (!saved || !saved.editor || !saved.range) return;
            const editor = saved.editor;
            if (!document.body.contains(editor) || editor.contentEditable === 'false') return;
            if (document.activeElement === editor) {
                hide();
                return;
            }
            const gridRect = getEditorGridRect();

            let rect = null;
            try { rect = getRectForRange(saved.range); } catch (_) { rect = null; }
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
                    positionScrollTipInLayer(tip, anchorLeft, gridRect, outAbove);
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
            saved = {
                segId: getEditorSegId(editor),
                editor,
                range: range.cloneRange()
            };
            return true;
        }

        function restore() {
            if (!saved || !saved.editor || !saved.range) return null;
            const editor = saved.editor;
            if (!document.body.contains(editor) || editor.contentEditable === 'false') return null;
            const row = editor.closest ? editor.closest('.grid-data-row') : null;
            if (row && typeof row.scrollIntoView === 'function') {
                try {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (_) { /* ignore */ }
            }
            editor.focus();
            try {
                const range = saved.range.cloneRange();
                const sel = window.getSelection();
                if (!sel) return null;
                sel.removeAllRanges();
                sel.addRange(range);
                hide();
                return editor;
            } catch (_) {
                try {
                    if (row && typeof row.scrollIntoView === 'function') {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            saved = {
                segId: payload.segId != null ? payload.segId : getEditorSegId(payload.editor),
                editor: payload.editor,
                range: payload.range.cloneRange ? payload.range.cloneRange() : payload.range
            };
        }

        function getSaved() {
            return saved;
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
            window.addEventListener('scroll', show, true);
            window.addEventListener('resize', show);
            const editorGrid = getEditorGridEl();
            if (editorGrid) {
                editorGrid.addEventListener('scroll', show, { passive: true });
            }
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
            getSaved
        };
    }

    global.CatFakeCaret = { create };
})(typeof window !== 'undefined' ? window : globalThis);
