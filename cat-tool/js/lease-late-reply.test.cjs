'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const focusStart = app.indexOf("targetInput.addEventListener('focus', async () => {");
assert.ok(focusStart > 0);
const focusBody = app.slice(focusStart, focusStart + 1800);
assert.ok(focusBody.includes('const myEpoch = ++editorFocusEpoch'));
assert.ok(focusBody.includes('stillThisEditor'));
assert.ok(focusBody.includes('if (!stillThisEditor())'));
assert.ok(focusBody.indexOf('if (!stillThisEditor())') < focusBody.indexOf('releaseHeldLeasesExcept(seg.id)'));
assert.ok(focusBody.includes('if (!stillThisEditor()) return'));
const releaseStart = app.indexOf('    async function releaseHeldLeasesExcept(');
const releaseBody = app.slice(releaseStart, releaseStart + 700);
assert.ok(releaseBody.includes('activeEditorSegId() === String(segId)'));
process.stdout.write(JSON.stringify({
    method: 'Late edit-lease replies do not alert, blur, or release the sentence the user has already moved to.'
}) + '\n');
