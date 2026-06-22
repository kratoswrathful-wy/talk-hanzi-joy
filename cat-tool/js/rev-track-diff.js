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

  function renderTokenInner(tok) {
    if (!tok) return '';
    return tok.kind === 'tag' ? renderTagPill(tok.value) : escapeHtml(tok.value);
  }

  /** Walk diff parts: del from old stream, same/ins from new stream */
  function renderDiffFromCharStreams(oldText, newText) {
    const parts = computeCharDiff(oldText, newText);
    let oi = 0;
    let ni = 0;
    let html = '';
    parts.forEach((p) => {
      const len = p.text.length;
      if (p.type === 'del') {
        const chunk = oldText.slice(oi, oi + len);
        oi += len;
        html += `<span class="rev-diff-del">${escapeHtml(chunk)}</span>`;
      } else if (p.type === 'ins') {
        const chunk = newText.slice(ni, ni + len);
        ni += len;
        html += `<span class="rev-diff-ins">${escapeHtml(chunk)}</span>`;
      } else {
        const chunk = newText.slice(ni, ni + len);
        oi += len;
        ni += len;
        html += escapeHtml(chunk);
      }
    });
    return html;
  }

  function renderDiffTokens(oldTokens, newTokens, showMarks) {
    const oldPlain = tokensToPlain(oldTokens);
    const newPlain = tokensToPlain(newTokens);
    if (!showMarks || oldPlain === newPlain) {
      return newTokens.map((t) => renderTokenInner(t)).join('');
    }
    const hasTags = oldTokens.some((t) => t.kind === 'tag') || newTokens.some((t) => t.kind === 'tag');
    if (!hasTags) {
      return renderDiffFromCharStreams(oldPlain, newPlain);
    }

    const SEP = '\u0001';
    const parts = computeCharDiff(
      oldTokens.map((t) => t.value).join(SEP),
      newTokens.map((t) => t.value).join(SEP),
    );
    const splitParts = [];
    parts.forEach((p) => {
      const chunks = String(p.text).split(SEP);
      chunks.forEach((c, idx) => {
        if (!c && idx === chunks.length - 1) return;
        splitParts.push({ type: p.type, text: c });
      });
    });

    let oi = 0;
    let ni = 0;
    let oOff = 0;
    let nOff = 0;
    let html = '';

    const advanceOld = (len) => {
      const tok = oldTokens[oi];
      const tlen = tok ? tok.value.length : 0;
      oOff += len;
      if (!tok || oOff >= tlen) {
        oi += 1;
        oOff = 0;
      }
    };
    const advanceNew = (len) => {
      const tok = newTokens[ni];
      const tlen = tok ? tok.value.length : 0;
      nOff += len;
      if (!tok || nOff >= tlen) {
        ni += 1;
        nOff = 0;
      }
    };

    splitParts.forEach((p) => {
      const len = p.text.length;
      if (p.type === 'del') {
        const tok = oldTokens[oi];
        const inner = tok && tok.kind === 'tag' ? renderTagPill(tok.value) : escapeHtml(p.text);
        html += `<span class="rev-diff-del">${inner}</span>`;
        advanceOld(len);
      } else if (p.type === 'ins') {
        const tok = newTokens[ni];
        const inner = tok && tok.kind === 'tag' ? renderTagPill(tok.value) : escapeHtml(p.text);
        html += `<span class="rev-diff-ins">${inner}</span>`;
        advanceNew(len);
      } else {
        const tok = newTokens[ni];
        const inner = tok && tok.kind === 'tag' ? renderTagPill(tok.value) : escapeHtml(p.text);
        html += inner;
        advanceOld(len);
        advanceNew(len);
      }
    });

    while (ni < newTokens.length) {
      html += renderTokenInner(newTokens[ni]);
      ni += 1;
      if (oi < oldTokens.length) oi += 1;
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
      return newTokens.map((t) => renderTokenInner(t)).join('');
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
