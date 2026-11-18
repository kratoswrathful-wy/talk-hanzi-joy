import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test as nodeTest } from 'node:test';

if (typeof globalThis.test !== 'function') globalThis.test = nodeTest;

const dir = path.dirname(fileURLToPath(import.meta.url));

function loadBrowserScript(file, exportName) {
    const context = { console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context);
    return context[exportName];
}

const { createLeaseCoordinator, runEditorFocus, settleAfterRelease } = loadBrowserScript('segment-lease-intent.js', 'CatSegmentLeaseIntent');

function editor(id) {
    return {
        id,
        tagName: 'DIV',
        isContentEditable: true,
        classList: { contains: (x) => x === 'grid-textarea' },
        closest: () => ({ dataset: { segId: id } }),
        blur() { this.blurred = true; }
    };
}

function harness() {
    const coord = createLeaseCoordinator();
    const pending = [];
    const released = [];
    const server = new Set();
    const local = new Set();
    const alerts = [];
    const undo = [];
    let active = null;
    const activeSeg = () => (active && active.classList && active.classList.contains('grid-textarea') ? active.id : '');

    async function release(segId, gen) {
        released.push({ segId: String(segId), gen });
        server.delete(String(segId));
        const next = coord.onReleaseSettled(segId, gen);
        if (next.action === 'reacquire') {
            server.add(String(segId));
            const ticket = coord.ticketForDesired(segId);
            const decision = coord.onAcquireSettled(ticket, activeSeg(), true);
            if (decision.action === 'hold') local.add(String(segId));
        }
    }

    function envFor(seg, input) {
        return {
            seg,
            targetInput: input,
            activeElement: () => active,
            activeSegId: activeSeg,
            acquire: () => new Promise((resolve) => pending.push({ segId: seg.id, resolve })),
            release,
            releaseOthers: async (keep) => {
                const items = coord.selectReleases(local, keep, activeSeg());
                for (const item of items) {
                    if (coord.currentDesired(item.segId) !== item.gen) continue;
                    if (activeSeg() === item.segId) continue;
                    coord.abandonIfCurrent(item.segId, item.gen);
                    local.delete(item.segId);
                    await release(item.segId, item.gen);
                }
            },
            blur: () => input.blur(),
            alertOccupied: (lease) => alerts.push(lease && lease.holderName),
            markHeld: (id) => local.add(String(id)),
            autofill: async () => {},
            captureUndo: () => undo.push(seg.id)
        };
    }

    return { coord, pending, released, server, local, alerts, undo, setActive(el) { active = el; }, envFor };
}

async function settle(pending, index, value) {
    pending[index].resolve(value);
    await Promise.resolve();
    await Promise.resolve();
}

test('A1 then B then A2: stale A1 success does not release the current A hold', async () => {
    const h = harness();
    const A = editor('A');
    const B = editor('B');
    const segA = { id: 'A', targetText: 'synthetic A' };
    const segB = { id: 'B', targetText: 'synthetic B' };
    h.setActive(A);
    const p1 = runEditorFocus(h.coord, h.envFor(segA, A));
    h.setActive(B);
    const p2 = runEditorFocus(h.coord, h.envFor(segB, B));
    h.setActive(A);
    const p3 = runEditorFocus(h.coord, h.envFor(segA, A));
    assert.equal(h.pending.length, 3);
    h.server.add('A');
    await settle(h.pending, 2, { acquired: true });
    await p3;
    assert.equal(h.local.has('A'), true);
    assert.equal(h.server.has('A'), true);
    h.server.add('A');
    await settle(h.pending, 0, { acquired: true });
    await p1;
    assert.equal(h.local.has('A'), true);
    assert.equal(h.server.has('A'), true);
    assert.equal(h.released.some((r) => r.segId === 'A'), false);
    await settle(h.pending, 1, { acquired: false });
    await p2;
    assert.equal(h.alerts.length, 0);
    assert.equal(A.blurred, undefined);
});

