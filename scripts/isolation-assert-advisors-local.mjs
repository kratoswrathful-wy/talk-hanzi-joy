#!/usr/bin/env node
/**
 * 解析 `supabase db advisors --local --type security -o json`，
 * 僅允許既有受控 ERROR：cases_visible／fees_visible security_definer_view。
 */
import { spawnSync } from "node:child_process";

const ALLOWED_ERROR_VIEWS = new Set(["cases_visible", "fees_visible"]);

function main() {
  const r = spawnSync(
    "npx",
    ["supabase", "db", "advisors", "--local", "--type", "security", "-o", "json"],
    { encoding: "utf8", shell: true, maxBuffer: 30 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    console.error("db advisors failed");
    console.error((r.stderr || r.stdout || "").slice(0, 2000));
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout || "[]");
  } catch {
    console.error("advisors output is not JSON");
    process.exit(1);
  }
  const lints = Array.isArray(parsed)
    ? parsed
    : parsed.lints || parsed.result?.lints || parsed.issues || [];
  const errors = lints.filter(
    (x) => String(x.level || x.severity || "").toUpperCase() === "ERROR",
  );
  const unexpected = [];
  for (const e of errors) {
    const detail = `${e.name || ""} ${e.title || ""} ${e.detail || ""} ${e.metadata?.name || ""} ${JSON.stringify(e)}`;
    const matched = [...ALLOWED_ERROR_VIEWS].some((v) => detail.includes(v));
    const isDefiner =
      /security_definer_view|Security Definer View/i.test(detail);
    if (!(matched && isDefiner)) {
      unexpected.push(detail.slice(0, 240));
    }
  }
  console.log(
    `advisors_security_errors=${errors.length} allowed_definer_views=${ALLOWED_ERROR_VIEWS.size}`,
  );
  if (unexpected.length) {
    console.error("UNEXPECTED_ADVISOR_ERRORS");
    for (const u of unexpected) console.error(u);
    process.exit(1);
  }
  if (errors.length < 2) {
    console.error(
      `expected at least the two controlled definer-view ERRORs, got ${errors.length}`,
    );
    process.exit(1);
  }
  console.log("advisors_local: PASS (only controlled cases_visible/fees_visible ERROR)");
}

main();
