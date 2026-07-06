import { describe, it, expect } from 'vitest';
import {
  findTbTermRanges,
  termMatches,
  matchTermInHaystack,
  expandEnglishSurfaceForms,
} from './tb-match-engine.js';

const EN = { sourceLang: 'en' };
const DEFAULT_FLAGS = { caseInsensitive: true, wholeWord: false };

describe('tb-match-engine token boundary (default)', () => {
  it('Layer does not match player', () => {
    expect(termMatches('player', 'Layer', DEFAULT_FLAGS, EN)).toBe(false);
  });

  it('Layer matches Layer.', () => {
    expect(termMatches('Layer.', 'Layer', DEFAULT_FLAGS, EN)).toBe(true);
  });

  it('Layer matches Layers', () => {
    expect(termMatches('Layers', 'Layer', DEFAULT_FLAGS, EN)).toBe(true);
  });

  it('Sion does not match permission', () => {
    expect(termMatches('permission', 'Sion', DEFAULT_FLAGS, EN)).toBe(false);
  });

  it('lat does not match humiliation', () => {
    expect(termMatches('humiliation', 'lat', DEFAULT_FLAGS, EN)).toBe(false);
  });

  it('Game matches Games', () => {
    expect(termMatches('Games', 'Game', DEFAULT_FLAGS, EN)).toBe(true);
  });

  it('Boundary matches Boundaries', () => {
    expect(termMatches('Boundaries', 'Boundary', DEFAULT_FLAGS, EN)).toBe(true);
  });

  it('Apply matches applies / applied / applying', () => {
    for (const h of ['applies', 'applied', 'applying']) {
      expect(termMatches(h, 'Apply', DEFAULT_FLAGS, EN)).toBe(true);
    }
  });

  it('Apply does not match application', () => {
    expect(termMatches('application', 'Apply', DEFAULT_FLAGS, EN)).toBe(false);
  });

  it('press does not match pressure', () => {
    expect(termMatches('pressure', 'press', DEFAULT_FLAGS, EN)).toBe(false);
  });

  it('use does not match user', () => {
    expect(termMatches('user', 'use', DEFAULT_FLAGS, EN)).toBe(false);
  });

  it('Unlock matches unlocks / unlocked / unlocking', () => {
    for (const h of ['unlocks', 'unlocked', 'unlocking']) {
      expect(termMatches(h, 'Unlock', DEFAULT_FLAGS, EN)).toBe(true);
    }
  });

  it('Game Mode matches Game Modes', () => {
    expect(termMatches('Game Modes', 'Game Mode', DEFAULT_FLAGS, EN)).toBe(true);
  });

  it('Power Utility matches Power Utilities', () => {
    expect(termMatches('Power Utilities', 'Power Utility', DEFAULT_FLAGS, EN)).toBe(true);
  });

  it('does not match inside placeholder', () => {
    const text = '{player_name}';
    expect(termMatches(text, 'player', DEFAULT_FLAGS, EN)).toBe(false);
    expect(termMatches(text, 'Layer', DEFAULT_FLAGS, EN)).toBe(false);
    expect(findTbTermRanges(text, 'player', { flags: DEFAULT_FLAGS, ...EN })).toEqual([]);
  });

  it('allowSubstring false blocks substring hits', () => {
    expect(termMatches('player', 'lay', { ...DEFAULT_FLAGS, allowSubstring: false }, EN)).toBe(false);
    expect(termMatches('player', 'Layer', DEFAULT_FLAGS, EN)).toBe(false);
  });

  it('allowSubstring true allows legacy substring hits', () => {
    expect(termMatches('player', 'lay', { ...DEFAULT_FLAGS, allowSubstring: true }, EN)).toBe(true);
  });

  it('reports surface form when morphology hits', () => {
    const hit = matchTermInHaystack('Games', 'Game', DEFAULT_FLAGS, EN);
    expect(hit.matched).toBe(true);
    expect(hit.surfaceForm).toBe('Games');
  });
});

describe('expandEnglishSurfaceForms conservative', () => {
  it('includes plural but not application from Apply', () => {
    const forms = expandEnglishSurfaceForms('Apply');
    expect(forms).toContain('Applies');
    expect(forms).toContain('Applied');
    expect(forms).toContain('Applying');
    expect(forms).not.toContain('application');
  });
});

describe('tb-match-engine CJK substring', () => {
  it('uses substring matching for Chinese source', () => {
    expect(termMatches('這是測試句子', '測試', DEFAULT_FLAGS, { sourceLang: 'zh-TW' })).toBe(true);
  });
});
