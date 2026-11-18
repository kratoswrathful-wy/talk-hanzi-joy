import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test as nodeTest } from 'node:test';

if (typeof globalThis.test !== 'function') globalThis.test = nodeTest;

const dir = path.dirname(fileURLToPath(import.meta.url));

function loadFocusOpsFactory() {
    const context = { console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(dir, 'focus-operation.js'), 'utf8'), context);
    return context.CatFocusOp.createFocusOps;
}

function loadCaret(ops) {
    const frames = [];
    const events = [];
    const body = { tagName: 'BODY' };
    const A = { id: 'A', tagName: 'DIV', isContentEditable: true, classList: { contains: (x) => x === 'grid-textarea' } };
    const search = { tagName: 'INPUT', isContentEditable: false };
    const ctx = {
        window: {},
        document: { body, documentElement: {}, activeElement: body },
        saved: { segId: 'A', plainOffset: 2, editor: A },
        requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
        getEditorSegId: (el) => el.id,
        saveFromSelection() {},
        scheduleEditorFocusForSaved: (sid, offset) => {
            events.push({ kind: 'navigationRequested', sid, offset, activeTag: ctx.document.activeElement.tagName });
            return true;
        },
        hide() {},
        hideRealTip() {},
        show() { events.push({ kind: 'hintOnly' }); },
        console
    };
    ctx.window.CatFocusOp = ops;
    vm.createContext(ctx);
    const src = fs.readFileSync(path.join(dir, 'cat-fake-caret.js'), 'utf8');
    const names = ['restore', 'navigateToSegmentBySegId', 'anotherFieldOwnsKeyboard', 'restoreOrShowFake'];
    for (const name of names) {
        const re = new RegExp(`^        function ${name}\\(`, 'm');
        const m = re.exec(src);
        assert.ok(m, name);
        const end = src.indexOf('\n        }', m.index);
        vm.runInContext(src.slice(m.index, end + 10), ctx);
    }
    return {
        frames,
        events,
        ctx,
        A,
        search,
        flush() { while (frames.length) frames.shift()(); }
    };
}

test('passive refresh keeps the keyboard and does not navigate, including when focus is body', () => {
    const ops = loadFocusOpsFactory()();
    const ui = loadCaret(ops);
    ui.ctx.document.activeElement = ui.search;
    ui.ctx.restoreOrShowFake();
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'hintOnly' }]);

    ui.events.length = 0;
    ui.ctx.document.activeElement = ui.ctx.document.body;
    ui.ctx.restoreOrShowFake();
    ops.noteManualScroll();
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'hintOnly' }]);
});

test('explicit return is cancelled when search or a manual scroll happens before the frame', () => {
    const ops = loadFocusOpsFactory()();
    const ui = loadCaret(ops);
    ui.ctx.restoreOrShowFake({ allowSteal: true });
    ui.ctx.document.activeElement = ui.search;
    ops.invalidateExplicit();
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'hintOnly' }]);

    ui.events.length = 0;
    ui.ctx.document.activeElement = ui.ctx.document.body;
    ui.ctx.restoreOrShowFake({ allowSteal: true });
    ops.noteManualScroll();
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'hintOnly' }]);
});

test('explicit return completes the saved offset when nothing newer happened', () => {
    const ops = loadFocusOpsFactory()();
    const ui = loadCaret(ops);
    ui.ctx.document.activeElement = ui.ctx.document.body;
    ui.ctx.restoreOrShowFake({ allowSteal: true });
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'navigationRequested', sid: 'A', offset: 2, activeTag: 'BODY' }]);
});

test('an outer replace-all cancel is still checked on the inner frame', () => {
    const ops = loadFocusOpsFactory()();
    const ui = loadCaret(ops);
    let valid = true;
    ui.ctx.restoreOrShowFake({ allowSteal: true, stillValid: () => valid });
    valid = false;
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'hintOnly' }]);
});

test('a file change cancels an explicit return that has not run yet', () => {
    const ops = loadFocusOpsFactory()();
    const ui = loadCaret(ops);
    ui.ctx.restoreOrShowFake({ allowSteal: true });
    ops.noteFileChange();
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'hintOnly' }]);
});

test('Ctrl+Alt+Down from the search field still returns when nothing newer happens', () => {
    const ops = loadFocusOpsFactory()();
    const ui = loadCaret(ops);
    ui.ctx.document.activeElement = ui.search;
    ui.ctx.restoreOrShowFake({ allowSteal: true });
    ui.flush();
    assert.equal(ui.events.some((event) => event.kind === 'navigationRequested' && event.offset === 2), true);
});

test('a later click on the same search field cancels the return', () => {
    const ops = loadFocusOpsFactory()();
    const ui = loadCaret(ops);
    ui.ctx.document.activeElement = ui.search;
    ui.ctx.restoreOrShowFake({ allowSteal: true });
    ops.invalidateExplicit();
    ui.flush();
    assert.deepEqual(ui.events, [{ kind: 'hintOnly' }]);
});

test('term return uses the same operation and does not navigate after it is cancelled', () => {
    const ops = loadFocusOpsFactory()();
    const frames = [];
    const events = [];
    const ctx = {
        console,
        window: { CatFocusOp: ops, getSelection: () => null },
        document: {
            body: { tagName: 'BODY' },
            activeElement: { tagName: 'INPUT' },
            querySelector: () => ({ click() {} })
        },
        catFakeCaret: {
            show() { events.push({ kind: 'hintOnly' }); },
            restore(op) { return ctx.restore(op); }
        },
        requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
        saved: { segId: 'A', plainOffset: 2 },
        scheduleEditorFocusForSaved() {},
        hide() {},
        restore(focusOp) {
            if (focusOp && !ops.isCurrent(focusOp)) return null;
            events.push({ kind: 'navigationRequested', offset: 2, activeTag: ctx.document.activeElement.tagName });
            return { __catCaretRestoreScheduled: true, segId: 'A', plainOffset: 2 };
        }
    };
    ctx.restoreSavedCaretIntoEditor = (op) => ctx.restore(op);
    ctx.restoreOrShowFakeCatCaret = () => events.push({ kind: 'fallback' });
    const app = fs.readFileSync(path.join(dir, '..', 'app.js'), 'utf8');
    const start = app.indexOf('    function catReturnFocusToEditorAfterTbAction(');
    const end = app.indexOf('    async function submitNewTermFromForm(', start);
    assert.ok(start > 0 && end > start);
    vm.createContext(ctx);
    vm.runInContext(app.slice(start, end), ctx);
    ctx.catReturnFocusToEditorAfterTbAction();
    ops.invalidateExplicit();
    while (frames.length) frames.shift()();
    assert.equal(events.some((event) => event.kind === 'navigationRequested'), false);
    assert.equal(events.some((event) => event.kind === 'hintOnly'), true);
});
