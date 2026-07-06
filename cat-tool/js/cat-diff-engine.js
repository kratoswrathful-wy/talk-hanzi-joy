/**
 * CAT readable / char diff engine — W1-A pure functions (no DOM).
 */

import {
  tokenizeForCatText,
  tokensToPlain,
  isAtomicToken,
} from './cat-text-tokenizer.js';

/** @typedef {'equal'|'delete'|'insert'} DiffOpType */

/**
 * @typedef {Object} DiffOp
 * @property {DiffOpType} type
 * @property {string} text
 * @property {import('./cat-text-tokenizer.js').CatTokenKind} [kind]
 */

/**
 * @typedef {Object} DiffResult
 * @property {boolean} fallback
 * @property {DiffOp[]} ops
 * @property {string} oldText
 * @property {string} newText
 * @property {'readable'|'char'} mode
 */

/**
 * @param {import('./cat-text-tokenizer.js').CatToken[]} a
 * @param {import('./cat-text-tokenizer.js').CatToken[]} b
 * @returns {boolean}
 */
function tokensEqual(a, b) {
  return a.value === b.value && a.kind === b.kind;
}

/**
 * @param {DiffOp[]} ops
 * @returns {DiffOp[]}
 */
function mergeDiffOps(ops) {
  if (!ops.length) return [];
  const out = [{ type: ops[0].type, text: ops[0].text, kind: ops[0].kind }];
  for (let i = 1; i < ops.length; i++) {
    const cur = ops[i];
    const last = out[out.length - 1];
    if (cur.type === last.type && cur.kind === last.kind) {
      last.text += cur.text;
    } else {
      out.push({ type: cur.type, text: cur.text, kind: cur.kind });
    }
  }
  return out;
}

/**
 * Token-level LCS diff.
 * @param {import('./cat-text-tokenizer.js').CatToken[]} oldTokens
 * @param {import('./cat-text-tokenizer.js').CatToken[]} newTokens
 * @returns {DiffOp[]}
 */
function diffTokensLcs(oldTokens, newTokens) {
  const n = oldTokens.length;
  const m = newTokens.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (tokensEqual(oldTokens[i], newTokens[j])) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const raw = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && tokensEqual(oldTokens[i], newTokens[j])) {
      const t = oldTokens[i];
      raw.push({ type: 'equal', text: t.value, kind: t.kind });
      i++;
      j++;
    } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) {
      const t = newTokens[j];
      raw.push({ type: 'insert', text: t.value, kind: t.kind });
      j++;
    } else if (i < n) {
      const t = oldTokens[i];
      raw.push({ type: 'delete', text: t.value, kind: t.kind });
      i++;
    } else {
      break;
    }
  }
  return mergeDiffOps(raw);
}

/**
 * Char LCS on plain strings (used inside non-atomic tokens in char mode).
 * @param {string} a
 * @param {string} b
 * @returns {DiffOp[]}
 */
function diffCharsLcs(a, b) {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const n = ac.length;
  const m = bc.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (ac[i] === bc[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ac[i] === bc[j]) {
      raw.push({ type: 'equal', text: ac[i] });
      i++;
      j++;
    } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) {
      raw.push({ type: 'insert', text: bc[j] });
      j++;
    } else if (i < n) {
      raw.push({ type: 'delete', text: ac[i] });
      i++;
    } else {
      break;
    }
  }
  return mergeDiffOps(raw);
}

/**
 * Char mode with atomic tokens kept whole.
 * @param {import('./cat-text-tokenizer.js').CatToken[]} oldTokens
 * @param {import('./cat-text-tokenizer.js').CatToken[]} newTokens
 * @returns {DiffOp[]}
 */