test('d41f2e04 focus handler releases A on the same A1-B-A2 order', async () => {
    const app = execFileSync('git', ['show', 'd41f2e04:cat-tool/app.js'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const released = [];
    const server = new Set();
    const pending = [];
    const A = editor('A');
    const B = editor('B');
    const ctx = {
        document: { activeElement: null },
        console,
        editorFocusEpoch: 0,
        heldSegmentLeases: new Set(),
        collabSelfSessionId: 'synthetic-session',
        isTeamMode: () => true,
        hideCatFakeCaret() {},
        cancelLeaseReleaseTimer() {},
        stopLeaseRefreshForSegment() {},
        blockSelectionIfEditedByOthers: () => false,
        acquireSegmentEditLease: (seg) => new Promise((resolve) => pending.push({ seg: seg.id, resolve })),
        emitCollabEdit() {},
        startLeaseRefreshForSegment() {},
        maybeAutoFillEmptyTarget: async () => {},
        refreshTagNextHighlight() {},
        alert() {},
        editorUndoEditStart: {},
        editorUndoStatusStart: {},
        editorUndoMatchStart: {},
        activeEditorSegId() {
            const el = ctx.document.activeElement;
            return el && el.id ? el.id : '';
        },
        DBService: {
            releaseSegmentEditLease: async (sid) => {
                released.push(sid);
                server.delete(sid);
            }
        }
    };
    vm.createContext(ctx);
    const fn = (name) => {
        const re = new RegExp(`^    (?:async )?function ${name}\\(`, 'm');
        const m = re.exec(app);
        const end = app.indexOf('\n    }', m.index);
        return app.slice(m.index, end + 6);
    };
    vm.runInContext(`${fn('activeEditorSegId')}\n${fn('releaseSegmentEditLeaseById')}\n${fn('releaseHeldLeasesExcept')}`, ctx);
    const marker = "targetInput.addEventListener('focus', ";
    const start = app.indexOf(marker) + marker.length;
    const end = app.indexOf('\n                });', start);
    vm.runInContext(`makeHandler = (seg, row, targetInput) => (${app.slice(start, end)}\n});`, ctx);
    const segA = { id: 'A', targetText: 'synthetic A' };
    const segB = { id: 'B', targetText: 'synthetic B' };
    ctx.document.activeElement = A;
    const p1 = ctx.makeHandler(segA, {}, A)();
    ctx.document.activeElement = B;
    const p2 = ctx.makeHandler(segB, {}, B)();
    ctx.document.activeElement = A;
    const p3 = ctx.makeHandler(segA, {}, A)();
    server.add('A');
    pending[2].resolve({ acquired: true });
    await p3;
    pending[0].resolve({ acquired: true });
    await p1;
    pending[1].resolve({ acquired: false });
    await p2;
    assert.equal(released.includes('A'), true);
    assert.equal(server.has('A'), false);
});

test('release already sent, then the user returns to A, reacquires after the old release', async () => {
    const h = harness();
    const A = editor('A');
    const segA = { id: 'A', targetText: 'synthetic A' };
    h.setActive(A);
    const first = runEditorFocus(h.coord, h.envFor(segA, A));
    h.server.add('A');
    await settle(h.pending, 0, { acquired: true });
    await first;
    const heldGen = h.coord.currentDesired('A');
    let releaseGate;
    const releasePromise = new Promise((resolve) => { releaseGate = resolve; });
    const originalRelease = h.envFor(segA, A).release;
    const blockedRelease = async (segId, gen) => {
        await releasePromise;
        return originalRelease(segId, gen);
    };
    h.coord.abandonIfCurrent('A', heldGen);
    const oldRelease = blockedRelease('A', heldGen);
    h.setActive(A);
    const second = runEditorFocus(h.coord, {
        ...h.envFor(segA, A),
        release: blockedRelease,
        acquire: () => Promise.resolve({ acquired: true })
    });
    h.server.add('A');
    await second;
    assert.equal(h.local.has('A'), true);
    releaseGate();
    await oldRelease;
    assert.equal(h.server.has('A'), true);
    assert.equal(h.local.has('A'), true);
});

test('occupied lease is not treated as acquired, and a later acquire works after release', async () => {
    const h = harness();
    const A = editor('A');
    const segA = { id: 'A', targetText: 'synthetic A' };
    h.setActive(A);
    const denied = runEditorFocus(h.coord, h.envFor(segA, A));
    await settle(h.pending, 0, { acquired: false, holderName: '乙' });
    const deniedResult = await denied;
    assert.equal(deniedResult.outcome, 'rejected');
    assert.deepEqual(h.alerts, ['乙']);
    assert.equal(A.blurred, true);
    assert.equal(h.local.has('A'), false);
    h.setActive(A);
    A.blurred = false;
    const ok = runEditorFocus(h.coord, h.envFor(segA, A));
    h.server.add('A');
    await settle(h.pending, 1, { acquired: true });
    const okResult = await ok;
    assert.equal(okResult.outcome, 'held');
    assert.equal(h.undo.at(-1), 'A');
});

test('a newer hold started while another release is waiting is not cleared', async () => {
    const coord = createLeaseCoordinator();
    coord.beginFocus('B');
    coord.beginFocus('C');
    const first = coord.selectReleases(['B', 'C'], '', '');
    coord.beginFocus('C');
    const still = first.filter((item) => coord.currentDesired(item.segId) === item.gen);
    assert.equal(still.map((item) => item.segId).join(','), 'B');
});

test('file change drops desired hold and a late acquire is released', async () => {
    const h = harness();
    const A = editor('A');
    const segA = { id: 'A', targetText: 'synthetic A' };
    h.setActive(A);
    const pendingFocus = runEditorFocus(h.coord, h.envFor(segA, A));
    h.coord.bumpFile();
    h.setActive(editor('other'));
    await settle(h.pending, 0, { acquired: true });
    const result = await pendingFocus;
    assert.equal(result.outcome, 'release-unneeded');
    assert.equal(h.released.some((r) => r.segId === 'A'), true);
    assert.equal(h.undo.length, 0);
});

test('reacquire denied by another person clears the local hold and does not toast after leaving', async () => {
    const coord = createLeaseCoordinator();
    const first = coord.beginFocus('A');
    coord.abandonIfCurrent('A', first.gen);
    coord.beginFocus('A');
    const held = new Set(['A']);
    let refresh = true;
    const notes = [];
    const denied = await settleAfterRelease(coord, {
        acquire: async () => ({ acquired: false, holderName: '乙' }),
        activeSegId: () => 'A',
        markHeld() { held.add('A'); refresh = true; },
        clearHeld() { held.delete('A'); refresh = false; },
        notifyOccupied(lease) { notes.push(lease.holderName); },
        notifyUnknown() { notes.push('unknown'); }
    }, 'A', first.gen);
    assert.equal(denied.outcome, 'rejected');
    assert.equal(held.has('A'), false);
    assert.equal(refresh, false);
    assert.deepEqual(notes, ['乙']);
    assert.equal(coord.currentDesired('A'), 0);

    const again = createLeaseCoordinator();
    const old = again.beginFocus('A');
    again.abandonIfCurrent('A', old.gen);
    again.beginFocus('A');
    const notesAway = [];
    const heldAway = new Set(['A']);
    await settleAfterRelease(again, {
        acquire: async () => ({ acquired: false, failed: true }),
        activeSegId: () => 'B',
        clearHeld() { heldAway.delete('A'); },
        notifyOccupied() { notesAway.push('occupied'); },
        notifyUnknown() { notesAway.push('unknown'); }
    }, 'A', old.gen);
    assert.equal(heldAway.has('A'), false);
    assert.deepEqual(notesAway, []);
});

test('a failed renew does not keep the local hold or call the other person editor', async () => {
    const app = fs.readFileSync(path.join(dir, '..', 'app.js'), 'utf8');
    const start = app.indexOf('    async function renewSegmentEditLease(');
    const end = app.indexOf('    function startLeaseRefreshForSegment(', start);
    assert.ok(start > 0 && end > start);
    const toasts = [];
    const ctx = {
        console,
        heldSegmentLeases: new Set(['A']),
        leaseCoord: createLeaseCoordinator(),
        activeEditorSegId: () => 'A',
        stopLeaseRefreshForSegment() { ctx.stopped = true; },
        acquireSegmentEditLease: async () => ({ acquired: false, failed: true }),
        showCatToast(message) { toasts.push(message); },
        window: { CatSegmentLeaseIntent: { classifyAcquire(lease) { return lease && lease.failed ? 'unknown' : 'occupied'; } } }
    };
    ctx.leaseCoord.beginFocus('A');
    vm.createContext(ctx);
    vm.runInContext(app.slice(start, end), ctx);
    await ctx.renewSegmentEditLease({ id: 'A' });
    assert.equal(ctx.heldSegmentLeases.has('A'), false);
    assert.equal(ctx.stopped, true);
    assert.equal(toasts.some((message) => message.includes('其他成員')), false);
    assert.equal(toasts.some((message) => message.includes('無法延續')), true);
});
