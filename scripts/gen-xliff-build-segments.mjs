/**
 * One-off generator: build cat-tool/js/xliff-build-segments.js from xliff-import.js body.
 * Run: node scripts/gen-xliff-build-segments.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcPath = path.join(root, 'cat-tool/js/xliff-import.js');
const outPath = path.join(root, 'cat-tool/js/xliff-build-segments.js');

const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split(/\r?\n/);

// Inner helpers + loop: from "// 讀取原始檔" through closing `});` of transUnits.forEach (line before `if (!segments.length)`)
const startIdx = lines.findIndex((l) => l.includes('// 讀取原始檔的語言對'));
const endIdx = lines.findIndex((l) => l.trim() === 'if (!segments.length) {');
if (startIdx < 0 || endIdx < 0) throw new Error('markers not found');

const inner = lines.slice(startIdx, endIdx).join('\n');

const header = `/**
 * XLIFF／mqxliff／sdlxliff：由 XML 建立與編輯器相同形狀之句段列（供 TM 匯入篩選與 xliff-import 共用）。
 * 載入順序：xliff-tag-pipeline.js → **本檔** → xliff-import.js → xliff-to-tm.js → app.js
 */
(function (global) {
    'use strict';

    function _xliffAncestorFile(el) {
        let n = el;
        while (n) {
            if (n.nodeType === 1 && n.localName === 'file') return n;
            n = n.parentElement;
        }
        return null;
    }

    function isXliff2Document(xml) {
        const root = xml.documentElement;
        if (!root || root.localName !== 'xliff') return false;
        const v = (root.getAttribute('version') || '').trim();
        if (v.startsWith('2')) return true;
        const ns = root.namespaceURI || '';
        return ns.indexOf('document/2.0') !== -1;
    }

    function findAncestorFileEl(unit) {
        let n = unit;
        while (n) {
            if (n.nodeType === 1 && n.localName === 'file') return n;
            n = n.parentElement;
        }
        return null;
    }

    /** XLIFF 2.0：&lt;unit&gt;／&lt;segment&gt; */
    function buildXliff2SegmentRows(xml, fileName) {
        const Xliff = global.CatToolXliffTags;
        if (!Xliff || typeof Xliff.extractTaggedText !== 'function') {
            throw new Error('XLIFF 標籤模組未載入');
        }
        const root = xml.documentElement;
        const rootSrc = (root.getAttribute('srcLang') || root.getAttribute('source-language') || '').trim();
        const rootTgt = (root.getAttribute('trgLang') || root.getAttribute('target-language') || '').trim();
        const fileNode = xml.getElementsByTagName('file')[0];
        const originalSourceLang = fileNode
            ? (fileNode.getAttribute('source-language') || fileNode.getAttribute('srcLang') || rootSrc || '').trim()
            : rootSrc;
        const originalTargetLang = fileNode
            ? (fileNode.getAttribute('target-language') || fileNode.getAttribute('trgLang') || rootTgt || '').trim()
            : rootTgt;
        const segments = [];
        let segCounter = 0;
        function walkUnits(node, acc) {
            if (!node || node.nodeType !== 1) return;
            if (node.localName === 'unit') acc.push(node);
            for (const c of node.children) walkUnits(c, acc);
        }
        const units = [];
        walkUnits(root, units);
        function firstChildEl(parent, localName) {
            if (!parent) return null;
            for (const c of parent.children) {
                if (c.nodeType === 1 && c.localName === localName) return c;
            }
            return null;
        }
        for (const unit of units) {
            const segment = unit.getElementsByTagName('segment')[0];
            if (!segment) continue;
            const sourceNode = segment.getElementsByTagName('source')[0];
            const targetNode = segment.getElementsByTagName('target')[0];
            if (!sourceNode && !targetNode) continue;
            const srcEx = sourceNode ? Xliff.extractTaggedText(sourceNode, {}) : { text: '', tags: [] };
            const tgtEx = targetNode ? Xliff.extractTaggedText(targetNode, {}) : { text: '', tags: [] };
            const sourceText = srcEx.text;
            const targetText = tgtEx.text;
            const sourceTags = srcEx.tags || [];
            const targetTags = tgtEx.tags || [];
            let status = 'unconfirmed';
            if (targetNode) {
                const st = (targetNode.getAttribute('state') || '').toLowerCase();
                if (['translated', 'final', 'signed-off', 'reviewed', 'approved', 'confirmed'].includes(st)) {
                    status = 'confirmed';
                }
            }
            const fe = findAncestorFileEl(unit);
            const writtenFile = fe ? (fe.getAttribute('original') || fe.getAttribute('id') || '').trim() : '';
            const fileSourceLang = fe
                ? (fe.getAttribute('source-language') || fe.getAttribute('srcLang') || '').trim()
                : '';
            const fileTargetLang = fe
                ? (fe.getAttribute('target-language') || fe.getAttribute('trgLang') || '').trim()
                : '';
            const uid = (unit.getAttribute('id') || '').trim() || ('u' + segCounter);
            segments.push({
                sheetName: 'XLIFF',
                rowIdx: segCounter++,
                colSrc: 0,
                colTgt: 0,
                idValue: uid,
                extraValue: '',
                sourceText,
                targetText,
                isLocked: false,
                isLockedSystem: false,
                isLockedUser: false,
                status,
                matchValue: null,
                importMatchKind: null,
                comments: [],
                sourceFormat: 'xliff2',
                confirmationRole: null,
                originalRole: null,
                sourceTags,
                targetTags,
                writtenFile,
                fileSourceLang,
                fileTargetLang
            });
        }
        return { segments, originalSourceLang, originalTargetLang };
    }

    function buildSegmentsFromXliffXml(xml, fileName) {
`;

const footer = `
        return { segments, originalSourceLang, originalTargetLang };
    }

    async function parseXliffFileToSegmentRows(file) {
        const Xliff = global.CatToolXliffTags;
        if (!Xliff || typeof Xliff.extractTaggedText !== 'function') {
            throw new Error('XLIFF 標籤模組未載入（請確認 index.html 已引入 js/xliff-tag-pipeline.js）');
        }
        const text = await file.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const parseError = xml.getElementsByTagName('parsererror')[0];
        if (parseError) {
            throw new Error('無法解析為有效的 XML / XLIFF 檔案');
        }
        const pack = buildSegmentsFromXliffXml(xml, file.name || '');
        return { ...pack, text };
    }

    global.CatToolXliffBuildSegments = {
        buildSegmentsFromXliffXml,
        parseXliffFileToSegmentRows
    };
})(typeof window !== 'undefined' ? window : globalThis);
`;

// Transform extracted inner: use fileName, xliff2 early return, empty trans-units return
let body = inner
    .replace(
        /const transUnits = Array\.from\(xml\.getElementsByTagName\('trans-unit'\)\);\s*\n\s*if \(!transUnits\.length\) \{\s*\n\s*throw new Error\('找不到任何 trans-unit[^']+'\);\s*\n\s*\}/,
        `if (isXliff2Document(xml)) {
            return buildXliff2SegmentRows(xml, fileName);
        }

        const transUnits = Array.from(xml.getElementsByTagName('trans-unit'));
        if (!transUnits.length) {
            const fileNodeEarly = xml.getElementsByTagName('file')[0];
            const osl = fileNodeEarly ? (fileNodeEarly.getAttribute('source-language') || fileNodeEarly.getAttribute('xml:lang') || '') : '';
            const otl = fileNodeEarly ? (fileNodeEarly.getAttribute('target-language') || '') : '';
            return { segments: [], originalSourceLang: osl, originalTargetLang: otl };
        }`
    )
    // Indent inner block +8 spaces for nesting inside buildSegmentsFromXliffXml
    .split('\n')
    .map((line) => (line.length ? '        ' + line : line))
    .join('\n');

// Insert per-TU file meta: after `transUnits.forEach((tu) => {` add fileEl lines
body = body.replace(
    /transUnits\.forEach\(\(tu\) => \{/,
    `transUnits.forEach((tu) => {
            const fileEl = _xliffAncestorFile(tu);
            const writtenFile = fileEl ? (fileEl.getAttribute('original') || fileEl.getAttribute('id') || '').trim() : '';
            const fileSourceLang = fileEl ? (fileEl.getAttribute('source-language') || fileEl.getAttribute('xml:lang') || '').trim() : '';
            const fileTargetLang = fileEl ? (fileEl.getAttribute('target-language') || '').trim() : '';`
);

// Add writtenFile fields to each segments.push({ — match first occurrence pattern sdl multi
body = body.replace(
    /segments\.push\(\{\s*\n\s*sheetName: 'XLIFF',\s*\n\s*rowIdx: segCounter\+\+,[\s\S]*?sourceTags: srcTags,\s*\n\s*targetTags: tgtTags\s*\n\s*\}\);/,
    (m) =>
        m.replace(
            /targetTags: tgtTags\s*\n\s*\}\);/,
            `targetTags: tgtTags,
                            writtenFile,
                            fileSourceLang,
                            fileTargetLang
                        });`
        )
);

// Single mrk sdl push
body = body.replace(
    /segments\.push\(\{\s*\n\s*sheetName: 'XLIFF',\s*\n\s*rowIdx: segCounter\+\+,[\s\S]*?sourceTags: srcTags,\s*\n\s*targetTags: tgtTags\s*\n\s*\}\);\s*\n\s*return;/,
    (m) =>
        m.replace(
            /targetTags: tgtTags\s*\n\s*\}\);\s*\n\s*return;/,
            `targetTags: tgtTags,
                            writtenFile,
                            fileSourceLang,
                            fileTargetLang
                        });
                    return;`
        )
);

// Generic push at end of forEach
body = body.replace(
    /idValue: keyFromContext \|\| fallbackId,\s*\n\s*extraValue,\s*\n\s*sourceText,/,
    `idValue: keyFromContext || fallbackId,
                extraValue,
                sourceText,`
);

body = body.replace(
    /targetTags\s*\n\s*\}\);\s*\n\s*\}\);/,
    `targetTags,
                writtenFile,
                fileSourceLang,
                fileTargetLang
            });
        });`
);

fs.writeFileSync(outPath, header + '\n' + body + '\n' + footer, 'utf8');
console.log('Wrote', outPath);
