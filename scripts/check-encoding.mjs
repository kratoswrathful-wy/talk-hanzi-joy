#!/usr/bin/env node
/**
 * 掃描 src .ts/.tsx 與 supabase .sql：
 * - 中文被壓成問號（原有規則）
 * - UTF-8 BOM
 * - 常見 UTF-8 誤讀亂碼（Big5/CP950 混入）
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC_ROOT = join(ROOT, "src");
const SQL_DIRS = [
  join(ROOT, "supabase", "tests"),
  join(ROOT, "supabase", "migrations"),
];
const SRC_EXT = new Set([".ts", ".tsx"]);
const FFFD = "\uFFFD";
const BOM = "\uFEFF";
const MOJIBAKE_HINTS = [
  /嚗/,
  /閮/,
  /蝣/,
  /甇/,
  /雿/,
  /銝/,
  /撠/,
  /蝯/,
  /敺/,
  /\u00ef\u00bf\u00bd/,
];
const QUOTED_ALL_QMARKS = /(["'`>])(\?{2,})(["'`<])/;
const LONG_QMARK_RUN = /\?{4,}/;

/** @param {string} dir @param {Set<string>} extensions @param {string[]} out */
function walk(dir, extensions, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, extensions, out);
    else if (extensions.has(extname(entry))) out.push(full);
  }
  return out;
}

/** @param {string} file @param {string} content @param {{ file: string; reason: string; line: number }[]} problems */
function scanContent(file, content, problems) {
  if (content.startsWith(BOM)) {
    problems.push({ file, reason: "含 UTF-8 BOM（檔首 EF BB BF）", line: 1 });
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(FFFD)) {
      problems.push({ file, reason: "含 U+FFFD 替代字元（無效 UTF-8 位元組）", line: i + 1 });
    }
    for (const hint of MOJIBAKE_HINTS) {
      if (hint.test(line)) {
        problems.push({ file, reason: "疑似 UTF-8 亂碼（mojibake 特徵字元）", line: i + 1 });
        break;
      }
    }
    const quotedMatch = QUOTED_ALL_QMARKS.exec(line);
    if (quotedMatch) {
      problems.push({
        file,
        reason: `引號／JSX 文字內整段為問號 "${quotedMatch[2]}"（疑似中文字串被壓成問號）`,
        line: i + 1,
      });
    }
    const longRun = LONG_QMARK_RUN.exec(line);
    if (longRun) {
      problems.push({ file, reason: `連續 ${longRun[0].length} 個 "?"（疑似中文字串被壓成問號）`, line: i + 1 });
    }
  }
}

function main() {
  const files = [
    ...walk(SRC_ROOT, SRC_EXT),
    ...SQL_DIRS.flatMap((d) => walk(d, new Set([".sql"]))),
  ];
  /** @type {{ file: string; reason: string; line: number }[]} */
  const problems = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    scanContent(file, content, problems);
  }

  if (problems.length > 0) {
    console.error(`\n偵測到 ${problems.length} 處疑似編碼損壞：\n`);
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line} — ${p.reason}`);
    }
    process.exit(1);
  }

  console.log(`編碼檢查通過（掃描 ${files.length} 個 .ts/.tsx/.sql 檔案，0 處異常）。`);
}

main();
