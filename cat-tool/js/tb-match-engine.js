/**
 * CAT TB match engine v2 — W1-A pure functions (no DOM).
 */

import {
  tokenizeForCatText,
  normalizeLangCode,
  isEnglishSourceLang,
  ATOMIC_KINDS,
  CJK_RE,
} from './cat-text-tokenizer.js';

/** @typedef {{ start: number, end: number, matchedText: string, surfaceForm?: string }} TbRange */

const NOUN_LIKE_ENDING = /(?:ary|ory|ity|ment|ness|tion|ence|ics)$/i;

/**
 * @param {string} surface
 * @returns {string}
 */
function preserveCase(surface, variantLower) {
  if (surface === surface.toUpperCase() && surface.length > 1) {
    return variantLower.toUpperCase();
  }
  if (surface[0] === surface[0].toUpperCase()) {
    return variantLower.charAt(0).toUpperCase() + variantLower.slice(1);
  }
  return variantLower;
}

/**
 * @param {string} surface
 * @param {Set<string>} out
 */
function addPluralVariants(surface, out) {
  const lower = surface.toLowerCase();
  if (/[sxz]$/i.test(surface) || /(?:ch|sh)$/i.test(surface)) {
    out.add(preserveCase(surface, lower + 'es'));
  } else if (/[^aeiou]y$/i.test(surface)) {
    out.add(preserveCase(surface, lower.slice(0, -1) + 'ies'));
  } else {
    out.add(preserveCase(surface, lower + 's'));
  }
}

/**
 * @param {string} surface
 * @returns {boolean}
 */
function isNounLike(surface) {
  return NOUN_LIKE_ENDING.test(surface);
}

/**
 * @param {string} surface
 * @returns {boolean}
 */
function isVerbLike(surface) {
  if (/[^aeiou]y$/i.test(surface)) return true;
  if (isNounLike(surface)) return false;
  return surface.length >= 5;
}

/**
 * @param {string} surface
 * @param {Set<string>} out
 */
function addVerbVariants(surface, out) {
  const lower = surface.toLowerCase();
  if (/[^aeiou]y$/i.test(surface)) {
    const stem = lower.slice(0, -1);
    out.add(preserveCase(surface, stem + 'ies'));
    out.add(preserveCase(surface, stem + 'ied'));
    out.add(preserveCase(surface, stem + 'ying'));
    return;
  }
  if (/e$/i.test(surface)) {
    out.add(preserveCase(surface, lower + 'd'));
    out.add(preserveCase(surface, lower.slice(0, -1) + 'ing'));
  } else {
    out.add(preserveCase(surface, lower + 'ed'));
    out.add(preserveCase(surface, lower + 'ing'));
  }
  if (!/[sxz]$/i.test(surface) && !/(?:ch|sh)$/i.test(surface)) {
    out.add(preserveCase(surface, lower + 's'));
  }
}

/**
 * Conservative English surface-form whitelist (no arbitrary stem match).
 * @param {string} surface
 * @returns {string[]}
 */
