/**
 * 翻譯記憶庫 (TM) — 字串相似度工具
 * 由 app.js 依賴；維持全域以便舊程式碼使用 window.ActiveTmCache / ActiveTbTerms
 */
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    if (a === b) return 0;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateSimilarity(source1, source2) {
    if (!source1 || !source2) return 0;
    const s1 = source1.trim();
    const s2 = source2.trim();
    if (s1 === s2) return 100;
    if (s1.toLowerCase() === s2.toLowerCase()) return 99;

    const distance = levenshtein(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 100;

    const percentage = ((maxLength - distance) / maxLength) * 100;
    return Math.max(0, Math.round(percentage));
}

window.ActiveTmCache = window.ActiveTmCache || [];
window.ActiveTbTerms = window.ActiveTbTerms || [];

// --- TM 比對：「追蹤修訂」式原文差異（目前句段 vs TM 原文）---

/** 避免超長句段造成 O(n*m) 過慢 */
const TM_DIFF_MAX_CHARS = 6000;

/**
 * 字元級 LCS 導出 diff：'equal' | 'delete'（僅目前原文） | 'insert'（僅 TM 原文）
 */
function diffCharsCurrentVsTm(textCurrent, textTm) {
    const a = Array.from(textCurrent || '');
    const b = Array.from(textTm || '');
    const n = a.length;
    const m = b.length;
    if (n === 0 && m === 0) return [];
    const lcs = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            if (a[i] === b[j]) lcs[i][j] = 1 + lcs[i + 1][j + 1];
            else lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const raw = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && a[i] === b[j]) {
            let eq = '';
            while (i < n && j < m && a[i] === b[j]) {
                eq += a[i];
                i++;
                j++;
            }
            raw.push({ type: 'equal', text: eq });
        } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
            raw.push({ type: 'insert', text: b[j++] });
        } else if (i < n) {
            raw.push({ type: 'delete', text: a[i++] });
        } else {
            break;
        }
    }
    return mergeDiffOps(raw);
}

function mergeDiffOps(ops) {
    if (!ops.length) return [];
    const out = [{ type: ops[0].type, text: ops[0].text }];
    for (let k = 1; k < ops.length; k++) {
        const last = out[out.length - 1];
        if (ops[k].type === last.type) last.text += ops[k].text;
        else out.push({ type: ops[k].type, text: ops[k].text });
    }
    return out;
}

function escapeHtmlLite(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 三列：① TM 舊原文（純文字）② 新原文（合併追蹤修訂：增刪標記）③ 新原文（純文字）
 * 無標題；列與列之間僅細線（.tm-track-stack-row + border-top）
 */
function buildTmTrackChangeStackHtml(textCurrent, textTm) {
    const cur = textCurrent || '';
    const tm = textTm || '';
    const row1 = escapeHtmlLite(tm);
    const row3 = escapeHtmlLite(cur);
    let row2 = '';
    if (cur === tm) {
        row2 = row3;
    } else if (cur.length + tm.length > TM_DIFF_MAX_CHARS) {
        row2 = row3;
    } else {
        const parts = diffCharsCurrentVsTm(cur, tm);
        for (const p of parts) {
            const t = escapeHtmlLite(p.text);
            if (p.type === 'equal') row2 += t;
            else if (p.type === 'delete') row2 += '<span class="tm-diff-cur-only">' + t + '</span>';
            else if (p.type === 'insert') row2 += '<span class="tm-diff-tm-only">' + t + '</span>';
        }
    }
    return (
        '<div class="tm-track-stack">' +
        '<div class="tm-track-stack-row">' + row1 + '</div>' +
        '<div class="tm-track-stack-row">' + row2 + '</div>' +
        '<div class="tm-track-stack-row">' + row3 + '</div>' +
        '</div>'
    );
}

/**
 * TM 更新紀錄用：舊譯文 → 新譯文（單行合併追蹤修訂，語意同 buildTmTrackChangeStackHtml 之中列）。
 * 參數：(舊譯, 新譯)；new 對應「目前句段」、old 對應 TM 中原譯文。
 */
function buildTmTargetRevisionDiffHtml(oldTarget, newTarget) {
    const cur = newTarget || '';
    const tm = oldTarget || '';
    if (cur === tm) return escapeHtmlLite(cur);
    if (cur.length + tm.length > TM_DIFF_MAX_CHARS) return escapeHtmlLite(cur);
    const parts = diffCharsCurrentVsTm(cur, tm);
    let html = '';
    for (const p of parts) {
        const t = escapeHtmlLite(p.text);
        if (p.type === 'equal') html += t;
        else if (p.type === 'delete') html += '<span class="tm-diff-cur-only">' + t + '</span>';
        else if (p.type === 'insert') html += '<span class="tm-diff-tm-only">' + t + '</span>';
    }
    return html;
}

window.buildTmTrackChangeStackHtml = buildTmTrackChangeStackHtml;
window.buildTmSourceTrackChangeHtml = buildTmTrackChangeStackHtml;
window.buildTmTargetRevisionDiffHtml = buildTmTargetRevisionDiffHtml;
window.diffCharsCurrentVsTm = diffCharsCurrentVsTm;
