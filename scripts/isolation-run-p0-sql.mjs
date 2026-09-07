#!/usr/bin/env node
/**
 * 在本機 Supabase 執行完整 P0 SQL 測試組，逐檔輸出 PASS／FAIL。
 *
 * 注意：`supabase db query --local -f` 對多語句檔（BEGIN/DO/ROLLBACK）會報
 * 「cannot insert multiple commands into a prepared statement」。
 * 故改以 `psql` + 本機 DB URL（來自 supabase status -o env）執行。
 * 不得使用 --linked／production。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PRODUCTION_REF = "wshsmerltcakffllgyul";

const TESTS = [
  "p0_pm_assign_participants_check.sql",
  "p0_admin_create_case_check.sql",
  "p0_apply_case_update_admin_only_check.sql",
  "p0_case_credentials_acl_check.sql",
  "p0_case_field_acl_check.sql",
  "p0_case_mutation_acl_check.sql",
  "p0_cat_workflow_acl_check.sql",
  "p0_definer_view_contract_check.sql",
  "p0_slack_edge_only_contract_check.sql",
  "p0b_acl_harden_check.sql",
  "p0c_translator_eligibility_check.sql",
  "pm_complete_case_translation_check.sql",
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
  // local CLI typically postgresql://...@127.0.0.1:54322/postgres
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
  // 不印出連線字串（含密碼）
  console.log("db_target\tlocal_loopback");

  const root = process.cwd();
  const results = [];
  for (const name of TESTS) {
    const filePath = path.join(root, "supabase", "tests", name);
    if (!existsSync(filePath)) {
      console.log(`${name}\tFAIL\tmissing file`);
      results.push({ name, ok: false });
      continue;
    }
    const { failed, out, status } = runSqlFile(dbUrl, filePath);
    const ok = !failed;
    console.log(`${name}\t${ok ? "PASS" : "FAIL"}`);
    if (!ok) {
      const snippet = out
        .split(/\r?\n/)
        .filter((l) => /ERROR|P0001|exception|FAIL|FATAL|psql:/i.test(l))
        .slice(0, 20)
        .join("\n");
      console.error(`--- ${name} diagnostics (exit=${status}) ---`);
      console.error(snippet || out.slice(-2000));
    }
    results.push({ name, ok });
  }
  const pass = results.filter((r) => r.ok).length;
  console.log(`SUMMARY\t${pass}/${results.length}`);
  if (pass !== results.length) process.exit(1);
}

main();
