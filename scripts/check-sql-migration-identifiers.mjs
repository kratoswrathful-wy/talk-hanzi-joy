#!/usr/bin/env node
/**
 * 最低限度靜態檢查：migration 內常見 PL/pgSQL 變數誤拼（例如 v_patch_clean 宣告卻寫 p_patch_clean）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const MIGRATIONS = join(import.meta.dirname, "..", "supabase", "migrations");
const FORBIDDEN = [
  { pattern: /\bp_patch_clean\b/g, reason: "應使用 v_patch_clean（函式內區域變數）" },
  { pattern: /\bmin\s*\(\s*p2\.id\s*\)/gi, reason: "PostgreSQL 17 無 min(uuid)；改用 order by id::text asc limit 1" },
];

/** @param {string} dir */
function walkSql(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkSql(full, out);
    else if (extname(entry) === ".sql") out.push(full);
  }
  return out;
}

function main() {
  const files = walkSql(MIGRATIONS);
  /** @type {{ file: string; reason: string; match: string }[]} */
  const problems = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const rule of FORBIDDEN) {
      const m = content.match(rule.pattern);
      if (m) {
        problems.push({ file, reason: rule.reason, match: m[0] });
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\nSQL migration 識別字檢查失敗（${problems.length} 處）：\n`);
    for (const p of problems) {
      console.error(`  ${p.file}: 「${p.match}」— ${p.reason}`);
    }
    process.exit(1);
  }

  console.log(`SQL migration 識別字檢查通過（${files.length} 個 .sql 檔案）。`);
}

main();
