/**
 * CAT shared text tokenizer — Diff v2 / TB Match v2 (W1-A).
 * Zero dependency on diff/TB engines or DOM.
 */

/** @typedef {'placeholder'|'tag'|'url'|'email'|'filename'|'key'|'number_unit'|'cjk'|'latin'|'space'|'punct'|'other'} CatTokenKind */

/**
 * @typedef {Object} CatToken
 * @property {CatTokenKind} kind
 * @property {string} value
 * @property {number} start
 * @property {number} end
 */

const ATOMIC_KINDS = new Set([
  'placeholder',
  'tag',
  'url',
  'email',
  'filename',
  'key',
  'number_unit',
]);

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

const RULES = [
  {
    kind: 'placeholder',
    re: /^(?:\{[^{}]+\}|\{\d+\}|%\([^)]+\)[sdif]|%\d*[sdif])/u,
  },
  {
    kind: 'url',
    re: /^(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/iu,
  },
  {
    kind: 'email',
    re: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/u,
  },
  {
    kind: 'tag',
    re: /^<[^>]+>/u,
  },
  {
    kind: 'key',
    re: /^[A-Z][A-Z0-9_]{2,}/u,
  },
  {
    kind: 'filename',
    re: /^[\w.-]+\.(?:txt|xml|json|html|htm|mqxliff|sdlxliff|mxliff|xlsx|csv|md|js|ts|png|jpg|jpeg|gif|webp|po|xliff)/iu,
  },
  {
    kind: 'number_unit',
    re: /^\d+(?:\.\d+)?(?:%|[A-Za-z]{1,6}|\s+[A-Za-z]{1,6})/u,
  },
  {
    kind: 'cjk',
    re: /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/u,
  },
  {
    kind: 'latin',
    re: /^[A-Za-z]+(?:'[A-Za-z]+)?/u,
  },
  {
    kind: 'space',
    re: /^\s+/u,
  },
  {
    kind: 'punct',
    re: /^[^\s\w<>{}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/u,
  },
];

/**
 * @param {string} lang
 * @returns {'en'|'zh'|'ja'|'ko'|'latin'|'und'}
 */
function normalizeLangCode(lang) {
  const raw = String(lang || '').trim();
  if (!raw) return 'und';
  const norm = raw.replace(/_/g, '-').toLowerCase();
  if (norm === 'en' || norm.startsWith('en-')) return 'en';
  if (norm === 'zh' || norm.startsWith('zh-')) return 'zh';
  if (norm === 'ja' || norm.startsWith('ja-')) return 'ja';
  if (norm === 'ko' || norm.startsWith('ko-')) return 'ko';
  if (/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(norm)) return 'latin';
  return 'und';
}

/**
 * @param {string} lang
 * @returns {boolean}
 */
function isEnglishSourceLang(lang) {
  return normalizeLangCode(lang) === 'en';
}

/**
 * @param {CatToken|null|undefined} token
 * @returns {boolean}
 */
function isAtomicToken(token) {
  return !!token && ATOMIC_KINDS.has(token.kind);
}

function isLatinWordToken(token) {
  return !!token && token.kind === 'latin';
}

function isCjkToken(token) {
  return !!token && token.kind === 'cjk';
}

function isPlaceholderToken(token) {
  return !!token && token.kind === 'placeholder';
}

function isTagToken(token) {
  return !!token && token.kind === 'tag';
}

function isUrlOrEmailToken(token) {
  return !!token && (token.kind === 'url' || token.kind === 'email');
}

function isIdentifierKeyToken(token) {
  return !!token && token.kind === 'key';
}

/**
 * @param {string} text
 * @param {{ tags?: unknown[], lang?: string, includeWhitespace?: boolean }} [options]
 * @returns {CatToken[]}
 */
function tokenizeForCatText(text, options) {
  const src = String(text ?? '');
  const includeWhitespace = !options || options.includeWhitespace !== false;
  const tokens = [];
  let pos = 0;

  while (pos < src.length) {
    let matched = false;
    for (const rule of RULES) {
      if (!includeWhitespace && rule.kind === 'space') continue;
      const slice = src.slice(pos);
      const m = rule.re.exec(slice);
      if (!m || m.index !== 0) continue;
      const value = m[0];
      tokens.push({
        kind: rule.kind,
        value,
        start: pos,
        end: pos + value.length,
      });
      pos += value.length;
      matched = true;
      break;
    }
    if (!matched) {
      const ch = src[pos];
      tokens.push({ kind: 'other', value: ch, start: pos, end: pos + 1 });
      pos += 1;
    }
  }
  return tokens;
}

/**
 * @param {CatToken[]} tokens
 * @returns {string}
 */
function tokensToPlain(tokens) {
  return (tokens || []).map((t) => t.value).join('');
}

/**
 * @param {string} text
 * @param {number} offset
 * @param {CatToken[]} [tokens]
 * @returns {CatToken|null}
 */
function mapPlainOffsetToToken(text, offset, tokens) {
  const list = tokens || tokenizeForCatText(text);
  for (const t of list) {
    if (offset >= t.start && offset < t.end) return t;
  }
  return null;
}

const api = {
  tokenizeForCatText,
  normalizeLangCode,
  isEnglishSourceLang,
  isAtomicToken,
  isLatinWordToken,
  isCjkToken,
  isPlaceholderToken,
  isTagToken,
  isUrlOrEmailToken,
  isIdentifierKeyToken,
  tokensToPlain,
  mapPlainOffsetToToken,
  ATOMIC_KINDS,
  CJK_RE,
};

if (typeof globalThis !== 'undefined') {
  globalThis.CatTextTokenizer = api;
}

export {
  tokenizeForCatText,
  normalizeLangCode,
  isEnglishSourceLang,
  isAtomicToken,
  isLatinWordToken,
  isCjkToken,
  isPlaceholderToken,
  isTagToken,
  isUrlOrEmailToken,
  isIdentifierKeyToken,
  tokensToPlain,
  mapPlainOffsetToToken,
  ATOMIC_KINDS,
  CJK_RE,
};

export default api;
