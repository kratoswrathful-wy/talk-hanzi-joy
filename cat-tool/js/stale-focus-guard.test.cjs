'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const filterStart = app.indexOf('    function flushFilterAnchorAfterVirtRender(');
const filterEnd = app.indexOf('    function captureEditingFocusBeforeVirtRender(', filterStart);
const filterBody = app.slice(filterStart, filterEnd);
assert.ok(filterBody.includes('anchorGen !== _filterAnchorGen'));
assert.ok(filterBody.includes('scrollGen !== _userScrollGen'));
const preserve = app.slice(app.indexOf('    function captureEditingFocusBeforeVirtRender('), app.indexOf('    function flushEditorFocusAfterVirtRender('));
assert.ok(preserve.includes('focusGen: _pendingEditorFocusGen'));
const flush = app.slice(app.indexOf('    function flushEditorFocusAfterVirtRender('), app.indexOf('    function applyEditorFocusAtSegId('));
assert.ok(flush.includes('preserved.focusGen !== _pendingEditorFocusGen'));
const replaceStart = app.indexOf('    async function performReplaceAll(');
const replaceBody = app.slice(replaceStart, replaceStart + 4000);
assert.ok(replaceBody.includes('opGen !== _pendingEditorFocusGen'));
assert.ok(app.includes('function isCenterUnreachableButVisible('));
process.stdout.write(JSON.stringify({
    method: 'Source guards: stale filter, preserve-focus and replace-all restores bail when a newer focus or scroll started. Edge centering can complete when further scroll cannot move.'
}) + '\n');
