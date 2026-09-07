#!/usr/bin/env node
/**
 * 定向：pm_complete_case_translation + deferred dispatch trigger。
 * 僅本機／GitHub runner PG17；不得連 production。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PRODUCTION_REF = "wshsmerltcakffllgyul";
const TEST = "pm_complete_case_translation_check.sql";

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

function resolveDbUrl() {
  if (process.env.ISOLATION_DB_URL) return process.env.ISOLATION_DB_URL.trim();
  const status = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (status.status !== 0) {
    throw new Error(`supabase status failed: ${status.stderr || status.stdout}`);
  }
  const env = parseEnv(status.stdout || "");
  const url = env.DB_URL || env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error("DB_URL missing from supabase status");
  return url;
}

function assertLocalDbUrl(url) {
  if (url.includes(PRODUCTION_REF)) {
    throw new Error("refused: production ref in DB URL");
  }
  if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url) && !/host=127\.0\.0\.1/i.test(url)) {
    throw new Error("refused: DB URL host is not local loopback");
  }
}

function main() {
  const which = spawnSync("psql", ["--version"], { encoding: "utf8" });
  if (which.status !== 0) {
    console.error("psql is required");
    process.exit(1);
  }
  const dbUrl = resolveDbUrl();
  assertLocalDbUrl(dbUrl);
  const filePath = path.join("supabase", "tests", TEST);
  if (!existsSync(filePath)) {
    console.error(`missing ${filePath}`);
    process.exit(1);
  }
  console.log(`running\t${TEST}`);
  const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", filePath], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  process.stdout.write(out);
  const failed = r.status !== 0 || /ERROR:|FATAL:|psql: error/i.test(out);
  if (failed) {
    console.error("FAIL\tpm_complete_directional");
    process.exit(1);
  }
  console.log("PASS\tpm_complete_directional");
}

main();
