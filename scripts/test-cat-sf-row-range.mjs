/**
 * 與 cat-tool/app.js 內 segmentPassesSfRowRangePure(listIndexZeroBased, rowSpec) 演算法一致（無 DOM）。
 * rowSpec.expr 有值時使用 parseTbRowRanges + isTbRowInRanges；否則沿用 fromVal/toVal。
 * 若 app.js 邏輯變更，請同步更新此檔並重新執行：node scripts/test-cat-sf-row-range.mjs
 */
function parseTbRowRanges(str, defaultStart = 2) {
    const cleaned = String(str || '').replace(/\s+/g, '');
    if (!cleaned) return [{ start: defaultStart, end: Infinity }];
    const ranges = [];
    cleaned.split(',').forEach((token) => {
        if (!token) return;
        if (token.includes('-')) {
            const [a, b] = token.split('-');
            const start = a ? parseInt(a, 10) : defaultStart;
            const end = b ? parseInt(b, 10) : Infinity;
            if (!Number.isFinite(start) || start <= 0) return;
            if (end !== Infinity && (!Number.isFinite(end) || end <= 0)) return;
            ranges.push({ start, end: end === Infinity ? Infinity : Math.max(start, end) });
            return;
        }
        const v = parseInt(token, 10);
        if (Number.isFinite(v) && v > 0) ranges.push({ start: v, end: v });
    });
    return ranges.length ? ranges : [{ start: defaultStart, end: Infinity }];
}

function isTbRowInRanges(rowNumber1Based, ranges) {
    return (ranges || []).some((r) => rowNumber1Based >= r.start && rowNumber1Based <= r.end);
}

function segmentPassesSfRowRangePure(listIndexZeroBased, rowSpec) {
    const enabled = !!(rowSpec && rowSpec.enabled);
    if (!enabled) return true;
    const n = listIndexZeroBased + 1;
    const exclude = !!(rowSpec && rowSpec.exclude);
    const expr = rowSpec.expr != null ? String(rowSpec.expr).trim() : '';
    if (expr) {
        const inside = isTbRowInRanges(n, parseTbRowRanges(expr, 1));
        return exclude ? !inside : inside;
    }
    const a = parseInt(String(rowSpec.fromVal ?? ''), 10);
    const b = parseInt(String(rowSpec.toVal ?? ''), 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const inside = n >= lo && n <= hi;
    return exclude ? !inside : inside;
}

function assert(name, cond) {
    if (!cond) {
        console.error('FAIL:', name);
        process.exit(1);
    }
    console.log('ok:', name);
}

// 未啟用：一律通過
assert('disabled passes all', segmentPassesSfRowRangePure(0, { enabled: false, fromVal: '1', toVal: '1', exclude: false }));

// 3–5 含邊界（legacy from/to）
assert('n=2 idx1 outside', !segmentPassesSfRowRangePure(1, { enabled: true, fromVal: '3', toVal: '5', exclude: false }));
assert('n=3 idx2 inside', segmentPassesSfRowRangePure(2, { enabled: true, fromVal: '3', toVal: '5', exclude: false }));
assert('n=5 idx4 inside', segmentPassesSfRowRangePure(4, { enabled: true, fromVal: '3', toVal: '5', exclude: false }));
assert('n=6 idx5 outside', !segmentPassesSfRowRangePure(5, { enabled: true, fromVal: '3', toVal: '5', exclude: false }));

// 起訖反轉與 min/max 一致
assert('reversed from/to same as 3-5', segmentPassesSfRowRangePure(3, { enabled: true, fromVal: '5', toVal: '3', exclude: false }));

// 排除：範圍外通過、內不通過
assert('exclude outside passes', segmentPassesSfRowRangePure(1, { enabled: true, fromVal: '3', toVal: '5', exclude: true }));
assert('exclude inside fails', !segmentPassesSfRowRangePure(3, { enabled: true, fromVal: '3', toVal: '5', exclude: true }));

// 無效數字 → 不篩（全通過）
assert('invalid from passes', segmentPassesSfRowRangePure(99, { enabled: true, fromVal: '', toVal: '5', exclude: false }));
assert('invalid to passes', segmentPassesSfRowRangePure(99, { enabled: true, fromVal: '3', toVal: 'x', exclude: false }));

// expr 模式（與進階篩選 sfRowRangeExpr 一致，1-based）
assert('expr 3-5 idx1 outside', !segmentPassesSfRowRangePure(1, { enabled: true, expr: '3-5', exclude: false }));
assert('expr 3-5 idx2 inside', segmentPassesSfRowRangePure(2, { enabled: true, expr: '3-5', exclude: false }));
assert('expr list 2,5 idx0 n=1 outside', !segmentPassesSfRowRangePure(0, { enabled: true, expr: '2,5', exclude: false }));
assert('expr list 2,5 idx1 n=2 inside', segmentPassesSfRowRangePure(1, { enabled: true, expr: '2,5', exclude: false }));
assert('expr list 2,5 idx4 n=5 inside', segmentPassesSfRowRangePure(4, { enabled: true, expr: '2,5', exclude: false }));
assert('expr exclude 3-5 n=2 outside', segmentPassesSfRowRangePure(1, { enabled: true, expr: '3-5', exclude: true }));
assert('expr exclude 3-5 n=4 inside fails', !segmentPassesSfRowRangePure(3, { enabled: true, expr: '3-5', exclude: true }));

console.log('\nscripts/test-cat-sf-row-range.mjs: all passed');
