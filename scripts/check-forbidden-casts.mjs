#!/usr/bin/env node
/**
 * 掃描 src 下所有 .ts / .tsx（非測試目錄），偵測 lint 管不到的禁用手法：
 * - `as unknown as`（雙層轉型繞過型別檢查）
 * - `@ts-expect-error`（壓制編譯器錯誤）
 *
 * 註解內提及這些字串不計入（僅掃描每行 `//` 前的程式碼區段）。
 * 記名白名單見 WHITELIST；其餘命中即非 0 結束，供 CI 擋關。
 *
 * 用法：node scripts/check-forbidden-casts.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");
const TARGET_EXT = new Set([".ts", ".tsx"]);

/** @type {{ id: string; fileSuffix: string; pattern: RegExp; reason: string }[]} */
const WHITELIST = [
  {
    id: "color-picker-eyedropper",
    fileSuffix: "components/ColorPicker.tsx",
    pattern: /\(window as unknown as \{ EyeDropper\?:/,
    reason: "EyeDropper 為實驗性瀏覽器 API，尚未列入標準 DOM lib 型別；以 in window 守衛後再讀取建構子",
  },
];

const FORBIDDEN = [
  { id: "as-unknown-as", pattern: /as\s+unknown\s+as/ },
  { id: "ts-expect-error", pattern: /@ts-expect-error\b/ },
];

/** @param {string} line */
function isCommentOnlyLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith("//")) return true;
  if (t.startsWith("/**") || t.startsWith("*/")) return true;
  // JSDoc / 區塊註解延續行（`* ...`）；排除 `*=` 賦值
  if (t.startsWith("*") && !t.startsWith("*=")) return true;
  return false;
}

/** @param {string} line */
function codePartOfLine(line) {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = line[i - 1];
    if (!inDouble && !inTemplate && ch === "'" && prev !== "\\") inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"' && prev !== "\\") inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === "`" && prev !== "\\") inTemplate = !inTemplate;
    else if (!inSingle && !inDouble && !inTemplate && ch === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}

/** @param {string} dir */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (TARGET_EXT.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/** @param {string} file @param {string} code @param {RegExp} pattern */
function isWhitelisted(file, code, pattern) {
  const rel = relative(join(import.meta.dirname, ".."), file).replace(/\\/g, "/");
  for (const w of WHITELIST) {
    if (!rel.endsWith(w.fileSuffix)) continue;
    if (w.pattern.test(code)) return w;
  }
  return null;
}

function main() {
  const files = walk(ROOT);
  /** @type {{ file: string; line: number; rule: string; snippet: string; whitelisted?: string }[]} */
  const problems = [];

  for (const file of files) {
    const lines = readFileSync(file, "utf-8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (isCommentOnlyLine(lines[i])) continue;
      const code = codePartOfLine(lines[i]);
      for (const rule of FORBIDDEN) {
        if (!rule.pattern.test(code)) continue;
        const wl = isWhitelisted(file, code, rule.pattern);
        if (wl) continue;
        problems.push({
          file,
          line: i + 1,
          rule: rule.id,
          snippet: code.trim().slice(0, 120),
        });
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n偵測到 ${problems.length} 處禁用手法（非測試 src 檔）：\n`);
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line} [${p.rule}] ${p.snippet}`);
    }
    console.error(
      "\n請改用防禦性 fromJson/toJson、單層 `as` 或補齊型別；若確屬必要例外，" +
        "在 scripts/check-forbidden-casts.mjs 的 WHITELIST 記名並註明理由。\n"
    );
    process.exit(1);
  }

  const wlNote = WHITELIST.length
    ? `（白名單 ${WHITELIST.length} 處：${WHITELIST.map((w) => w.id).join("、")}）`
    : "";
  console.log(`禁用手法檢查通過（掃描 ${files.length} 個 src .ts/.tsx 檔案，0 處命中 ${wlNote}）。`.trim());
}

main();
