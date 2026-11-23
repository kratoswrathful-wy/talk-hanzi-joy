import { test, expect } from '@playwright/test';
import { runQuickRedoCase } from './helpers/cat-quick-redo.mjs';

const base = process.env.CAT_LOCAL_URL || 'http://127.0.0.1:8081/cat/index.html';
const cases = ['source', 'both', 'off'].flatMap(scope =>
  [0, 650].map(tailPause => ({ scope, tailPause, prefixPause: 650 })));
cases.push({ scope: 'source', tailPause: 0, prefixPause: 0 }, { scope: 'off', tailPause: 0, prefixPause: 0 });
for (const cfg of cases) {
  test(`快速重做 ${cfg.scope} 尾段間隔 ${cfg.tailPause} 前段間隔 ${cfg.prefixPause}`, async ({ browser }, info) => {
    const result = await runQuickRedoCase(browser, cfg, base, info.outputPath('trace.json'));
    await info.attach('步驟與寫入紀錄', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.failure).toBeUndefined();
    expect(result.redoComplete).toBe(true);
    expect(result.focusCorrect).toBe(true);
    expect(result.completeAfterReopen).toBe(true);
    const target = cfg.scope === 'off' ? '2' : '3';
    expect(result.reopened.rows.map(r => r.text)).toEqual(
      ['1', '2', '3', '4'].map(id => id === '1' ? '甲' : id === target ? 'abc-UNDO42X' : ''));
    expect(result.reopened.rows[0].status).toBe('confirmed');
    expect(result.reopened.rows.filter(r => r.id !== '1').every(r => r.status === 'unconfirmed')).toBe(true);
    expect(result.errors).toEqual([]);
  });
}

test('復原後改字仍保存，普通輸入與 Ctrl＋0 插入可重做', async ({ browser }, info) => {
  const result = await runQuickRedoCase(browser, { scope: 'source', tailPause: 0, prefixPause: 650, extra: true }, base, info.outputPath('trace.json'));
  await info.attach('定向回歸紀錄', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.failure).toBeUndefined();
  expect(result.branch?.rows.find(r => r.id === '3')?.text).toBe('abc-UNDO42XBRANCH');
  expect(result.branchSavedWithoutBlur).toBe(true);
  expect(result.ordinary?.rows.find(r => r.id === '3')?.text).toBe('prefix');
  expect(result.selected?.trim()).toBe('CHECK');
  expect(result.insertRedo?.active).toBe('3');
  expect(result.insertRedo?.rows.find(r => r.id === '3')?.text).toBe('prefix'+result.selected+'X');
  expect(result.insertReopened?.rows.map(r => r.text)).toEqual(['甲', '', 'prefix'+result.selected+'X', '']);
  expect(result.errors).toEqual([]);
});
