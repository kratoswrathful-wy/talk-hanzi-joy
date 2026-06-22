;(function (global) {
  'use strict';

  /** Simple LCS-based char diff for plain text */
  function computeCharDiff(oldText, newText) {
    const a = String(oldText || '');
    const b = String(newText || '');
    if (a === b) return [{ type: 'same', text: a }];
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        out.push({ type: 'same', text: a[i] });
        i += 1;
        j += 1;
      } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
        out.push({ type: 'ins', text: b[j] });
        j += 1;
      } else if (i < n) {
        out.push({ type: 'del', text: a[i] });
        i += 1;
      }
    }
    return mergeAdjacent(out);
  }

  function mergeAdjacent(parts) {
    if (!parts.length) return parts;
    const merged = [parts[0]];
    for (let k = 1; k < parts.length; k += 1) {
      const prev = merged[merged.length - 1];
      const cur = parts[k];
      if (prev.type === cur.type) prev.text += cur.text;
      else merged.push(cur);
    }
    return merged;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderDiffHtml(oldText, newText) {
    const parts = computeCharDiff(oldText, newText);
    return parts.map((p) => {
      const esc = escapeHtml(p.text);
      if (p.type === 'del') return `<span class="rev-diff-del">${esc}</span>`;
      if (p.type === 'ins') return `<span class="rev-diff-ins">${esc}</span>`;
      return esc;
    }).join('');
  }

  /**
   * Tokenize text + tag placeholders for tag-aware diff display.
   * Tags are represented as atomic tokens using display text from tag objects.
   */
  function tokenizeWithTags(text, tags) {
    const tokens = [];
    const tagList = Array.isArray(tags) ? tags.slice() : [];
    if (!tagList.length) {
      if (text) tokens.push({ kind: 'text', value: String(text) });
      return tokens;
    }
    let remaining = String(text || '');
    tagList.sort((x, y) => (x.pos || 0) - (y.pos || 0));
    tagList.forEach((tag, idx) => {
      const pos = typeof tag.pos === 'number' ? tag.pos : remaining.length;
      const before = remaining.slice(0, Math.max(0, Math.min(pos, remaining.length)));
      if (before) tokens.push({ kind: 'text', value: before });
      const label = tag.displayText || tag.display || tag.id || `{${idx + 1}}`;
      tokens.push({ kind: 'tag', value: String(label), tag });
      remaining = remaining.slice(Math.max(0, Math.min(pos, remaining.length)));
    });
    if (remaining) tokens.push({ kind: 'text', value: remaining });
    if (!tokens.length && text) tokens.push({ kind: 'text', value: String(text) });
    return tokens;
  }

  function tokensToPlain(tokens) {
    return (tokens || []).map((t) => t.value).join('');
  }

  function renderTagPill(label) {
    const esc = escapeHtml(label);
    return `<span class="tag-pill rev-track-tag-pill">${esc}</span>`;
  }

  function renderDiffTokens(oldTokens, newTokens, showMarks) {
    const oldPlain = tokensToPlain(oldTokens);
    const newPlain = tokensToPlain(newTokens);
    if (!showMarks || oldPlain === newPlain) {
      return newTokens.map((t) => (t.kind === 'tag' ? renderTagPill(t.value) : escapeHtml(t.value))).join('');
    }
    const oldMap = oldTokens.map((t) => t.value);
    const newMap = newTokens.map((t) => t.value);
    const parts = computeCharDiff(oldMap.join('\u0001'), newMap.join('\u0001'));
    const splitParts = [];
    parts.forEach((p) => {
      const chunks = String(p.text).split('\u0001');
      chunks.forEach((c, idx) => {
        if (!c && idx === chunks.length - 1) return;
        splitParts.push({ type: p.type, text: c });
      });
    });
    let ti = 0;
    let html = '';
    splitParts.forEach((p) => {
      const tok = newTokens[ti];
      ti += 1;
      if (!tok) return;
      const inner = tok.kind === 'tag' ? renderTagPill(tok.value) : escapeHtml(tok.value);
      if (p.type === 'del') html += `<span class="rev-diff-del">${inner}</span>`;
      else if (p.type === 'ins') html += `<span class="rev-diff-ins">${inner}</span>`;
      else html += inner;
    });
    while (ti < newTokens.length) {
      const tok = newTokens[ti];
      ti += 1;
      html += tok.kind === 'tag' ? renderTagPill(tok.value) : escapeHtml(tok.value);
    }
    return html;
  }

  function renderSnapshotCell(snapshot, leftSnapshot, showMarks, emptyLabel) {
    if (!snapshot) {
      return `<span class="rev-track-empty">${escapeHtml(emptyLabel || '無快照紀錄')}</span>`;
    }
    const text = snapshot.targetText ?? snapshot.target_text ?? '';
    const tags = snapshot.targetTags ?? snapshot.target_tags ?? [];
    const newTokens = tokenizeWithTags(text, tags);
    if (!leftSnapshot) {
      return newTokens.map((t) => (t.kind === 'tag' ? renderTagPill(t.value) : escapeHtml(t.value))).join('');
    }
    const leftText = leftSnapshot.targetText ?? leftSnapshot.target_text ?? '';
    const leftTags = leftSnapshot.targetTags ?? leftSnapshot.target_tags ?? [];
    const oldTokens = tokenizeWithTags(leftText, leftTags);
    return renderDiffTokens(oldTokens, newTokens, showMarks);
  }

  global.CatRevTrackDiff = {
    computeCharDiff,
    renderDiffHtml,
    renderSnapshotCell,
    escapeHtml,
    tokenizeWithTags,
  };
})(typeof window !== 'undefined' ? window : globalThis);
