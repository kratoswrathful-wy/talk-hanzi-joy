'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.argv[2] || path.join(__dirname, '..');
const app = fs.readFileSync(path.join(base, 'app.js'), 'utf8');
const virt = fs.readFileSync(path.join(base, 'js/grid-virtual-scroll.js'), 'utf8');
function extract(text, name, next) {
    const start = text.indexOf('    function ' + name + '(');
    const end = text.indexOf('    function ' + next + '(', start + 1);
    assert.ok(start >= 0 && end > start, name);
    return text.slice(start, end);
}
const functions = [
    extract(app, 'getGridRowBySegId', 'getGridRowAtListIndex'),
    extract(app, 'getGridRowAtListIndex', 'setActiveGridRow'),
    extract(app, 'applyOneTargetUndo', 'applySegmentStateItems'),
    extract(app, 'refreshRepetitionSiblingRow', 'applyOptimisticRepetitionAfterPrimaryConfirm'),
    extract(app, 'setSegmentFieldText', 'replaceOccurrenceInPlain'),
    extract(virt, 'queryRow', 'scrollToSegId'),
    extract(virt, 'scrollToSegId', 'ensureRowMounted'),
    extract(virt, 'ensureRowMounted', 'isSegIdCentered')
].join('\n');
function scenario(kind) {
    const calls = [];
    const gridBody = { querySelector: () => null, querySelectorAll: () => [] };
    const context = {
        gridBody, cfg: { gridBody }, enabled: true,
        currentSegmentsList: [{ id: 'offscreen' }],
        getRenderableList: () => [{ id: 'offscreen' }],
        Date, _lastNavScrollKey: null, _lastNavScrollAt: 0, NAV_SCROLL_COALESCE_MS: 60,
        _anchorSegId: null, _anchorOffsetPx: 0, _restoreFromAnchor: false,
        _lastStartIdx: 4, _lastEndIdx: 84,
        armNavAnchorLock(block) { calls.push({ effect: 'navigation_anchor_lock', block: block ?? null }); },
        renderWindow(segId, block, trigger) { calls.push({ effect: 'render_requested', segId, block: block ?? null, trigger }); },
        isTargetWriteProtected: () => false,
        plainCaretEndAfterSingleEdit: () => 0,
        applyUpdateSegmentTarget: () => Promise.resolve(),
        console,
        window: { CatVirtGrid: { isEnabled: () => true } }
    };
    vm.createContext(context);
    vm.runInContext(functions, context);
    context.window.CatVirtGrid.ensureRowMounted = context.ensureRowMounted;
    if (kind === 'passive_control') context.getGridRowBySegId('offscreen', false);
    else if (kind === 'explicit_ensure_true') context.getGridRowBySegId('offscreen', true);
    else if (kind === 'repetition_refresh') context.refreshRepetitionSiblingRow(context.currentSegmentsList[0], 'synthetic');
    else if (kind === 'replace_text') context.setSegmentFieldText(context.currentSegmentsList[0], 0, 'target', 'synthetic');
    else if (kind === 'target_undo') context.applyOneTargetUndo({ segmentId: 'offscreen', oldTarget: 'before', newTarget: 'after' }, 'undo');
    else context.getGridRowAtListIndex(0);
    return { kind, calls, anchorAfterLookup: context._anchorSegId };
}
const results = [
    'default_list_lookup',
    'repetition_refresh',
    'replace_text',
    'target_undo',
    'passive_control',
    'explicit_ensure_true'
].map(scenario);
assert.equal(results[0].calls.length, 0, 'getGridRowAtListIndex must not navigate');
assert.equal(results[1].calls.length, 0, 'repetition refresh must not navigate');
assert.equal(results[2].calls.length, 0, 'text replace must not navigate');
assert.equal(results[3].calls.length, 0, 'target undo must not navigate');
assert.equal(results[4].calls.length, 0, 'passive false lookup must not navigate');
assert.ok(results[5].calls.some((c) => c.trigger === 'scrollToSegId:start' || c.trigger === 'scrollToSegId:nearest' || (c.effect === 'render_requested')), 'explicit ensure true still navigates');
process.stdout.write(JSON.stringify({
    method: 'Actual app lookup/undo/replace/repetition through virtual-grid query/ensure/scroll. Synthetic DOM.',
    limitation: 'Does not prove physical browser scrolling or the full incident loop.',
    results: results.map((r) => ({ kind: r.kind, callCount: r.calls.length, trigger: r.calls[1] && r.calls[1].trigger, anchor: r.anchorAfterLookup }))
}, null, 2) + '\n');
