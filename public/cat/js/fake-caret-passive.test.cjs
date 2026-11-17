'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, 'cat-fake-caret.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const fnStart = src.indexOf('function restoreOrShowFake(opts)');
assert.ok(fnStart > 0);
const fn = src.slice(fnStart, fnStart + 500);
assert.ok(src.includes('function anotherFieldOwnsKeyboard()'));
assert.ok(fn.includes('if (!allowSteal && anotherFieldOwnsKeyboard())'));
assert.ok(fn.includes('show();'));
assert.ok(app.includes('restoreOrShowFakeCatCaret({ allowSteal: true })'));
assert.ok(app.includes("function restoreOrShowFakeCatCaret(opts)"));
process.stdout.write(JSON.stringify({
    method: 'Passive fake-caret restore only draws the hint when another field already has the keyboard. Explicit return may still focus.'
}) + '\n');
