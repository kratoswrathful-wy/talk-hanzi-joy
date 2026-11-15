'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.argv[2] || path.join(__dirname, '..');
const fake = fs.readFileSync(path.join(base, 'js/cat-fake-caret.js'), 'utf8');
const insertHelper = fs.readFileSync(path.join(base, 'js/saved-caret-insert.js'), 'utf8');

const helperCtx = { window: {}, globalThis: {} };
helperCtx.globalThis = helperCtx.window;
vm.createContext(helperCtx);
vm.runInContext(insertHelper, helperCtx);
const helper = helperCtx.window.CatSavedCaretInsert;
assert.ok(helper, 'CatSavedCaretInsert missing');
assert.equal(helper.isTargetEditorElement({ segId: 'synthetic', plainOffset: 2 }), false);
const editorEl = {
    nodeType: 1,
    classList: { contains: (c) => c === 'grid-textarea' },
    closest: (sel) => sel === '.col-target' ? {} : null,
    contentEditable: 'true',
    childNodes: []
};
assert.equal(helper.isTargetEditorElement(editorEl), true);

const restoreStart = fake.indexOf('        function restore() {');
const restoreEnd = fake.indexOf('        function clear() {', restoreStart);
assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, 'restore() extract');
const scheduled = [];
const restoreCtx = {
    saved: { segId: 'synthetic', plainOffset: 2, editor: editorEl },
    scheduleEditorFocusForSaved: (id, offset) => { scheduled.push({ id, offset }); return true; },
    hide() {}
};
vm.createContext(restoreCtx);
vm.runInContext(fake.slice(restoreStart, restoreEnd), restoreCtx);
const restoredValue = restoreCtx.restore();
assert.equal(scheduled.length, 1);
assert.equal(helper.isTargetEditorElement(restoredValue), false);
assert.equal(restoredValue.__catCaretRestoreScheduled, true);
assert.notEqual(restoredValue, restoreCtx.saved);

const landed = {
    nodeType: 1,
    classList: { contains: (c) => c === 'grid-textarea' },
    closest: (sel) => sel === '.col-target' ? {} : null,
    contentEditable: 'true'
};
let inserted = null;
helper.beginInsert({
    text: '選取內容',
    segId: 'synthetic',
    fileId: 'f1',
    insert: (ed, snap) => { inserted = { ed, text: snap.text }; return true; }
});
assert.equal(helper.onFocusComplete({ segId: 'synthetic', editor: landed, fileId: 'f1' }), true);
assert.equal(inserted.text, '選取內容');
assert.equal(helper.getPending(), null);

let threw = null;
try {
    const fakeEditor = restoredValue;
    void fakeEditor.childNodes;
} catch (e) {
    threw = e;
}
assert.equal(threw, null, 'scheduled restore token must not be used as a DOM editor');

process.stdout.write(JSON.stringify({
    method: 'Actual fake-caret restore() plus CatSavedCaretInsert contract. Synthetic caret.',
    scheduled,
    returnedValueIsEditor: helper.isTargetEditorElement(restoredValue),
    scheduledToken: restoredValue && restoredValue.__catCaretRestoreScheduled === true
}) + '\n');
