/**
 * Bug #11：TM 連續 ph 佔位錯位 — 靜態驗證 fixMqxliffTmPhSequentialPairs
 * 執行：node scripts/test-mqxliff-tm-ph-sequential.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadScript(path) {
    const src = readFileSync(join(root, path), 'utf8');
    const fn = new Function('global', src + '\n;return global;');
    return fn(globalThis);
}

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.XMLSerializer = dom.window.XMLSerializer;

loadScript('cat-tool/js/xliff-tag-pipeline.js');
loadScript('cat-tool/js/xliff-build-segments.js');

const Xliff = globalThis.CatToolXliffTags;
const BS = globalThis.CatToolXliffBuildSegments;

const SOURCE_INNER = `<source xml:space="preserve"><bpt id="1" rid="1">&lt;mq:rxt displaytext=&quot;&amp;lt;titleLeft&amp;gt;&quot; val=&quot;&amp;lt;titleLeft&amp;gt;&quot;&gt;</bpt>Conduit<ept id="2" rid="1">&lt;/mq:rxt displaytext=&quot;&amp;lt;/titleLeft&amp;gt;&quot; val=&quot;&amp;lt;/titleLeft&amp;gt;&quot;&gt;</ept><bpt id="3" rid="2">&lt;mq:rxt displaytext=&quot;&amp;lt;mainText&amp;gt;&quot; val=&quot;&amp;lt;mainText&amp;gt;&quot;&gt;</bpt>Body<ept id="4" rid="2">&lt;/mq:rxt displaytext=&quot;&amp;lt;/mainText&amp;gt;&quot; val=&quot;&amp;lt;/mainText&amp;gt;&quot;&gt;</ept><bpt id="5" rid="3">&lt;mq:rxt displaytext=&quot;&amp;lt;postScriptLeft&amp;gt;&quot; val=&quot;&amp;lt;postScriptLeft&amp;gt;&quot;&gt;</bpt>Source: <ph id="6">&lt;mq:rxt displaytext=&quot;@SourceName@&quot; val=&quot;@SourceName@&quot; /&gt;</ph><ept id="7" rid="3">&lt;/mq:rxt displaytext=&quot;&amp;lt;/postScriptLeft&amp;gt;&quot; val=&quot;&amp;lt;/postScriptLeft&amp;gt;&quot;&gt;</ept></source>`;

const TARGET_PH_INNER = `<target xml:space="preserve"><ph id="7">&lt;mq:rxt displaytext=&quot;&amp;lt;titleLeft&amp;gt;&quot; val=&quot;&amp;lt;titleLeft&amp;gt;&quot; /&gt;</ph>能量護盾<ph id="8">&lt;mq:rxt displaytext=&quot;&amp;lt;/titleLeft&amp;gt;&quot; val=&quot;&amp;lt;/titleLeft&amp;gt;&quot; /&gt;</ph><ph id="9">&lt;mq:rxt displaytext=&quot;&amp;lt;mainText&amp;gt;&quot; val=&quot;&amp;lt;mainText&amp;gt;&quot; /&gt;</ph>內文<ph id="10">&lt;mq:rxt displaytext=&quot;&amp;lt;/mainText&amp;gt;&quot; val=&quot;&amp;lt;/mainText&amp;gt;&quot; /&gt;</ph><ph id="11">&lt;mq:rxt displaytext=&quot;&amp;lt;postScriptLeft&amp;gt;&quot; val=&quot;&amp;lt;postScriptLeft&amp;gt;&quot; /&gt;</ph>來自：@SourceName@<ph id="12">&lt;mq:rxt displaytext=&quot;&amp;lt;/postScriptLeft&amp;gt;&quot; val=&quot;&amp;lt;/postScriptLeft&amp;gt;&quot; /&gt;</ph></target>`;

const TARGET_BPT_INNER = `<target xml:space="preserve"><bpt id="1" rid="4">&lt;mq:rxt displaytext=&quot;&amp;lt;titleLeft&amp;gt;&quot; val=&quot;&amp;lt;titleLeft&amp;gt;&quot;&gt;</bpt>能量護盾<ept id="2" rid="4">&lt;/mq:rxt displaytext=&quot;&amp;lt;/titleLeft&amp;gt;&quot; val=&quot;&amp;lt;/titleLeft&amp;gt;&quot;&gt;</ept></target>`;

function parseFragment(inner) {
    const doc = dom.window.document.implementation.createDocument(null, 'root', null);
    const wrap = `<root>${inner}</root>`;
    const parsed = new dom.window.DOMParser().parseFromString(wrap, 'text/xml');
    return parsed.documentElement.firstElementChild;
}

function runFix(sourceNode, targetNode) {
    const { text: sourceText, tags: sourceTags } = Xliff.extractTaggedText(sourceNode);
    const { text: targetText, tags: targetTags } = Xliff.extractTaggedText(targetNode);
    const fixFn = BS._testFixMqxliffTmPhSequentialPairs;
    if (!fixFn) throw new Error('missing _testFixMqxliffTmPhSequentialPairs export');
    const newText = fixFn({
        isMqxliffFile: true,
        sourceTags,
        targetTags,
        targetText
    });
    return { sourceText, sourceTags, targetText: newText, targetTags };
}

let failed = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed++;
    } else {
        console.log('OK:', msg);
    }
}

const phResult = runFix(parseFragment(SOURCE_INNER), parseFragment(TARGET_PH_INNER));
assert(phResult.targetText.includes('{1}') && phResult.targetText.includes('{/1}'), 'targetText has {1}{/1}');
assert(phResult.targetText.includes('{2}') && phResult.targetText.includes('{/2}'), 'targetText has {2}{/2}');
assert(!/\{3\}(?!>)/.test(phResult.targetText.replace(/\{\/3\}/g, '')), 'no standalone {3} counter in targetText');
assert(phResult.targetTags.some(t => t.ph === '{/1}' && t.type === 'close'), 'targetTags has {/1} close');
assert(phResult.targetTags.some(t => t.ph === '{2}' && t.type === 'open'), 'targetTags has {2} open');
assert(phResult.targetTags.every(t => t.type !== 'standalone' || t.ph === '{4}'), 'no stray standalone except missing {4}');

const bptBefore = Xliff.extractTaggedText(parseFragment(TARGET_BPT_INNER));
const bptTagsCopy = bptBefore.tags.map(t => ({ ...t }));
const bptTextCopy = bptBefore.text;
const bptFix = BS._testFixMqxliffTmPhSequentialPairs({
    isMqxliffFile: true,
    sourceTags: phResult.sourceTags,
    targetTags: bptTagsCopy,
    targetText: bptTextCopy
});
assert(bptFix === bptTextCopy && bptTagsCopy[0].type === 'open', 'bpt/ept target unchanged (no trigger)');

if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll Bug #11 sequential ph tests passed.');
