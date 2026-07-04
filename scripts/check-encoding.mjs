#!/usr/bin/env node
/**
 * 掃描 src 下所有 .ts / .tsx，偵測「中文被壓成問號」型的編碼損壞
 *（常見成因：Windows PowerShell 預設編碼寫回檔案，非 UTF-8 管線）。
 *
 * 偵測規則：
 * 1. 檔案含 U+FFFD（替代字元，EF BF BD）── 明確的無效 UTF-8 位元組被替換，直接判定損壞。
 * 2. 字串／JSX 文字內容「整段」由 2 個以上的 "?" 組成（例如 "??"、'????'）──
 *    這是中文字被逐字元替換為 "?" 的典型特徵：nullish coalescing（`a ?? b`）與
 *    optional chaining（`a?.b`）皆為程式碼 token，不會出現在引號內、且不會整段僅有問號；
 *    三元運算子的 "?" 也不會被引號包住。
 * 3. 連續 4 個以上的 "?"（不限是否在引號內）── 額外防線，涵蓋未被本規則2 涵蓋的樣式。
 *
 * 用法：node scripts/check-encoding.mjs
 * 找到問題時印出檔案與行號並以非 0 結束，讓 CI 擋關。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");
const TARGET_EXT = new Set([".ts", ".tsx"]);
const FFFD = "\uFFFD";
// 引號（或 JSX 文字邊界的 >、<）之間「整段」為 2 個以上問號。
const QUOTED_ALL_QMARKS = /(["'`>])(\?{2,})(["'`<])/;
const LONG_QMARK_RUN = /\?{4,}/;

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

function main() {
  const files = walk(ROOT);
  /** @type {{ file: string; reason: string; line: number }[]} */
  const problems = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(FFFD)) {
        problems.push({ file, reason: "含 U+FFFD 替代字元（無效 UTF-8 位元組）", line: i + 1 });
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

  if (problems.length > 0) {
    console.error(`\n偵測到 ${problems.length} 處疑似編碼損壞：\n`);
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line} — ${p.reason}`);
    }
    console.error(
      "\n若為誤判（例如程式碼本身合法出現連續問號），請確認後調整 scripts/check-encoding.mjs 的規則；" +
      "若確為編碼損壞，請以正確 UTF-8 管線（非 PowerShell Set-Content／Out-File 預設編碼）還原檔案。\n"
    );
    process.exit(1);
  }

  console.log(`編碼檢查通過（掃描 ${files.length} 個 .ts/.tsx 檔案，0 處異常）。`);
}

main();
