/**
 * CAT 內嵌編輯器：暫存游標（假游標）記錄、捲動提示、還原焦點。
 * 由 app.js 以依賴注入建立實例；擴充請優先改本檔 API。
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

        function ensureFakeTipEl() {
            if (!fakeTipEl) {
                fakeTipEl = document.createElement('div');
                fakeTipEl.className = 'cat-fake-caret-scroll-tip hidden';
                fakeTipEl.setAttribute('role', 'status');
                document.body.appendChild(fakeTipEl);
            }
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
                document.body.appendChild(realTipEl);
            }
            return realTipEl;
        }

        function hideRealTip() {
            if (realTipEl) {
                realTipEl.classList.add('hidden');
                realTipEl.textContent = '';
            }
        }

        function showRealCaretTipIfNeeded() {
            const active = document.activeElement;
            if (!active || !active.classList.contains('grid-textarea')) {
                hideRealTip();
                return;
            }
            const editorGrid = document.getElementById('editorGrid');
            const gridRect = editorGrid ? editorGrid.getBoundingClientRect() : null;
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
            tip.textContent = `游標位於第 ${segNum} 號句段`;
            tip.classList.remove('hidden');
            const colTarget = document.querySelector('.col-target');
            const anchorLeft = colTarget ? colTarget.getBoundingClientRect().left : gridRect.left;
            tip.style.left = `${anchorLeft + 4}px`;
            tip.style.top = outAbove ? `${gridRect.top + 4}px` : `${gridRect.bottom - 36}px`;
            tip.style.maxWidth = `${Math.max(120, gridRect.right - anchorLeft - 8)}px`;
        }

        function ensureFakeEl() {
            if (!fakeEl) {
                fakeEl = document.createElement('div');
                fakeEl.className = 'cat-fake-caret hidden';
                fakeEl.setAttribute('aria-hidden', 'true');
                document.body.appendChild(fakeEl);
            }
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
            const editorGrid = document.getElementById('editorGrid');
            const gridRect = editorGrid ? editorGrid.getBoundingClientRect() : null;

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
                    tip.textContent = `暫存游標位於第 ${segNum} 號句段（點此或按 Ctrl+Alt+↓ 前往）`;
                    tip.classList.remove('hidden');
                    tip.style.cursor = 'pointer';
                    if (!tip.dataset.catFakeTipClickBound) {
                        tip.dataset.catFakeTipClickBound = '1';
                        tip.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            restoreOrShowFake();
                        });
                    }
                    const colTarget = document.querySelector('.col-target');
                    const anchorLeft = colTarget ? colTarget.getBoundingClientRect().left : gridRect.left;
                    tip.style.left = `${anchorLeft + 4}px`;
                    tip.style.top = outAbove ? `${gridRect.top + 4}px` : `${gridRect.bottom - 36}px`;
                    tip.style.maxWidth = `${Math.max(120, gridRect.right - anchorLeft - 8)}px`;
                    return;
                }
            }
            tip.classList.add('hidden');
            let left = rect.left;
            let top = rect.top;
            if (gridRect) {
                left = Math.min(Math.max(left, gridRect.left + 1), gridRect.right - 3);
                top = Math.min(Math.max(top, gridRect.top + 1), gridRect.bottom - h - 1);
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