function expandEnglishSurfaceForms(surface) {
  const forms = new Set();
  if (!surface) return [];
  forms.add(surface);
  if (!/^[A-Za-z][A-Za-z']*$/u.test(surface)) return [...forms];

  addPluralVariants(surface, forms);
  if (isVerbLike(surface)) {
    addVerbVariants(surface, forms);
  }
  return [...forms];
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function textHasCjk(text) {
  return CJK_RE.test(text);
}

/**
 * @param {import('./cat-text-tokenizer.js').CatToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
function rangeOverlapsAtomicInterior(tokens, start, end) {
  for (const t of tokens) {
    if (!ATOMIC_KINDS.has(t.kind)) continue;
    if (start < t.end && end > t.start) {
      if (start > t.start || end < t.end) return true;
    }
  }
  return false;
}

/**
 * @param {string} text
 * @param {string} needle
 * @param {{ caseInsensitive?: boolean, wholeWord?: boolean, allowSubstring?: boolean }} flags
 * @param {import('./cat-text-tokenizer.js').CatToken[]} tokens
 * @returns {TbRange[]}
 */
function findSubstringRanges(text, needle, flags, tokens) {
  const ranges = [];
  if (!needle) return ranges;
  const ci = flags.caseInsensitive !== false;
  const ww = !!flags.wholeWord;
  const h = ci ? text.toLowerCase() : text;
  const n = ci ? needle.toLowerCase() : needle;
  let pos = 0;
  while (pos <= h.length) {
    const idx = h.indexOf(n, pos);
    if (idx < 0) break;
    const end = idx + n.length;
    let ok = !rangeOverlapsAtomicInterior(tokens, idx, end);
    if (ok && ww) {
      const before = idx > 0 ? h[idx - 1] : '';
      const after = end < h.length ? h[end] : '';
      ok = (!before || /\W/.test(before)) && (!after || /\W/.test(after));
    }
    if (ok) {
      ranges.push({ start: idx, end, matchedText: text.slice(idx, end) });
    }
    pos = idx + 1;
  }
  return ranges;
}

/**
 * @param {string} haystackToken
 * @param {string[]} candidates
 * @param {boolean} ci
 * @returns {string|null}
 */
function matchCandidateSurface(haystackToken, candidates, ci) {
  const h = ci ? haystackToken.toLowerCase() : haystackToken;
  for (const c of candidates) {
    const n = ci ? c.toLowerCase() : c;
    if (h === n) return c;
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} term
 * @param {object} [options]
 * @returns {TbRange[]}
 */
function findTokenBoundaryRanges(text, term, options = {}) {
  const flags = options.flags || {};
  const ci = flags.caseInsensitive !== false;
  const sourceLang = options.sourceLang || 'und';
  const english = isEnglishSourceLang(sourceLang);

  const hayTokens = tokenizeForCatText(text);
  const termTokens = tokenizeForCatText(term);
  if (!termTokens.length) return [];

  const slotCandidates = termTokens.map((tt) => {
    if (english && tt.kind === 'latin') {
      return expandEnglishSurfaceForms(tt.value);
    }
    return [tt.value];
  });

  const win = termTokens.length;
  const ranges = [];

  for (let i = 0; i <= hayTokens.length - win; i++) {
    const window = hayTokens.slice(i, i + win);
    let matched = true;
    let lastSurface = term;
    for (let j = 0; j < win; j++) {
      const ht = window[j];
      const tt = termTokens[j];
      if (ht.kind !== tt.kind) {
        matched = false;
        break;
      }
      if (ATOMIC_KINDS.has(tt.kind)) {
        const eq = ci ? ht.value.toLowerCase() === tt.value.toLowerCase() : ht.value === tt.value;
        if (!eq) {
          matched = false;
          break;
        }
        continue;
      }
      if (tt.kind === 'latin') {
        const hit = matchCandidateSurface(ht.value, slotCandidates[j], ci);
        if (!hit) {
          matched = false;
          break;
        }
        if (hit !== tt.value) lastSurface = hit;
        continue;
      }
      const eq = ci ? ht.value.toLowerCase() === tt.value.toLowerCase() : ht.value === tt.value;
      if (!eq) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const start = window[0].start;
    const end = window[win - 1].end;
    ranges.push({
      start,
      end,
      matchedText: text.slice(start, end),
      surfaceForm: lastSurface !== term ? lastSurface : undefined,
    });
  }
  return ranges;
}

/**
 * @param {string} text
 * @param {string} term
 * @param {object} [options]
 * @returns {TbRange[]}
 */
function findTbTermRanges(text, term, options = {}) {
  const src = String(text ?? '');
  const needle = String(term ?? '');
  if (!needle) return [];

  const flags = options.flags || {};
  const sourceLang = options.sourceLang || 'und';
  const norm = normalizeLangCode(sourceLang);
  const tokens = tokenizeForCatText(src);

  const allowSubstring = flags.allowSubstring === true;
  const cjkMode = norm === 'zh' || norm === 'ja' || norm === 'ko' || textHasCjk(needle);

  if (allowSubstring || cjkMode) {
    return findSubstringRanges(src, needle, flags, tokens);
  }

  return findTokenBoundaryRanges(src, needle, { flags, sourceLang });
}

/**
 * @param {string} haystack
 * @param {string} needle
 * @param {{ caseInsensitive?: boolean, wholeWord?: boolean, allowSubstring?: boolean }} [flags]
 * @param {object} [options]
 * @returns {boolean}
 */
function termMatches(haystack, needle, flags, options = {}) {
  const ranges = findTbTermRanges(haystack, needle, {
    flags: flags || {},
    sourceLang: options.sourceLang,
  });
  return ranges.length > 0;
}

/**
 * @param {string} haystack
 * @param {string} needle
 * @param {{ caseInsensitive?: boolean, wholeWord?: boolean, allowSubstring?: boolean }} [flags]
 * @param {object} [options]
 * @returns {{ matched: boolean, ranges: TbRange[], surfaceForm?: string }}
 */
function matchTermInHaystack(haystack, needle, flags, options = {}) {
  const ranges = findTbTermRanges(haystack, needle, {
    flags: flags || {},
    sourceLang: options.sourceLang,
  });
  const surfaceForm = ranges.find((r) => r.surfaceForm)?.surfaceForm;
  return {
    matched: ranges.length > 0,
    ranges,
    surfaceForm,
  };
}

const api = {
  findTbTermRanges,
  termMatches,
  matchTermInHaystack,
  expandEnglishSurfaceForms,
  normalizeLangCode,
  isEnglishSourceLang,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TbMatchEngine = api;
}

export {
  findTbTermRanges,
  termMatches,
  matchTermInHaystack,
  expandEnglishSurfaceForms,
};

export default api;