function diffTokensCharAware(oldTokens, newTokens) {
  const tokenOps = diffTokensLcs(oldTokens, newTokens);
  const out = [];
  let oi = 0;
  let ni = 0;
  for (const op of tokenOps) {
    if (op.type === 'equal') {
      out.push(op);
      oi++;
      ni++;
      continue;
    }
    if (op.type === 'delete') {
      const ot = oldTokens[oi];
      if (ot && isAtomicToken(ot)) {
        out.push({ type: 'delete', text: ot.value, kind: ot.kind });
        oi++;
        continue;
      }
      const nt = newTokens[ni];
      if (nt && isAtomicToken(nt) && (!ot || ot.value !== nt.value)) {
        out.push({ type: 'delete', text: ot.value, kind: ot.kind });
        oi++;
        continue;
      }
      if (ot && nt && !isAtomicToken(ot) && !isAtomicToken(nt)) {
        out.push(...diffCharsLcs(ot.value, nt.value).map((x) => ({ ...x, kind: ot.kind })));
        oi++;
        ni++;
        continue;
      }
      out.push({ type: 'delete', text: op.text, kind: op.kind });
      oi++;
      continue;
    }
    if (op.type === 'insert') {
      const nt = newTokens[ni];
      if (nt && isAtomicToken(nt)) {
        out.push({ type: 'insert', text: nt.value, kind: nt.kind });
        ni++;
        continue;
      }
      out.push({ type: 'insert', text: op.text, kind: op.kind });
      ni++;
    }
  }
  return mergeDiffOps(out);
}

/**
 * @param {string} oldText
 * @param {string} newText
 * @param {object} [options]
 * @returns {DiffResult}
 */
function computeDiff(oldText, newText, options = {}) {
  const mode = options.mode === 'char' ? 'char' : 'readable';
  const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : 4000;
  const fallbackRatio = typeof options.fallbackRatio === 'number' ? options.fallbackRatio : 0.55;
  const tokOpts = { lang: options.lang, includeWhitespace: options.includeWhitespace };

  const oldTokens = tokenizeForCatText(oldText || '', tokOpts);
  const newTokens = tokenizeForCatText(newText || '', tokOpts);

  if (oldTokens.length + newTokens.length > maxTokens) {
    return {
      fallback: true,
      ops: [],
      oldText: String(oldText ?? ''),
      newText: String(newText ?? ''),
      mode,
    };
  }

  const ops = mode === 'char'
    ? diffTokensCharAware(oldTokens, newTokens)
    : diffTokensLcs(oldTokens, newTokens);

  const equalCount = ops.filter((o) => o.type === 'equal').length;
  const maxLen = Math.max(oldTokens.length, newTokens.length, 1);
  const minTokensForFallback = typeof options.minTokensForFallback === 'number'
    ? options.minTokensForFallback
    : 4;
  const fallback = maxLen >= minTokensForFallback
    && equalCount / maxLen < 1 - fallbackRatio;

  return {
    fallback,
    ops,
    oldText: String(oldText ?? ''),
    newText: String(newText ?? ''),
    mode,
  };
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtmlLite(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Testable HTML render helper (UI wiring deferred to later phases).
 * @param {string} oldText
 * @param {string} newText
 * @param {object} [options]
 * @returns {{ html: string, fallback: boolean, ops: DiffOp[] }}
 */
function renderDiffHtml(oldText, newText, options = {}) {
  const semantics = options.semantics === 'current-vs-reference' ? 'current-vs-reference' : 'old-vs-new';
  const delClass = semantics === 'current-vs-reference' ? 'tm-diff-cur-only' : 'rev-diff-del';
  const insClass = semantics === 'current-vs-reference' ? 'tm-diff-tm-only' : 'rev-diff-ins';
  const result = computeDiff(oldText, newText, options);

  if (result.fallback) {
    return {
      html: [
        '<div class="cat-diff-fallback-banner">本句修改幅度較大</div>',
        `<div class="cat-diff-fallback-old">${escapeHtmlLite(result.oldText)}</div>`,
        `<div class="cat-diff-fallback-new">${escapeHtmlLite(result.newText)}</div>`,
      ].join(''),
      fallback: true,
      ops: result.ops,
    };
  }

  let html = '';
  for (const op of result.ops) {
    const esc = escapeHtmlLite(op.text);
    if (op.type === 'equal') html += esc;
    else if (op.type === 'delete') html += `<span class="${delClass}">${esc}</span>`;
    else if (op.type === 'insert') html += `<span class="${insClass}">${esc}</span>`;
  }
  return { html, fallback: false, ops: result.ops };
}

const api = {
  computeDiff,
  renderDiffHtml,
  mergeDiffOps,
  diffTokensLcs,
  diffCharsLcs,
  escapeHtmlLite,
};

if (typeof globalThis !== 'undefined') {
  globalThis.CatDiffEngine = api;
}

export {
  computeDiff,
  renderDiffHtml,
  mergeDiffOps,
  diffTokensLcs,
  diffCharsLcs,
  escapeHtmlLite,
};

export default api;
