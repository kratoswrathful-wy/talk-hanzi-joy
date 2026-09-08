#!/usr/bin/env node
/**
 * Gate2 維護 ACL 定向 SQL：本機 Supabase 僅。
 * 含本次維護測試＋因 wrapper 直接受影響的 ACL 回歸。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PRODUCTION_REF = "wshsmerltcakffllgyul";

const TESTS = [
  "gate2_maintenance_write_acl_check.sql",
  "p0_cat_workflow_acl_check.sql",
  "p0_pm_assign_participants_check.sql",
  "p0b_acl_harden_check.sql",
];

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
  if (!url) {
    throw new Error(
      `DB_URL missing from supabase status (keys: ${Object.keys(env).join(",")})`,
    );
  }
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

function runSqlFile(dbUrl, filePath) {
  const r = spawnSync(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", filePath],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const failed =
    r.status !== 0 ||
    /ERROR:|P0001|FATAL:|psql: error/i.test(out);
  return { status: r.status ?? 1, out, failed };
}

function main() {
  const which = spawnSync("psql", ["--version"], { encoding: "utf8" });
  if (which.status !== 0) {
    console.error("psql is required for multi-statement local SQL tests");
    process.exit(1);
  }
  console.log(`psql_version\t${(which.stdout || "").trim()}`);

  const dbUrl = resolveDbUrl();
  assertLocalDbUrl(dbUrl);
  console.log("db_target\tlocal_loopback");
  console.log("suite\tgate2_maint_acl_directional");

  const root = process.cwd();
  const results = [];
  for (const name of TESTS) {
    const filePath = path.join(root, "supabase", "tests", name);
    if (!existsSync(filePath)) {
      console.log(`${name}\tFAIL\tmissing file`);
      results.push({ name, ok: false });
      continue;
    }
    const { failed, out } = runSqlFile(dbUrl, filePath);
    const ok = !failed;
    console.log(`${name}\t${ok ? "PASS" : "FAIL"}`);
    if (!ok) {
      const snippet = out
        .split(/\r?\n/)
        .filter((l) => /ERROR|P0001|exception|FAIL|FATAL|psql:/i.test(l))
        .slice(0, 40)
        .join("\n");
      console.error(snippet || out.slice(0, 2000));
    }
    results.push({ name, ok });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `summary\t${results.length - failed.length}/${results.length} passed`,
  );
  process.exit(failed.length ? 1 : 0);
}

main();
