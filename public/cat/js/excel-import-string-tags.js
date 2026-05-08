/**
 * Excel 匯入：Rich Text 萃取之後，於純文字層套用可逆 inline tag（角／方／字面 \\n／{}／自訂正則）。
 * 規格：docs/EXCEL_IMPORT_TAGS_SPEC.md §6、docs/EXCEL_IMPORT_REVERSIBLE_INLINE_TAGS_IMPLEMENTATION_PLAN.md
 * 掛在 window.CatToolExcelImportStringTags。
 */
(function (window) {
    'use strict';

    var MAX_CUSTOM_REGEX_ROWS = 30;
    var MAX_PATTERN_CHARS = 500;
    var MAX_APPLY_CHARS = 120000;

    function validateCustomRegexList(patterns) {
        var errs = [];
        if (!patterns || !patterns.length) return { ok: true, errors: [] };
        patterns.forEach(function (p, idx) {
            var row = idx + 1;
            if (idx >= MAX_CUSTOM_REGEX_ROWS) {
                errs.push('第 ' + row + ' 列：超過上限（' + MAX_CUSTOM_REGEX_ROWS + ' 列）');
                return;
            }
            var s = String(p || '');
            if (s.length > MAX_PATTERN_CHARS) {
                errs.push('第 ' + row + ' 列：超過 ' + MAX_PATTERN_CHARS + ' 字元');
                return;
            }
            try {
                // eslint-disable-next-line no-new
                new RegExp(s, 'g');
            } catch (e) {
                errs.push('第 ' + row + ' 列：' + (e && e.message ? e.message : '無效的正則表達式'));
            }
        });
        return { ok: errs.length === 0, errors: errs };
    }

    function maxTagNum(text, tags) {
        var max = 0;
        var r = /\{\/?(\d+)\}/g;
        var m;
        while ((m = r.exec(text || '')) !== null) {
            var n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
        (tags || []).forEach(function (t) {
            var pn = t.pairNum != null ? +t.pairNum : (t.num != null ? +t.num : 0);
            if (pn > max) max = pn;
        });
        return max;
    }

    function splitPreservingPh(text) {
        return (text || '').split(/(\{\d+\}|\{\/\d+\})/g);
    }

    function isPhToken(part) {
        return /^\{\d+\}$/.test(part) || /^\{\/\d+\}$/.test(part);
    }

    function parseAngleToken(str, i) {
        var gt = str.indexOf('>', i + 1);
        if (gt < 0) return { error: true };
        var raw = str.slice(i, gt + 1);
        var closeM = /^<\/([\w:-]+)[^>]*>$/.exec(raw);
        if (closeM) {
            return { start: i, end: gt + 1, raw: raw, kind: 'angle_close', name: closeM[1] };
        }
        var trimmed = raw.replace(/\s+$/, '');
        if (/\/\s*>$/.test(trimmed)) {
            var sm = /^<([\w:-]+)/.exec(raw);
            return {
                start: i,
                end: gt + 1,
                raw: raw,
                kind: 'angle_sc',
                name: sm ? sm[1] : ''
            };
        }
        var om = /^<([\w:-]+)/.exec(raw);
        if (!om) {
            return { start: i, end: gt + 1, raw: raw, kind: 'angle_lit' };
        }
        return { start: i, end: gt + 1, raw: raw, kind: 'angle_open', name: om[1] };
    }

    function parseSquareToken(str, i) {
        var rb = str.indexOf(']', i + 1);
        if (rb < 0) return { error: true };
        var raw = str.slice(i, rb + 1);
        var inner = raw.slice(1, -1);
        if (inner.charAt(0) === '/') {
            var nm = /^\/([\w:-]+)$/.exec(inner);
            if (!nm) return { start: i, end: rb + 1, raw: raw, kind: 'sq_lit' };
            return { start: i, end: rb + 1, raw: raw, kind: 'sq_close', name: nm[1] };
        }
        if (/^[\w:-]+$/.test(inner)) {
            return { start: i, end: rb + 1, raw: raw, kind: 'sq_open_cand', name: inner };
        }
        return { start: i, end: rb + 1, raw: raw, kind: 'sq_stand', name: inner };
    }

    function parseCurlyToken(str, i) {
        if (str.charAt(i) !== '{') return null;
        var slice = str.slice(i);
        if (/^\{\d+\}/.test(slice)) return null;
        if (/^\{\/\d+\}/.test(slice)) return null;
        var rb = str.indexOf('}', i + 1);
        if (rb < 0) return { error: true };
        var raw = str.slice(i, rb + 1);
        var inner = raw.slice(1, -1);
        if (inner.charAt(0) === '/') {
            var nm = /^\/([\w:-]+)$/.exec(inner);
            if (!nm) return { start: i, end: rb + 1, raw: raw, kind: 'cy_lit' };
            return { start: i, end: rb + 1, raw: raw, kind: 'cy_close', name: nm[1] };
        }
        if (/^[\w:-]+$/.test(inner)) {
            return { start: i, end: rb + 1, raw: raw, kind: 'cy_open_cand', name: inner };
        }
        return { start: i, end: rb + 1, raw: raw, kind: 'cy_stand', name: inner };
    }

    function tokenizeAngleSquareLit(seg, opts) {
        var tokens = [];
        var i = 0;
        while (i < seg.length) {
            if (opts.literalBackslashN && seg.charAt(i) === '\\' && seg.charAt(i + 1) === 'n') {
                tokens.push({ start: i, end: i + 2, raw: '\\n', kind: 'litn' });
                i += 2;
                continue;
            }
            if (opts.angleBracket && seg.charAt(i) === '<') {
                var a = parseAngleToken(seg, i);
                if (a && a.error) return { error: true };
                tokens.push(a);
                i = a.end;
                continue;
            }
            if (opts.squareBracket && seg.charAt(i) === '[') {
                var s = parseSquareToken(seg, i);
                if (s && s.error) return { error: true };
                tokens.push(s);
                i = s.end;
                continue;
            }
            i++;
        }
        return { tokens: tokens };
    }

    function attachAngleDepthBefore(tokens) {
        var depth = 0;
        for (var i = 0; i < tokens.length; i++) {
            tokens[i].angleDepthBefore = depth;
            var k = tokens[i].kind;
            if (k === 'angle_open') depth++;
            else if (k === 'angle_close') depth--;
        }
    }

    function validateAngleStack(tokens) {
        var stack = [];
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.kind === 'angle_open') stack.push({ name: t.name, idx: i });
            else if (t.kind === 'angle_close') {
                // Tolerant matching:
                // If close tag does not match the top-of-stack, treat intervening opens as standalone
                // (e.g. <color=...><SpriteName=...>TEXT</color> where SpriteName has no closing tag).
                if (!stack.length) return false;
                if (stack[stack.length - 1].name !== t.name) {
                    // Pop until we find a matching open; convert popped opens to 'angle_stand'
                    var found = false;
                    while (stack.length) {
                        var top = stack[stack.length - 1];
                        if (top.name === t.name) { found = true; break; }
                        stack.pop();
                        var tok = tokens[top.idx];
                        if (tok && tok.kind === 'angle_open') tok.kind = 'angle_stand';
                    }
                    if (!found) return false;
                }
                stack.pop(); // pop the matching open
            }
        }
        // Tolerant mode: treat trailing unpaired <tag ...> as standalone tokens rather than failing the whole segment.
        while (stack.length) {
            var top = stack.pop();
            var tok = tokens[top.idx];
            if (tok && tok.kind === 'angle_open') tok.kind = 'angle_stand';
        }
        return true;
    }

    function squareOpenIsPaired(tokens, idx) {
        var t0 = tokens[idx];
        var name = t0.name;
        var ad = t0.angleDepthBefore;
        var j;
        for (j = idx + 1; j < tokens.length; j++) {
            var t = tokens[j];
            if (t.kind === 'angle_open') ad++;
            else if (t.kind === 'angle_close') ad--;
            if (ad < t0.angleDepthBefore) return false;
            if (t.kind === 'sq_close' && t.name === name && ad === t0.angleDepthBefore) return true;
        }
        return false;
    }

    function decorateSquarePairing(tokens) {
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            t.sqPaired = false;
            if (t.kind === 'sq_open_cand') {
                t.sqPaired = squareOpenIsPaired(tokens, i);
            }
        }
    }

    /** 僅含 {} token 的區段：以巢狀 stack 尋找對應 `{/name}` */
    function curlyOpenIsPairedSimple(tokens, idx) {
        var name = tokens[idx].name;
        var stack = [];
        var j;
        for (j = idx + 1; j < tokens.length; j++) {
            var t = tokens[j];
            if (t.kind === 'cy_open_cand') stack.push(t.name);
            else if (t.kind === 'cy_close') {
                if (!stack.length) return t.name === name;
                var inner = stack.pop();
                if (inner !== t.name) return false;
            }
        }
        return false;
    }

    function tokenizeCurlyOnly(seg) {
        var tokens = [];
        var i = 0;
        while (i < seg.length) {
            if (seg.charAt(i) === '{') {
                var c = parseCurlyToken(seg, i);
                if (c && c.error) return { error: true };
                if (c) {
                    tokens.push(c);
                    i = c.end;
                    continue;
                }
            }
            i++;
        }
        return { tokens: tokens };
    }

    function decorateCurlyPairing(tokens) {
        for (var i = 0; i < tokens.length; i++) {
            tokens[i].cyPaired = false;
        }
        for (var j = 0; j < tokens.length; j++) {
            if (tokens[j].kind === 'cy_open_cand') {
                tokens[j].cyPaired = curlyOpenIsPairedSimple(tokens, j);
            }
        }
    }

    /** 在不含角／方／litn 的區段內處理 {}（略過 {\d+}{/\d+}） */
    function applyCurlySegment(seg, startNum) {
        var tok = tokenizeCurlyOnly(seg);
        if (tok.error) return { text: seg, nextNum: startNum, newTags: [] };
        var tokens = tok.tokens;
        if (!tokens.length) return { text: seg, nextNum: startNum, newTags: [] };
        decorateCurlyPairing(tokens);
        var stack = [];
        var i;
        for (i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.kind === 'cy_open_cand' && t.cyPaired) stack.push(t.name);
            else if (t.kind === 'cy_close' && t.cyPaired) {
                if (!stack.length || stack[stack.length - 1] !== t.name) {
                    return { text: seg, nextNum: startNum, newTags: [] };
                }
                stack.pop();
            }
        }
        if (stack.length) return { text: seg, nextNum: startNum, newTags: [] };

        var num = startNum;
        var newTags = [];
        var out = '';
        var pos = 0;
        var curlyPairNs = [];
        function shortDisp(kind, name, raw) {
            if (kind === 'cy_stand') return raw.length > 32 ? raw.slice(0, 32) + '…' : raw;
            return '{' + name + '}';
        }
        for (i = 0; i < tokens.length; i++) {
            var tt = tokens[i];
            out += seg.slice(pos, tt.start);
            pos = tt.end;
            if (tt.kind === 'cy_stand' || tt.kind === 'cy_lit') {
                num++;
                var ph0 = '{' + num + '}';
                newTags.push({
                    ph: ph0,
                    xml: tt.raw,
                    display: shortDisp(tt.kind, tt.name, tt.raw),
                    type: 'standalone',
                    pairNum: num,
                    num: num
                });
                out += ph0;
            } else if (tt.kind === 'cy_open_cand' && tt.cyPaired) {
                num++;
                curlyPairNs.push(num);
                var phO = '{' + num + '}';
                newTags.push({
                    ph: phO,
                    xml: tt.raw,
                    display: '{' + tt.name + '}',
                    type: 'open',
                    pairNum: num,
                    num: num
                });
                out += phO;
            } else if (tt.kind === 'cy_close' && tt.cyPaired) {
                var pc = curlyPairNs.pop();
                newTags.push({
                    ph: '{/' + pc + '}',
                    xml: tt.raw,
                    display: '{/' + tt.name + '}',
                    type: 'close',
                    pairNum: pc,
                    num: pc
                });
                out += '{/' + pc + '}';
            } else if (tt.kind === 'cy_open_cand' && !tt.cyPaired) {
                num++;
                var phU = '{' + num + '}';
                newTags.push({
                    ph: phU,
                    xml: tt.raw,
                    display: shortDisp('cy_stand', tt.name, tt.raw),
                    type: 'standalone',
                    pairNum: num,
                    num: num
                });
                out += phU;
            } else if (tt.kind === 'cy_close' && !tt.cyPaired) {
                out += tt.raw;
            }
        }
        out += seg.slice(pos);
        return { text: out, nextNum: num, newTags: newTags };
    }

    function transformAngleSquareLit(seg, startNum, opts) {
        var tok = tokenizeAngleSquareLit(seg, opts);
        if (tok.error) return { text: seg, nextNum: startNum, newTags: [] };
        var tokens = tok.tokens;
        if (!tokens.length) return { text: seg, nextNum: startNum, newTags: [] };

        attachAngleDepthBefore(tokens);
        if (!validateAngleStack(tokens)) {
            return { text: seg, nextNum: startNum, newTags: [] };
        }
        decorateSquarePairing(tokens);

        var stack = [];
        var i;
        for (i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.kind === 'sq_open_cand' && t.sqPaired) stack.push(t.name);
            else if (t.kind === 'sq_close' && t.sqPaired) {
                if (!stack.length || stack[stack.length - 1] !== t.name) {
                    return { text: seg, nextNum: startNum, newTags: [] };
                }
                stack.pop();
            }
        }
        if (stack.length) return { text: seg, nextNum: startNum, newTags: [] };

        var num = startNum;
        var newTags = [];
        var out = '';
        var pos = 0;
        var anglePairNs = [];
        var squarePairNs = [];

        function dispAngle(nm, raw) {
            return raw.length > 36 ? '<' + nm + '>' : raw;
        }

        for (i = 0; i < tokens.length; i++) {
            var tt = tokens[i];
            out += seg.slice(pos, tt.start);
            pos = tt.end;

            if (tt.kind === 'angle_lit') {
                out += tt.raw;
                continue;
            }
            if (tt.kind === 'litn') {
                num++;
                var phN = '{' + num + '}';
                newTags.push({
                    ph: phN,
                    xml: '\\n',
                    display: '[\\\\n]',
                    type: 'standalone',
                    pairNum: num,
                    num: num
                });
                out += phN;
                continue;
            }
            if (tt.kind === 'angle_sc') {
                num++;
                var phS = '{' + num + '}';
                newTags.push({
                    ph: phS,
                    xml: tt.raw,
                    display: dispAngle(tt.name, tt.raw),
                    type: 'standalone',
                    pairNum: num,
                    num: num
                });
                out += phS;
                continue;
            }
            if (tt.kind === 'sq_lit') {
                out += tt.raw;
                continue;
            }
            if (tt.kind === 'sq_stand') {
                num++;
                var phQ = '{' + num + '}';
                var dq = tt.raw.length > 36 ? tt.raw.slice(0, 36) + '…' : tt.raw;
                newTags.push({
                    ph: phQ,
                    xml: tt.raw,
                    display: dq,
                    type: 'standalone',
                    pairNum: num,
                    num: num
                });
                out += phQ;
                continue;
            }
            if (tt.kind === 'sq_open_cand' && tt.sqPaired) {
                num++;
                squarePairNs.push(num);
                var phSo = '{' + num + '}';
                newTags.push({
                    ph: phSo,
                    xml: tt.raw,
                    display: '[' + tt.name + ']',
                    type: 'open',
                    pairNum: num,
                    num: num
                });
                out += phSo;
                continue;
            }
            if (tt.kind === 'sq_close' && tt.sqPaired) {
                var ps = squarePairNs.pop();
                newTags.push({
                    ph: '{/' + ps + '}',
                    xml: tt.raw,
                    display: '[/' + tt.name + ']',
                    type: 'close',
                    pairNum: ps,
                    num: ps
                });
                out += '{/' + ps + '}';
                continue;
            }
            if (tt.kind === 'sq_open_cand' && !tt.sqPaired) {
                num++;
                var phSs = '{' + num + '}';
                newTags.push({
                    ph: phSs,
                    xml: tt.raw,
                    display: '[' + tt.name + ']',
                    type: 'standalone',
                    pairNum: num,
                    num: num
                });
                out += phSs;
                continue;
            }
            if (tt.kind === 'sq_close' && !tt.sqPaired) {
                out += tt.raw;
                continue;
            }
            if (tt.kind === 'angle_open') {
                num++;
                anglePairNs.push(num);
                var phAo = '{' + num + '}';
                newTags.push({
                    ph: phAo,
                    xml: tt.raw,
                    display: dispAngle(tt.name, tt.raw),
                    type: 'open',
                    pairNum: num,
                    num: num
                });
                out += phAo;
                continue;
            }
            if (tt.kind === 'angle_stand') {
                num++;
                var phAs = '{' + num + '}';
                var da = tt.raw.length > 36 ? '<' + tt.name + '>' : tt.raw;
                newTags.push({
                    ph: phAs,
                    xml: tt.raw,
                    display: da,
                    type: 'standalone',
                    pairNum: num,
                    num: num
                });
                out += phAs;
                continue;
            }
            if (tt.kind === 'angle_close') {
                var pa = anglePairNs.pop();
                newTags.push({
                    ph: '{/' + pa + '}',
                    xml: tt.raw,
                    display: '</' + tt.name + '>',
                    type: 'close',
                    pairNum: pa,
                    num: pa
                });
                out += '{/' + pa + '}';
                continue;
            }
        }
        out += seg.slice(pos);
        return { text: out, nextNum: num, newTags: newTags };
    }

    function applyOneRegexStandalone(seg, pattern, startNum) {
        var num = startNum;
        var newTags = [];
        var s = seg;
        var disp = '[re:' + (pattern.length > 24 ? pattern.slice(0, 24) + '…' : pattern) + ']';
        // eslint-disable-next-line no-constant-condition
        while (true) {
            var re;
            try {
                re = new RegExp(pattern, 'g');
            } catch (_) {
                break;
            }
            var m = re.exec(s);
            if (!m) break;
            if (m[0].length === 0) {
                re.lastIndex++;
                continue;
            }
            var inner = m[0];
            num++;
            var ph = '{' + num + '}';
            newTags.push({
                ph: ph,
                xml: inner,
                display: disp,
                type: 'standalone',
                pairNum: num,
                num: num
            });
            s = s.slice(0, m.index) + ph + s.slice(m.index + inner.length);
        }
        return { text: s, nextNum: num, newTags: newTags };
    }

    function mergeOpts(opts) {
        var o = opts || {};
        function pick(k, def) {
            return o[k] === undefined ? def : !!o[k];
        }
        return {
            angleBracket: pick('angleBracket', true),
            squareBracket: pick('squareBracket', true),
            curlyBracket: pick('curlyBracket', true),
            literalBackslashN: pick('literalBackslashN', true),
            customPatterns: Array.isArray(o.customPatterns) ? o.customPatterns.slice() : []
        };
    }

    /**
     * @param {string} text
     * @param {object[]|null} existingTags  Rich Text 既有 tags（可為 null）
     * @param {object} opts  見 mergeOpts；未指定之布林預設為 true（與產品預設勾選一致）
     */
    function applyPipeline(text, existingTags, opts) {
        var merged = mergeOpts(opts);
        var tags = existingTags && existingTags.length ? existingTags.slice() : [];
        var t = text == null ? '' : String(text);
        if (t.length > MAX_APPLY_CHARS) {
            return { text: t, tags: tags.length ? tags : null, skipped: true };
        }

        function runAngleSquareLitPass() {
            var parts = splitPreservingPh(t);
            var n = maxTagNum(t, tags);
            var accTags = [];
            var rebuilt = parts.map(function (part) {
                if (isPhToken(part)) return part;
                var r = transformAngleSquareLit(part, n, merged);
                if (r.newTags.length) {
                    n = r.nextNum;
                    accTags = accTags.concat(r.newTags);
                }
                return r.text;
            });
            t = rebuilt.join('');
            tags = tags.concat(accTags);
        }

        function runCurlyPass() {
            if (!merged.curlyBracket) return;
            var parts = splitPreservingPh(t);
            var n = maxTagNum(t, tags);
            var accTags = [];
            var rebuilt = parts.map(function (part) {
                if (isPhToken(part)) return part;
                var r = applyCurlySegment(part, n);
                if (r.newTags.length) {
                    n = r.nextNum;
                    accTags = accTags.concat(r.newTags);
                }
                return r.text;
            });
            t = rebuilt.join('');
            tags = tags.concat(accTags);
        }

        runAngleSquareLitPass();
        runCurlyPass();

        if (merged.customPatterns && merged.customPatterns.length) {
            var parts2 = splitPreservingPh(t);
            var n2 = maxTagNum(t, tags);
            var acc2 = [];
            var out2 = parts2.map(function (part) {
                if (isPhToken(part)) return part;
                var seg = part;
                var patterns = merged.customPatterns.map(function (p) {
                    return String(p || '').trim();
                }).filter(Boolean);
                patterns.forEach(function (pat) {
                    var r = applyOneRegexStandalone(seg, pat, n2);
                    seg = r.text;
                    n2 = r.nextNum;
                    acc2 = acc2.concat(r.newTags);
                });
                return seg;
            });
            t = out2.join('');
            tags = tags.concat(acc2);
        }

        var has = tags.length > 0;
        return { text: t, tags: has ? tags : null };
    }

    /**
     * Excel 純文字匯出：將譯文內 `{n}`、`{/n}` 依 tags[].xml 還原為匯入前 token。
     * 若某 placeholder 無對應 xml（例如舊資料），保留原字樣。
     */
    function restorePlaceholdersForExport(text, tags) {
        if (text == null) return '';
        var s = String(text);
        if (!tags || !tags.length) return s;
        var map = [];
        for (var i = 0; i < tags.length; i++) {
            var t = tags[i];
            if (!t || !t.ph) continue;
            var xml = t.xml;
            if (xml === undefined || xml === null || xml === '') continue;
            map.push({ ph: String(t.ph), xml: String(xml) });
        }
        map.sort(function (a, b) {
            return b.ph.length - a.ph.length;
        });
        var out = s;
        for (var j = 0; j < map.length; j++) {
            var ph = map[j].ph;
            var xm = map[j].xml;
            out = out.split(ph).join(xm);
        }
        return out;
    }

    window.CatToolExcelImportStringTags = {
        MAX_CUSTOM_REGEX_ROWS: MAX_CUSTOM_REGEX_ROWS,
        MAX_PATTERN_CHARS: MAX_PATTERN_CHARS,
        validateCustomRegexList: validateCustomRegexList,
        applyPipeline: applyPipeline,
        restorePlaceholdersForExport: restorePlaceholdersForExport,
        defaultOpts: function () {
            return {
                angleBracket: true,
                squareBracket: true,
                curlyBracket: true,
                literalBackslashN: true,
                customPatterns: []
            };
        }
    };
})(window);
