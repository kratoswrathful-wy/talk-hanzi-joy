import { describe, it, expect } from 'vitest';
import {
  tokenizeForCatText,
  isAtomicToken,
  isEnglishSourceLang,
  normalizeLangCode,
  tokensToPlain,
} from './cat-text-tokenizer.js';

describe('cat-text-tokenizer', () => {
  it('treats {player_name} as atomic placeholder', () => {
    const tokens = tokenizeForCatText('Hello {player_name}!');
    const ph = tokens.find((t) => t.value === '{player_name}');
    expect(ph).toBeDefined();
    expect(ph.kind).toBe('placeholder');
    expect(isAtomicToken(ph)).toBe(true);
  });

  it('recognizes HTML tags as atomic', () => {
    const tokens = tokenizeForCatText('<b>Start</b>');
    const tags = tokens.filter((t) => t.kind === 'tag');
    expect(tags.map((t) => t.value)).toEqual(['<b>', '</b>']);
    tags.forEach((t) => expect(isAtomicToken(t)).toBe(true));
  });

  it('tokenizes URL and email', () => {
    const tokens = tokenizeForCatText('see https://example.com or test@example.com');
    expect(tokens.some((t) => t.kind === 'url' && t.value === 'https://example.com')).toBe(true);
    expect(tokens.some((t) => t.kind === 'email' && t.value === 'test@example.com')).toBe(true);
  });

  it('tokenizes identifier keys', () => {
    const tokens = tokenizeForCatText('UI_BUTTON_START_GAME');
    expect(tokens[0].kind).toBe('key');
    expect(tokens[0].value).toBe('UI_BUTTON_START_GAME');
  });

  it('tokenizes number+unit tokens', () => {
    expect(tokenizeForCatText('15%')[0]).toMatchObject({ kind: 'number_unit', value: '15%' });
    expect(tokenizeForCatText('3.5s')[0]).toMatchObject({ kind: 'number_unit', value: '3.5s' });
  });

  it('keeps CJK as continuous tokens', () => {
    const tokens = tokenizeForCatText('這是測試句子');
    expect(tokens.filter((t) => t.kind === 'cjk').length).toBe(1);
    expect(tokens.find((t) => t.kind === 'cjk').value).toBe('這是測試句子');
  });

  it('splits Latin words Layer and player', () => {
    const tokens = tokenizeForCatText('Layer player');
    const latin = tokens.filter((t) => t.kind === 'latin');
    expect(latin.map((t) => t.value)).toEqual(['Layer', 'player']);
  });

  it('normalizes English language codes', () => {
    for (const code of ['EN', 'en', 'EN_US', 'en_US', 'en-US', 'EN-US', 'EN_UK', 'en_UK', 'en-UK', 'EN-UK', 'EN_GB', 'en_GB', 'en-GB', 'EN-GB', 'en-AU']) {
      expect(isEnglishSourceLang(code)).toBe(true);
      expect(normalizeLangCode(code)).toBe('en');
    }
  });

  it('round-trips plain text via tokensToPlain', () => {
    const text = 'A {player_name} 15%';
    expect(tokensToPlain(tokenizeForCatText(text))).toBe(text);
  });
});
