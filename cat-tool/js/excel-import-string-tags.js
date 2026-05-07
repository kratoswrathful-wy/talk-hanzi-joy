/**
 * Excel 匯入：Rich Text 萃取之後，於純文字層套用括號／字面 \n／自訂正則，產生 {N}{/N} 與 tags。
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

    /**
     * 成對括號：由 open 找第一個 close；若 inner 含 forbidInner 字元則略過（不支援巢狀 MVP）。
     * open 為 `{` 時，略過已符合內部佔位符之 {\d+}、{\/\d+}。
     */
    function applyGenericPair(seg, openCh, closeCh, forbidInner, startNum, displayOpen) {
        var out = '';
        var i = 0;
        var num = startNum;
        var newTags = [];
        while (i < seg.length) {
            if (seg[i] !== openCh) {
                out += seg[i];
                i++;
                continue;
            }
            if (openCh === '{') {
                var sys = seg.slice(i).match(/^\{\d+\}|\{\/\d+\}/);
                if (sys) {
                    out += sys[0];
                    i += sys[0].length;
                    continue;
                }
            }
            var innerStart = i + 1;
            var j = seg.indexOf(closeCh, innerStart);
            if (j < 0) {
                out += seg[i];
                i++;
                continue;
            }
            var inner = seg.slice(innerStart, j);
            if (forbidInner && inner.indexOf(forbidInner) >= 0) {
                out += seg[i];
                i++;
                continue;
            }
            num++;
            var phO = '{' + num + '}';
            var phC = '{/' + num + '}';
            var dispC = displayOpen.indexOf('[') === 0 ? displayOpen.replace('[', '[/') : ('[/' + displayOpen + ']');
            newTags.push({ ph: phO, xml: '', display: displayOpen, type: 'open', pairNum: num, num: num });
            newTags.push({ ph: phC, xml: '', display: dispC, type: 'close', pairNum: num, num: num });
            out += phO + inner + phC;
            i = j + 1;
        }
        return { text: out, nextNum: num, newTags: newTags };
    }

    function applyLiteralBackslashN(seg, startNum) {
        var out = '';
        var num = startNum;
        var newTags = [];
        for (var i = 0; i < seg.length; i++) {
            if (seg[i] === '\\' && seg[i + 1] === 'n') {
                num++;
                var phO = '{' + num + '}';
                var phC = '{/' + num + '}';
                newTags.push({ ph: phO, xml: '', display: '[\\\\n]', type: 'open', pairNum: num, num: num });
                newTags.push({ ph: phC, xml: '', display: '[/\\\\n]', type: 'close', pairNum: num, num: num });
                out += phO + phC;
                i++;
            } else {
                out += seg[i];
            }
        }
        return { text: out, nextNum: num, newTags: newTags };
    }

    function applyOneRegexGrow(seg, pattern, startNum) {
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
            var phO = '{' + num + '}';
            var phC = '{/' + num + '}';
            newTags.push({ ph: phO, xml: '', display: disp, type: 'open', pairNum: num, num: num });
            newTags.push({ ph: phC, xml: '', display: disp.replace('[', '[/'), type: 'close', pairNum: num, num: num });
            s = s.slice(0, m.index) + phO + inner + phC + s.slice(m.index + inner.length);
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

        function runBracketPass(kind) {
            var parts = splitPreservingPh(t);
            var n = maxTagNum(t, tags);
            var accTags = [];
            var rebuilt = parts.map(function (part, pi) {
                if (isPhToken(part)) return part;
                var seg = part;
                var r;
                if (kind === 'angle' && merged.angleBracket) {
                    r = applyGenericPair(seg, '<', '>', '<', n, '[<>]');
                    seg = r.text;
                    n = r.nextNum;
                    accTags = accTags.concat(r.newTags);
                } else if (kind === 'square' && merged.squareBracket) {
                    r = applyGenericPair(seg, '[', ']', '[', n, '[[]]');
                    seg = r.text;
                    n = r.nextNum;
                    accTags = accTags.concat(r.newTags);
                } else if (kind === 'curly' && merged.curlyBracket) {
                    r = applyGenericPair(seg, '{', '}', '{', n, '[{}]');
                    seg = r.text;
                    n = r.nextNum;
                    accTags = accTags.concat(r.newTags);
                } else if (kind === 'literal' && merged.literalBackslashN) {
                    r = applyLiteralBackslashN(seg, n);
                    seg = r.text;
                    n = r.nextNum;
                    accTags = accTags.concat(r.newTags);
                }
                return seg;
            });
            t = rebuilt.join('');
            tags = tags.concat(accTags);
        }

        runBracketPass('angle');
        runBracketPass('square');
        runBracketPass('curly');
        runBracketPass('literal');

        if (merged.customPatterns && merged.customPatterns.length) {
            var parts2 = splitPreservingPh(t);
            var n2 = maxTagNum(t, tags);
            var acc2 = [];
            var out2 = parts2.map(function (part) {
                if (isPhToken(part)) return part;
                var seg = part;
                var patterns = merged.customPatterns.map(function (p) { return String(p || '').trim(); }).filter(Boolean);
                patterns.forEach(function (pat) {
                    var r = applyOneRegexGrow(seg, pat, n2);
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

    window.CatToolExcelImportStringTags = {
        MAX_CUSTOM_REGEX_ROWS: MAX_CUSTOM_REGEX_ROWS,
        MAX_PATTERN_CHARS: MAX_PATTERN_CHARS,
        validateCustomRegexList: validateCustomRegexList,
        applyPipeline: applyPipeline,
        defaultOpts: function () {
            return { angleBracket: true, squareBracket: true, curlyBracket: true, literalBackslashN: true, customPatterns: [] };
        }
    };
})(window);
