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
vm.runInContext(fs.readFileSync(path.join(dir, 'pretranslate-apply.js'), 'utf8'), context);
const api = context.CatPretranslateApply;

test('同分保留先出現的候選，較低分不取代', () => {
    const picked = api.choosePreTranslateCandidate([
        { score: 90, entry: { targetText: '甲' } },
        { score: 90, entry: { targetText: '乙' } },
        { score: 70, entry: { targetText: '丙' } }
    ], 80);
    assert.equal(picked.candidate.targetText, '甲');
    assert.equal(picked.score, 90);
});

test('未達門檻不套用', () => {
    const picked = api.choosePreTranslateCandidate([
        { score: 99, entry: { targetText: '差一點' } }
    ], 100);
    assert.equal(picked, null);
});

test('自動確認只在一百分，而且標籤跟著這次候選', () => {
    const full = api.planPreTranslateWrite({
        candidateText: '批次{1}',
        candidateTags: [{ ph: '{1}', num: 1 }],
        score: 100,
        autoConfirm: true
    });
    assert.equal(full.confirmAfterSave, true);
    assert.equal(full.text, '批次{1}');
    assert.equal(full.tags.length, 1);
    assert.equal(full.matchValue, '100');

    const below = api.planPreTranslateWrite({
        candidateText: '八成',
        candidateTags: [],
        score: 80,
        autoConfirm: true
    });
    assert.equal(below.confirmAfterSave, false);

    const off = api.planPreTranslateWrite({
        candidateText: '批次',
        score: 100,
        autoConfirm: false
    });
    assert.equal(off.confirmAfterSave, false);
    assert.equal(off.tags.length, 0);
});

test('批次已接手時，較早的草稿不得再寫回', () => {
    assert.equal(api.editorDraftMustYield(1, 2), true);
    assert.equal(api.editorDraftMustYield(2, 2), false);
});

test('批次進行中，格子裡已經改過的字要留著', () => {
    assert.equal(api.preTranslateShouldSkipLiveDraft('', null, false), false);
    assert.equal(api.preTranslateShouldSkipLiveDraft('', '', false), false);
    assert.equal(api.preTranslateShouldSkipLiveDraft('', '手改', false), true);
    assert.equal(api.preTranslateShouldSkipLiveDraft('已存', '已存', false), false);
    assert.equal(api.preTranslateShouldSkipLiveDraft('', '', true), true);
});

test('正在組字時不要整表重畫', () => {
    assert.equal(api.preTranslateMayRebuildGrid(true), false);
    assert.equal(api.preTranslateMayRebuildGrid(false), true);
});
