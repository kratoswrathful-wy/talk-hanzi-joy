import { describe, it, expect } from 'vitest';
import { computeDiff, renderDiffHtml } from './cat-diff-engine.js';

function opTexts(result, type) {
  return result.ops.filter((o) => o.type === type).map((o) => o.text);
}

describe('cat-diff-engine readable mode', () => {
  it('degraded → degrade is whole-word replace', () => {
    const r = computeDiff('degraded', 'degrade', { mode: 'readable' });
    expect(opTexts(r, 'delete')).toEqual(['degraded']);
    expect(opTexts(r, 'insert')).toEqual(['degrade']);
    expect(r.fallback).toBe(false);
  });

  it('will degrade → will not degrade inserts "not"', () => {
    const r = computeDiff('will degrade', 'will not degrade', { mode: 'readable' });
    expect(r.ops.some((o) => o.type === 'equal' && o.text.includes('degrade'))).toBe(true);
    expect(r.ops.some((o) => o.type === 'insert' && o.text.trim() === 'not')).toBe(true);
    expect(r.fallback).toBe(false);
  });

  it('15% → 20% replaces number+unit tokens', () => {
    const r = computeDiff('15%', '20%', { mode: 'readable' });
    expect(opTexts(r, 'delete')).toEqual(['15%']);
    expect(opTexts(r, 'insert')).toEqual(['20%']);
  });

  it('3.5s → 4s replaces units as tokens', () => {
    const r = computeDiff('3.5s', '4s', { mode: 'readable' });
    expect(opTexts(r, 'delete')).toEqual(['3.5s']);
    expect(opTexts(r, 'insert')).toEqual(['4s']);
  });

  it('placeholder tokens are atomic', () => {
    const r = computeDiff('{player_name}', '{user_name}', { mode: 'readable' });
    expect(opTexts(r, 'delete')).toEqual(['{player_name}']);
    expect(opTexts(r, 'insert')).toEqual(['{user_name}']);
  });

  it('tag literals are atomic with inner text as separate tokens', () => {
    const r = computeDiff('<b>Start</b>', '<strong>Start</strong>', { mode: 'readable' });
    expect(r.ops.some((o) => o.type === 'equal' && o.text === 'Start')).toBe(true);
    expect(opTexts(r, 'delete').join('')).toContain('<b>');
    expect(opTexts(r, 'insert').join('')).toContain('<strong>');
  });

  it('identifier keys are atomic', () => {
    const r = computeDiff('UI_BUTTON_START_GAME', 'UI_BUTTON_BEGIN_GAME', { mode: 'readable' });
    expect(opTexts(r, 'delete')).toEqual(['UI_BUTTON_START_GAME']);
    expect(opTexts(r, 'insert')).toEqual(['UI_BUTTON_BEGIN_GAME']);
  });

  it('CJK edits replace whole CJK tokens without char shards', () => {
    const r = computeDiff('這是舊的測試句子', '這是新的測試句子', { mode: 'readable' });
    expect(opTexts(r, 'delete')).toEqual(['這是舊的測試句子']);
    expect(opTexts(r, 'insert')).toEqual(['這是新的測試句子']);
    expect(r.ops.every((o) => o.type === 'equal' || o.text.length > 1 || o.kind === 'cjk')).toBe(true);
  });

  it('returns fallback for large rewrites', () => {
    const oldText = 'alpha beta gamma';
    const newText = 'one two three four five six';
    const r = computeDiff(oldText, newText, { mode: 'readable', fallbackRatio: 0.3 });
    expect(r.fallback).toBe(true);
    const html = renderDiffHtml(oldText, newText, { mode: 'readable', fallbackRatio: 0.3 });
    expect(html.fallback).toBe(true);
    expect(html.html).toContain('cat-diff-fallback-banner');
  });
});

describe('cat-diff-engine char mode', () => {
  it('keeps atomic tokens intact in char mode', () => {
    const r = computeDiff('{player_name}', '{user_name}', { mode: 'char' });
    expect(opTexts(r, 'delete')).toEqual(['{player_name}']);
    expect(opTexts(r, 'insert')).toEqual(['{user_name}']);
  });
});
