#!/usr/bin/env node
/**
 * 在本機 Supabase（--local）執行完整 P0 SQL 測試組，逐檔輸出 PASS／FAIL。
 * 不得使用 --linked／production。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

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
];

function runLocalSqlFile(filePath) {
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--local", "-f", filePath],
    { encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 },
  );
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const failed =
    r.status !== 0 ||
    /ERROR:|P0001|LegacyDbQueryUnexpectedStatusError|unexpected status/i.test(out);
  return { status: r.status ?? 1, out, failed };
}

function main() {
  const root = process.cwd();
  const results = [];
  for (const name of TESTS) {
    const filePath = path.join(root, "supabase", "tests", name);
    if (!existsSync(filePath)) {
      console.log(`${name}\tFAIL\tmissing file`);
      results.push({ name, ok: false });
      continue;
    }
    const { failed, out, status } = runLocalSqlFile(filePath);
    const ok = !failed;
    console.log(`${name}\t${ok ? "PASS" : "FAIL"}`);
    if (!ok) {
      const snippet = out
        .split(/\r?\n/)
        .filter((l) => /ERROR|P0001|exception|FAIL|unexpected/i.test(l))
        .slice(0, 12)
        .join("\n");
      console.error(`--- ${name} diagnostics (exit=${status}) ---`);
      console.error(snippet || out.slice(-1500));
    }
    results.push({ name, ok });
  }
  const pass = results.filter((r) => r.ok).length;
  console.log(`SUMMARY\t${pass}/${results.length}`);
  if (pass !== results.length) process.exit(1);
}

main();
