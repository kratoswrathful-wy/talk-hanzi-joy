'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, 'cat-fake-caret.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const fnStart = src.indexOf('function restoreOrShowFake(opts)');
assert.ok(fnStart > 0);
const fn = src.slice(fnStart, fnStart + 1200);
assert.ok(fn.includes('if (!allowSteal || !op)'));
assert.ok(fn.includes('opts.op'));
assert.ok(!fn.includes('anotherFieldOwnsKeyboard()'));
assert.ok(fn.includes('ops.isCurrent(op)'));
assert.ok(fn.includes('stillValid'));
assert.ok(app.includes('stillValid:'));
process.stdout.write(JSON.stringify({
    method: 'Auxiliary source check. Behavior is focus-operation.test.mjs.'
}) + '\n');
