'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('    function decideCtrlEnterConfirmLocal(');
const end = app.indexOf('    async function onCtrlEnterConfirm(', start);
assert.ok(start >= 0 && end > start);
const body = app.slice(start, end);
assert.equal(body.includes('await '), false);
assert.ok(body.includes('return { focusNext: true, confirmed: true }'));
const undo = app.indexOf('    function scheduleNpCaretAfterTargetUndo(');
const undoBody = app.slice(undo, app.indexOf('    function applyOneTargetUndo(', undo));
assert.ok(undoBody.includes('opGen !== _pendingEditorFocusGen'));
process.stdout.write(JSON.stringify({
    method: 'Source check: confirm returns before workflow persist; undo caret bails if a newer focus or scroll started.',
    confirmHasAwaitPersist: body.includes('await _persistSegmentWfState')
}) + '\n');
