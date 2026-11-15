'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, 'after-confirm-scroll.js'), 'utf8');
const context = { window: {}, globalThis: {} };
context.globalThis = context.window;
vm.createContext(context);
vm.runInContext(src, context);
const api = context.window.CatAfterConfirmScroll || context.globalThis.CatAfterConfirmScroll;

assert.equal(api.parseBottomN(undefined), 3);
assert.equal(api.parseBottomN(''), 3);
assert.equal(api.parseBottomN('0'), 3);
assert.equal(api.parseBottomN('-2'), 3);
assert.equal(api.parseBottomN('1.5'), 3);
assert.equal(api.parseBottomN('abc'), 3);
assert.equal(api.parseBottomN('1'), 1);
assert.equal(api.parseBottomN(3), 3);
assert.equal(api.parseBottomN('8'), 8);
assert.equal(api.virtScrollBlockFromPending('nearest'), 'nearest');
assert.equal(api.virtScrollBlockFromPending('end'), 'nearest');
assert.equal(api.virtScrollBlockFromPending('center'), 'center');
assert.notEqual(api.virtScrollBlockFromPending('nearest'), 'start');

const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' }];
const heights = { a: 40, b: 40, c: 40, d: 40, e: 40, f: 40, g: 40 };
const n3 = api.computeNearestTargetTop({
    list, segId: 'e', viewportHeight: 200, headerH: 20, n: 3, heights
});
assert.equal(n3.n, 3);
assert.equal(n3.reserved, 80);
assert.equal(n3.reachable, true);
assert.ok(n3.targetTop >= 0);

const n1 = api.computeNearestTargetTop({
    list, segId: 'e', viewportHeight: 200, headerH: 20, n: 1, heights
});
assert.equal(n1.reserved, 0);
assert.ok(n1.targetTop < n3.targetTop, 'N=1 uses smaller scrollTop so the row sits nearer the bottom');

const skip = api.shouldScrollToNearest({
    list, segId: 'e', viewportHeight: 200, headerH: 20, n: 3, heights,
    currentScrollTop: n3.targetTop,
    rowTopInViewport: 40,
    rowBottomInViewport: 80,
    viewportBottom: 200
});
assert.equal(skip.shouldScroll, false);

process.stdout.write(JSON.stringify({
    method: 'Pure after-confirm-scroll helpers in a vm; no browser.',
    parseDefault: api.parseBottomN(''),
    nearestNotStart: api.virtScrollBlockFromPending('nearest'),
    n3, n1
}) + '\n');
