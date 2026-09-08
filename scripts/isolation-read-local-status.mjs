#!/usr/bin/env node
/**
 * 從 supabase status -o env 檔讀取本機 URL／keys，寫入 runner 安全暫存（遮罩 log）。
 * 用法：node scripts/isolation-read-local-status.mjs <status.env> <out-dir>
 * 輸出：out-dir/{url.txt,anon.key,service.key}；stdout 僅印 host。
 */
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";

const PRODUCTION_REF = "wshsmerltcakffllgyul";

function parseEnv(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map[t.slice(0, eq).trim()] = val;
  }
  return map;
}

const statusFile = process.argv[2];
const outDir = process.argv[3];
if (!statusFile || !outDir) {
  console.error("usage: isolation-read-local-status.mjs <status.env> <out-dir>");
  process.exit(1);
}

const env = parseEnv(readFileSync(statusFile, "utf8"));
const url = env.API_URL || env.SUPABASE_URL || env.SERVICE_URL;
const anon = env.ANON_KEY || env.SUPABASE_ANON_KEY;
const service = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error(
    `missing keys from status env (have: ${Object.keys(env).join(",")})`,
  );
  process.exit(1);
}
if (url.includes(PRODUCTION_REF)) {
  console.error("refused: production URL in local status");
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(url)) {
  console.error("refused: local status URL is not loopback");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "url.txt"), url, { mode: 0o600 });
writeFileSync(join(outDir, "anon.key"), anon, { mode: 0o600 });
writeFileSync(join(outDir, "service.key"), service, { mode: 0o600 });
try {
  chmodSync(join(outDir, "anon.key"), 0o600);
  chmodSync(join(outDir, "service.key"), 0o600);
} catch {
  /* ignore on some FS */
}

const host = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
console.log(`local_api_host=${host}`);
console.log("keys_captured=masked");
