/**
 * Bug #9：mqxliff bpt/ept 內 mq:rxt href 匯出編碼 — 靜態斷言（無 DOM）。
 * 執行：node scripts/test-mqxliff-bpt-href-export.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pipelinePath = join(__dirname, '../cat-tool/js/xliff-tag-pipeline.js');
const pipelineSrc = readFileSync(pipelinePath, 'utf8');

function extractFunction(src, name) {
    const start = src.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`missing ${name}`);
    let depth = 0;
    let began = false;
    for (let i = start; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') { depth++; began = true; }
        else if (ch === '}') {
            depth--;
            if (began && depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error(`unclosed ${name}`);
}

const collapseSrc = extractFunction(pipelineSrc, 'collapseAmpEntitiesRepeated');
const skipSrc = extractFunction(pipelineSrc, 'shouldSkipAmpCollapseForMemoqInline');
const prepareSrc = extractFunction(pipelineSrc, 'prepareRestoredFragmentForXmlParse');
const escapeBareSrc = extractFunction(pipelineSrc, 'escapeMemoqBareCloseForXmlParse');
const escapeAngleSrc = extractFunction(pipelineSrc, 'escapeNonXliffAngleBrackets');
const reconcileNeedSrc = extractFunction(pipelineSrc, 'tagXmlNeedsReconcileFromSource');
const innerSigSrc = extractFunction(pipelineSrc, 'innerEscapedTagSig');
const normReconcileSrc = extractFunction(pipelineSrc, 'normalizeTagXmlForReconcile');

const ctx = {};
const fnBody = `
${collapseSrc}
${skipSrc}
${escapeBareSrc}
${escapeAngleSrc}
${prepareSrc}
${innerSigSrc}
${normReconcileSrc}
${reconcileNeedSrc}
`;
const runner = new Function(fnBody + `
return {
  shouldSkipAmpCollapseForMemoqInline,
  prepareRestoredFragmentForXmlParse,
  tagXmlNeedsReconcileFromSource,
  collapseAmpEntitiesRepeated
};
`);
const api = runner();

const SOURCE_BPT_INNER = '&lt;mq:rxt displaytext="&amp;lt;a href=&amp;quot;https://www.hutch.io/privacy/&amp;quot; rel=&amp;quot;nofollow&amp;quot; target=&amp;quot;_blank&amp;quot;&amp;gt;" val="&amp;lt;a href=&amp;quot;https://www.hutch.io/privacy/&amp;quot; rel=&amp;quot;nofollow&amp;quot; target=&amp;quot;_blank&amp;quot;&amp;gt;"&gt;';
const BROKEN_BPT_INNER = '&lt;mq:rxt displaytext="&lt;a href="https://www.hutch.io/privacy/" rel="nofollow" target="_blank"&gt;" val="&lt;a href="https://www.hutch.io/privacy/" rel="nofollow" target="_blank"&gt;"&gt;';

const fragment = `<bpt id="1" rid="1">${SOURCE_BPT_INNER}</bpt>隱私政策<ept id="2" rid="1">&lt;/mq:rxt displaytext="&amp;lt;/a&amp;gt;" val="&amp;lt;/a&amp;gt;"&gt;</ept>`;

let failed = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed++;
    } else {
        console.log('OK:', msg);
    }
}

assert(api.shouldSkipAmpCollapseForMemoqInline(fragment), 'skip collapse for bpt with &amp;lt;/&amp;quot;');
assert(!api.shouldSkipAmpCollapseForMemoqInline('plain <AI>text'), 'no skip for plain game marker without bpt');

const prepared = api.prepareRestoredFragmentForXmlParse(fragment);
assert(prepared.includes('&amp;lt;'), 'prepared keeps &amp;lt; inside bpt');
assert(prepared.includes('&amp;quot;'), 'prepared keeps &amp;quot; inside bpt');
assert(!/displaytext="&lt;a href="https:/i.test(prepared), 'prepared must not have bare href quotes');

const st = { xml: `<bpt id="1" rid="1">${SOURCE_BPT_INNER}</bpt>` };
const ttBroken = { xml: `<bpt id="1" rid="2">${BROKEN_BPT_INNER}</bpt>` };
const ttGood = { xml: `<bpt id="1" rid="1">${SOURCE_BPT_INNER}</bpt>` };
assert(api.tagXmlNeedsReconcileFromSource(st, ttBroken), 'reconcile when target lost double encoding');
assert(!api.tagXmlNeedsReconcileFromSource(st, ttGood), 'no reconcile when encoding matches');

if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll mqxliff bpt href export checks passed.');
