/**
 * xlsx-rich-tags.js
 * Excel Rich Text (儲存格內多段格式) ↔ {N}/{/N} 佔位符 雙向轉換。
 *
 * 設計規則：
 *  - 以「無 rPr 的 run」或「佔最長比例的 run 樣式」為基準樣式（baseStyle）。
 *  - 僅對「與基準不同」的連續文字加一對 {N}{/N}，不替基準文字額外加 tag。
 *  - tag.xml 欄位存放 rPr 內層 XML，供匯出時還原。
 *  - 與 xliff-tag-pipeline.js 共用同一 {N}/{/N} 數字格式，可通過同一套
 *    validateExportTags 與 buildTaggedHtml UI。
 *
 * 掛在 window.CatToolXlsxRichTags。
 */
(function (window) {
    'use strict';

    /* ── XML 工具 ──────────────────────────────────────────── */

    function escXml(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;');
    }

    function unescXml(s) {
        return (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#10;/g, '\n').replace(/&#13;/g, '\r');
    }

    /* ── rPr 解析 ──────────────────────────────────────────── */

    /**
     * 把 rPr 的內層 XML 字串解析成 style 物件。
     * 只記錄我們關心的屬性：b、i、u、strike、color（RRGGBB）、sz。
     */
    function parseRpr(rprXml) {
        const s = {};
        if (!rprXml) return s;
        if (/<b\s*\/?>/.test(rprXml) && !/<b\s+val="0"/.test(rprXml)) s.b = true;
        if (/<i\s*\/?>/.test(rprXml) && !/<i\s+val="0"/.test(rprXml)) s.i = true;
        if (/<u\s*\/?>/.test(rprXml) && !/<u\s+val="0"/.test(rprXml)) s.u = true;
        if (/<strike\s*\/?>/.test(rprXml) && !/<strike\s+val="0"/.test(rprXml)) s.strike = true;
        const cm = rprXml.match(/<color\s[^>]*rgb="([0-9A-Fa-f]{8})"/);
        if (cm) s.color = cm[1].slice(2); // 去 alpha → RRGGBB
        const szm = rprXml.match(/<sz\s+val="([^"]+)"/);
        if (szm) s.sz = szm[1];
        return s;
    }

    function styleEq(a, b) {
        return a.b === b.b && a.i === b.i && a.u === b.u &&
               a.strike === b.strike && a.color === b.color && a.sz === b.sz;
    }

    function styleToDisplay(s) {
        const parts = [];
        if (s.b)      parts.push('B');
        if (s.i)      parts.push('I');
        if (s.u)      parts.push('U');
        if (s.strike) parts.push('S');
        if (s.color)  parts.push('#' + s.color);
        if (s.sz)     parts.push(s.sz + 'pt');
        return '[' + (parts.length ? parts.join(',') : 'fmt') + ']';
    }

    /* ── Run 解析 ──────────────────────────────────────────── */

    /**
     * 解析 SheetJS cell.r（OOXML 富文字 XML 字串）為 run 陣列。
     * 每個 run：{ text, rprXml, style }
     * 若無多段格式，回傳 null。
     */
    function parseRichRuns(rawR) {
        if (!rawR || typeof rawR !== 'string') return null;
        if (!/<(?:\w+:)?r[\s>]/.test(rawR)) return null;

        const runs = [];
        const rRegex = /<(?:\w+:)?r(?:\s[^>]*)?>(([\s\S])*?)<\/(?:\w+:)?r>/g;
        let m;
        while ((m = rRegex.exec(rawR)) !== null) {
            const inner = m[1];
            const tMatch = inner.match(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/);
            const text = tMatch ? unescXml(tMatch[1]) : '';
            if (!text) continue;
            const rprMatch = inner.match(/<(?:\w+:)?rPr>([\s\S]*?)<\/(?:\w+:)?rPr>/);
            const rprXml = rprMatch ? rprMatch[1] : '';
            const style = parseRpr(rprXml);
            runs.push({ text, rprXml, style });
        }
        return runs.length >= 2 ? runs : null; // 少於 2 個 run 無需 tag
    }

    /**
     * 決定基準樣式（base style）：
     * 優先選「沒有 rPr」的 run 的樣式（即 {}）；
     * 若所有 run 都有 rPr，選文字最長的 run 的樣式。
     */
    function baseStyle(runs) {
        const plain = runs.find(r => !r.rprXml);
        if (plain) return {};
        return runs.reduce((a, b) => (b.text.length > a.text.length ? b : a)).style;
    }

    /* ── 主要匯出 ──────────────────────────────────────────── */

    /**
     * 輸入 SheetJS 的 cell 物件；若含有多段 rPr，
     * 回傳 { text, tags, baseRprXml }；否則回傳 null（不需 tag 化）。
     */
    function extractCellRichTags(cell) {
        if (!cell || !cell.r || typeof cell.r !== 'string') return null;
        const runs = parseRichRuns(cell.r);
        if (!runs) return null;

        const base = baseStyle(runs);

        // 合併相鄰樣式相同的 run
        const merged = [];
        for (const run of runs) {
            const last = merged[merged.length - 1];
            if (last && styleEq(run.style, last.style)) {
                last.text += run.text;
                if (!last.rprXml && run.rprXml) last.rprXml = run.rprXml;
            } else {
                merged.push({ ...run });
            }
        }

        let text = '';
        const tags = [];
        let counter = 0;

        for (const run of merged) {
            if (!styleEq(run.style, base)) {
                counter++;
                const ph = `{${counter}}`;
                const phClose = `{/${counter}}`;
                const disp = styleToDisplay(run.style);
                tags.push({ ph,       xml: run.rprXml, display: disp,               type: 'open',  pairNum: counter, num: counter });
                tags.push({ ph: phClose, xml: '',       display: disp.replace('[', '[/'), type: 'close', pairNum: counter, num: counter });
                text += ph + run.text + phClose;
            } else {
                text += run.text;
            }
        }

        if (!tags.length) return null; // 合併後樣式其實全同

        // 記錄「基準 rPr XML」：若基準 run 有 rPr，匯出時用於還原基準文字格式
        const baseRun = runs.find(r => styleEq(r.style, base));
        const baseRprXml = (baseRun && baseRun.rprXml) ? baseRun.rprXml : '';

        return { text, tags, baseRprXml };
    }

    /**
     * 將含 {N}/{/N} 的 text 與 tags 還原為 OOXML 富文字 XML 字串，
     * 可直接賦值給 SheetJS cell.r。
     *
     * @param {string} text        含佔位符的譯文純文字
     * @param {Array}  tags        tag 陣列（與匯入時相同格式）
     * @param {string} baseRprXml  基準 run 的 rPr 內層 XML（可為空字串）
     */
    function buildRichTextXml(text, tags, baseRprXml) {
        if (!tags || !tags.length) {
            const rpr = baseRprXml ? `<rPr>${baseRprXml}</rPr>` : '';
            return `<r>${rpr}<t xml:space="preserve">${escXml(text)}</t></r>`;
        }

        const tagMap = {};
        tags.forEach(t => { tagMap[t.ph] = t; });

        const parts = text.split(/(\{\/?\d+\})/);
        let xml = '';
        let buffer = '';
        let currentTagXml = null; // rPr of open tag currently active

        const flushBuffer = (rprXml) => {
            if (!buffer) return;
            const rprElem = rprXml ? `<rPr>${rprXml}</rPr>` : (baseRprXml ? `<rPr>${baseRprXml}</rPr>` : '');
            xml += `<r>${rprElem}<t xml:space="preserve">${escXml(buffer)}</t></r>`;
            buffer = '';
        };

        for (const part of parts) {
            const tag = tagMap[part];
            if (!tag) { buffer += part; continue; }
            if (tag.type === 'open') {
                flushBuffer(null);         // 先輸出基準格式文字
                currentTagXml = tag.xml;   // 記錄此對的 rPr
            } else if (tag.type === 'close') {
                flushBuffer(currentTagXml); // 輸出非基準格式文字
                currentTagXml = null;
            }
        }
        flushBuffer(null); // 最後剩餘基準格式文字

        return xml;
    }

    /* ── 公開介面 ─────────────────────────────────────────── */
    window.CatToolXlsxRichTags = {
        extractCellRichTags,
        buildRichTextXml,
        parseRichRuns
    };

})(window);
