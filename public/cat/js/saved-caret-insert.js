/**
 * 暫存游標還原與插入的契約：定位資料不是編輯元素。
 * Ctrl＋0／TB／原文標籤插入先快照選字，等同一操作完成後才寫入。
 */
(function (global) {
    'use strict';

    var pending = null;
    var opGen = 0;

    function isTargetEditorElement(el) {
        return !!(
            el
            && el.nodeType === 1
            && el.classList
            && el.classList.contains('grid-textarea')
            && typeof el.closest === 'function'
            && el.closest('.col-target')
            && el.contentEditable !== 'false'
        );
    }

    function snapshotSelectionText() {
        var sel = global.getSelection && global.getSelection();
        return sel ? String(sel.toString()) : '';
    }

    function beginInsert(payload) {
        opGen += 1;
        pending = payload ? Object.assign({ opGen: opGen }, payload) : null;
        return pending;
    }

    function cancel() {
        pending = null;
    }

    function getPending() {
        return pending;
    }

    function onFocusComplete(ctx) {
        if (!pending || !ctx) return false;
        if (pending.segId == null || ctx.segId == null) return false;
        if (String(pending.segId) !== String(ctx.segId)) return false;
        if (pending.fileId != null && ctx.fileId != null && String(pending.fileId) !== String(ctx.fileId)) {
            pending = null;
            return false;
        }
        if (pending.viewId != null && ctx.viewId != null && String(pending.viewId) !== String(ctx.viewId)) {
            pending = null;
            return false;
        }
        if (!isTargetEditorElement(ctx.editor)) return false;
        var insert = pending.insert;
        var snap = pending;
        pending = null;
        if (typeof insert === 'function') return !!insert(ctx.editor, snap);
        return false;
    }

    global.CatSavedCaretInsert = {
        isTargetEditorElement: isTargetEditorElement,
        snapshotSelectionText: snapshotSelectionText,
        beginInsert: beginInsert,
        cancel: cancel,
        getPending: getPending,
        onFocusComplete: onFocusComplete
    };
})(typeof window !== 'undefined' ? window : globalThis);
