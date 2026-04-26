/**
 * 互斥群組單選：與「類別」多選下拉一致——選項在浮層內，底部為
 * `button.ai-multiselect-add-new-row`（「+ 新增群組」），不再使用原生 option 假選項。
 * 仍同步既有 select 的 options 與 .value，供既有流程讀寫。
 *
 * 未來其他單選「選清單＋尾端新增」可複用此模組（或仿照其 DOM／樣式契約）。
 */
(function (global) {
    function escAttr(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function labelForValue(selectEl, val) {
        for (var i = 0; i < selectEl.options.length; i++) {
            var o = selectEl.options[i];
            if (o.value === val) return (o.textContent || o.value || '').trim() || '無互斥群組';
        }
        return val ? String(val) : '無互斥群組';
    }

    /**
     * @param {HTMLSelectElement} selectEl
     * @param {{ onPickAddNew: () => (void|Promise<void>) }} opts
     * @returns {{ refresh: function(): void }}
     */
    function catMutexDropdownBind(selectEl, opts) {
        if (!selectEl || !opts || typeof opts.onPickAddNew !== 'function') {
            return { refresh: function () {} };
        }
        if (selectEl.dataset.catMutexDdBound === '1') {
            return selectEl._catMutexDdApi || { refresh: function () {} };
        }
        selectEl.dataset.catMutexDdBound = '1';
        var onPickAddNew = opts.onPickAddNew;
        var wrap = document.createElement('div');
        wrap.className = 'cat-mutex-dd-wrap';
        wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;min-width:140px;max-width:220px;';
        var parent = selectEl.parentNode;
        if (!parent) {
            return { refresh: function () {} };
        }
        parent.insertBefore(wrap, selectEl);
        var trigger = document.createElement('div');
        trigger.className = 'ai-multiselect-trigger cat-mutex-dd-trigger';
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');
        trigger.title = '點擊選擇互斥群組';
        var trigSpan = document.createElement('span');
        trigSpan.className = 'cat-mutex-dd-display';
        var trigArrow = document.createElement('span');
        trigArrow.style.cssText = 'font-size:0.7rem;color:#94a3b8;margin-left:0.25rem;';
        trigArrow.setAttribute('aria-hidden', 'true');
        trigArrow.textContent = '▼';
        trigger.appendChild(trigSpan);
        trigger.appendChild(trigArrow);
        var panel = document.createElement('div');
        panel.className = 'ai-multiselect-dropdown cat-mutex-dd-panel hidden';
        wrap.appendChild(trigger);
        wrap.appendChild(panel);
        wrap.appendChild(selectEl);
        selectEl.classList.add('cat-mutex-dd-native-hidden');
        var radioName = 'cat-mutex-' + (selectEl.id || ('u' + String(Math.random()).slice(2, 12)));

        function syncTriggerLabel() {
            var addv = global.CAT_SELECT_ADD_NEW_VALUE;
            var v = selectEl.value != null ? String(selectEl.value) : '';
            if (v === addv) v = '';
            trigSpan.textContent = v ? labelForValue(selectEl, v) : '無互斥群組';
        }

        function refreshPanel() {
            var ADD = global.CAT_SELECT_ADD_NEW_VALUE;
            var parts = [];
            var i;
            var o;
            var val;
            var chk;
            var lab;
            for (i = 0; i < selectEl.options.length; i++) {
                o = selectEl.options[i];
                if (o.value === ADD) continue;
                val = o.value;
                chk = (selectEl.value === val) ? ' checked' : '';
                lab = (o.textContent || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
                parts.push(
                    '<label class="ai-multiselect-option cat-mutex-dd-opt"><input type="radio" name="' +
                    escAttr(radioName) + '" value="' + escAttr(val) + '"' + chk + '> ' + lab + '</label>'
                );
            }
            panel.innerHTML = parts.join('') +
                '<button type="button" class="ai-multiselect-add-new-row" data-cat-mutex-add-new="1">+ 新增群組</button>';
            panel.querySelectorAll('input[type=radio]').forEach(function (inp) {
                inp.onchange = function () {
                    selectEl.value = inp.value;
                    selectEl.dataset.catSelectAddNewPrev = selectEl.value || '';
                    try {
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (_) { /* ignore */ }
                    syncTriggerLabel();
                    if (typeof global.catSetDropdownPanelOpen === 'function') {
                        global.catSetDropdownPanelOpen(trigger, panel, false);
                    } else {
                        panel.classList.add('hidden');
                    }
                };
            });
            var addBtn = panel.querySelector('[data-cat-mutex-add-new="1"]');
            if (addBtn) {
                addBtn.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    Promise.resolve(onPickAddNew()).then(
                        function () { refreshPanel(); },
                        function () {}
                    );
                };
            }
            syncTriggerLabel();
        }

        function onDocClick(e) {
            if (!panel.classList.contains('hidden') && !wrap.contains(e.target)) {
                if (typeof global.catSetDropdownPanelOpen === 'function') {
                    global.catSetDropdownPanelOpen(trigger, panel, false);
                } else {
                    panel.classList.add('hidden');
                }
            }
        }

        function onTriggerClick(e) {
            e.stopPropagation();
            var wasHidden = panel.classList.contains('hidden');
            if (wasHidden) {
                refreshPanel();
            }
            if (typeof global.catSetDropdownPanelOpen === 'function') {
                global.catSetDropdownPanelOpen(trigger, panel, wasHidden);
            } else {
                panel.classList.toggle('hidden');
                if (!panel.classList.contains('hidden')) {
                    refreshPanel();
                }
            }
        }

        trigger.addEventListener('click', onTriggerClick);
        document.addEventListener('click', onDocClick);

        var mo = new MutationObserver(function () {
            refreshPanel();
        });
        mo.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });

        refreshPanel();

        var api = {
            refresh: function () {
                refreshPanel();
            },
            dispose: function () {
                mo.disconnect();
                document.removeEventListener('click', onDocClick);
                trigger.removeEventListener('click', onTriggerClick);
                selectEl.classList.remove('cat-mutex-dd-native-hidden');
                selectEl.dataset.catMutexDdBound = '';
                delete selectEl._catMutexDdApi;
            }
        };
        selectEl._catMutexDdApi = api;
        return api;
    }

    global.catMutexDropdownBind = catMutexDropdownBind;
})(typeof window !== 'undefined' ? window : globalThis);
