'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, 'grid-virtual-scroll.js'), 'utf8');
const context = {
    window: {},
    document: { getElementById: () => null, querySelector: () => null },
    MutationObserver: function MutationObserver() {},
    ResizeObserver: function ResizeObserver() {},
    requestAnimationFrame: (fn) => fn(),
    cancelAnimationFrame: () => {},
    localStorage: { getItem: () => null },
    console
};
context.globalThis = context.window;
context.window.document = context.document;
vm.createContext(context);
vm.runInContext(src, context);
const claim = context.window.CatVirtGrid.claimKeptRow;
const rowA = { id: 'a' };
const rowB = { id: 'b' };
const kept = new Map([['a', rowA], ['b', rowB]]);
assert.equal(claim(kept, 'a'), rowA);
assert.equal(kept.has('a'), false);
assert.equal(claim(kept, 'a'), null);
assert.equal(claim(kept, 'b'), rowB);
assert.equal(claim(kept, null), null);
process.stdout.write(JSON.stringify({ method: 'claimKeptRow reuses one row identity and does not hand it out twice.' }) + '\n');
