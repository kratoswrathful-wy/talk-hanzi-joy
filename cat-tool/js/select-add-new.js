/**
 * 全系統共用的原生 <select>「尾端新增一筆」行為。
 * 在選單末 append 固定 sentinel option；使用者選取時還原上一個值並觸發 onPickAddNew（可 async）。
 * 各畫面在重建 option 後須呼叫 catSelectAppendAddNewOption 以維持「新增…」列在末端。
 */
(function (global) {
    var CAT_SELECT_ADD_NEW_VALUE = '__CAT_UI_ADD_NEW__';

    function catSelectRemoveAddNewOption(selectEl) {
        if (!selectEl || !selectEl.options) return;
        for (var i = selectEl.options.length - 1; i >= 0; i--) {
            if (selectEl.options[i].value === CAT_SELECT_ADD_NEW_VALUE) {
                selectEl.remove(i);
            }
        }
    }

    /**
     * @param {HTMLSelectElement} selectEl
     * @param {string} [label] 顯示文字，預設「新增…」
     */
    function catSelectAppendAddNewOption(selectEl, label) {
        if (!selectEl) return;
        catSelectRemoveAddNewOption(selectEl);
        var opt = document.createElement('option');
        opt.value = CAT_SELECT_ADD_NEW_VALUE;
        opt.textContent = label != null ? String(label) : '新增…';
        opt.setAttribute('data-cat-select-add-new', '1');
        selectEl.appendChild(opt);
    }

    /**
     * @param {HTMLSelectElement} selectEl
     * @param {{ label?: string, onPickAddNew: () => (void|Promise<void>) }} opts
     * @returns {function} dispose
     */
    function catSelectInitAddNew(selectEl, opts) {
        if (!selectEl || !opts || typeof opts.onPickAddNew !== 'function') {
            return function noop() {};
        }
        var onPickAddNew = opts.onPickAddNew;
        if (selectEl.dataset.catSelectAddNewInited === '1') {
            return function noop() {};
        }
        selectEl.dataset.catSelectAddNewInited = '1';
        selectEl.dataset.catSelectAddNewPrev =
            selectEl.value && selectEl.value !== CAT_SELECT_ADD_NEW_VALUE ? selectEl.value : '';

        function handler() {
            var v = selectEl.value;
            if (v !== CAT_SELECT_ADD_NEW_VALUE) {
                selectEl.dataset.catSelectAddNewPrev = v || '';
                return;
            }
            var restoreTo = selectEl.dataset.catSelectAddNewPrev || '';
            selectEl.value = restoreTo;
            Promise.resolve(onPickAddNew()).then(
                function () {
                    if (selectEl.value !== CAT_SELECT_ADD_NEW_VALUE) {
                        selectEl.dataset.catSelectAddNewPrev = selectEl.value || '';
                    }
                },
                function (e) {
                    if (typeof console !== 'undefined' && console.error) console.error(e);
                }
            );
        }

        selectEl.addEventListener('change', handler);
        return function catSelectDisposeAddNew() {
            selectEl.removeEventListener('change', handler);
            selectEl.dataset.catSelectAddNewInited = '';
            catSelectRemoveAddNewOption(selectEl);
        };
    }

    global.CAT_SELECT_ADD_NEW_VALUE = CAT_SELECT_ADD_NEW_VALUE;
    global.catSelectAppendAddNewOption = catSelectAppendAddNewOption;
    global.catSelectRemoveAddNewOption = catSelectRemoveAddNewOption;
    global.catSelectInitAddNew = catSelectInitAddNew;
})(typeof window !== 'undefined' ? window : globalThis);
