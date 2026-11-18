'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const focusStart = app.indexOf("targetInput.addEventListener('focus', () => {");
assert.ok(focusStart > 0);
const focusBody = app.slice(focusStart, focusStart + 1600);
assert.ok(focusBody.includes('runEditorFocus'));
assert.ok(!focusBody.includes('void releaseSegmentEditLeaseById(seg.id);'));
const releaseStart = app.indexOf('    async function releaseSegmentEditLeaseById(');
const releaseBody = app.slice(releaseStart, releaseStart + 1400);
assert.ok(releaseBody.includes('settleAfterRelease'));
assert.ok(releaseBody.includes('clearHeld'));
assert.ok(app.includes('async function renewSegmentEditLease('));
process.stdout.write(JSON.stringify({
    method: 'Auxiliary source check. Behavior is segment-lease-intent.test.mjs.'
}) + '\n');
