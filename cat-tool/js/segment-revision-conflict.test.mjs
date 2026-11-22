import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test as nodeTest } from 'node:test';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.test !== 'function') globalThis.test = nodeTest;

const dir = path.dirname(fileURLToPath(import.meta.url));
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir, 'segment-revision-conflict.js'), 'utf8'), context);
const api = context.CatSegmentRevision;

test('伺服器譯文不同時，不得拿新版本號再寫一次', () => {
    assert.equal(api.revisionConflictMayRetry('已存新譯', '批次譯'), false);
    assert.equal(api.revisionConflictMayRetry('', '批次譯'), false);
});

test('伺服器譯文相同時，才可以帶著同一份譯文再寫', () => {
    assert.equal(api.revisionConflictMayRetry('批次譯', '批次譯'), true);
    assert.equal(api.revisionConflictMayRetry('', ''), true);
    assert.equal(api.revisionConflictMayRetry(null, ''), true);
});
