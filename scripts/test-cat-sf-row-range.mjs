/**
 * 與 cat-tool/app.js 內 segmentPassesSfRowRange(listIndexZeroBased) 演算法一致（無 DOM）。
 * 若 app.js 邏輯變更，請同步更新此檔並重新執行：node scripts/test-cat-sf-row-range.mjs
 */
function segmentPassesSfRowRangePure(listIndexZeroBased, { enabled, fromVal, toVal, exclude }) {
    if (!enabled) return true;
    const a = parseInt(String(fromVal ?? ''), 10);
    const b = parseInt(String(toVal ?? ''), 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const n = listIndexZeroBased + 1;
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

// 3–5 含邊界
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

console.log('\nscripts/test-cat-sf-row-range.mjs: all passed');
