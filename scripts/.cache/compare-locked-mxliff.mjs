import fs from 'fs';

const origPath = 'c:/Users/WeiYi/Downloads/I2Loc E50 Shadow Strike FOR TRANSLATORS (1)-en_us-zh_tw-PE.mxliff';
const expPath = 'c:/Users/WeiYi/Downloads/en-zh-TW_Translated_I2Loc E50 Shadow Strike FOR TRANSLATORS (1)-en_us-zh_tw-PE.mxliff';

function extractLockedTUs(xml) {
    const map = new Map();
    const tuRe = /<trans-unit\b[^>]*>/g;
    let m;
    while ((m = tuRe.exec(xml)) !== null) {
        const tag = m[0];
        if (!/m:locked="true"/.test(tag)) continue;
        const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
        if (!id) continue;
        const conf = (tag.match(/m:confirmed="([^"]+)"/) || [])[1] ?? '?';
        map.set(id, { conf });
    }
    return map;
}

function extractTargetState(xml, id) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRe = new RegExp(`<trans-unit\\b[^>]*\\bid="${esc}"[^>]*>[\\s\\S]*?</trans-unit>`);
    const block = xml.match(blockRe);
    if (!block) return null;
    const targetTag = block[0].match(/<target\b[^>]*>/);
    if (!targetTag) return '(no target tag attr)';
    return (targetTag[0].match(/state="([^"]+)"/) || [])[1] ?? '(no state)';
}

const orig = fs.readFileSync(origPath, 'utf8');
const exp = fs.readFileSync(expPath, 'utf8');
const origMap = extractLockedTUs(orig);
const expMap = extractLockedTUs(exp);

console.log('Original locked TUs:', origMap.size);
console.log('Exported locked TUs:', expMap.size);

const confMismatches = [];
const stateMismatches = [];
const missingInExp = [];
const missingInOrig = [];

for (const [id, o] of origMap) {
    const e = expMap.get(id);
    if (!e) {
        missingInExp.push(id);
        continue;
    }
    if (o.conf !== e.conf) confMismatches.push({ id, orig: o.conf, exp: e.conf });
    const origState = extractTargetState(orig, id);
    const expState = extractTargetState(exp, id);
    if (origState !== expState) stateMismatches.push({ id, orig: origState, exp: expState });
}

for (const [id] of expMap) {
    if (!origMap.has(id)) missingInOrig.push(id);
}

const origConfs = {};
for (const v of origMap.values()) origConfs[v.conf] = (origConfs[v.conf] || 0) + 1;
const expConfs = {};
for (const v of expMap.values()) expConfs[v.conf] = (expConfs[v.conf] || 0) + 1;

console.log('\nOriginal locked m:confirmed distribution:', origConfs);
console.log('Exported locked m:confirmed distribution:', expConfs);
console.log('\nm:confirmed mismatches:', confMismatches.length);
console.log('target@state mismatches (locked only):', stateMismatches.length);
console.log('Missing in export:', missingInExp.length);
console.log('Missing in original:', missingInOrig.length);

if (confMismatches.length) {
    console.log('\nFirst 15 m:confirmed mismatches:');
    confMismatches.slice(0, 15).forEach((x) => console.log(`  ${x.id}: orig=${x.orig} exp=${x.exp}`));
}

if (stateMismatches.length) {
    console.log('\nFirst 10 target@state mismatches:');
    stateMismatches.slice(0, 10).forEach((x) => console.log(`  ${x.id}: orig=${x.orig} exp=${x.exp}`));
}

if (!confMismatches.length && !missingInExp.length && !missingInOrig.length) {
    console.log('\nRESULT: All 130 locked segments have identical m:confirmed between original and export.');
}
