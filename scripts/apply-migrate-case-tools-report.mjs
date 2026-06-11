/**
 * 依 dry-run 報告套用自研工具遷移（需 SUPABASE_SERVICE_ROLE_KEY）。
 * 用法：node scripts/apply-migrate-case-tools-report.mjs scripts/.cache/migrate-case-tools-report-*.json
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const reportPath = process.argv[2];

if (!reportPath) {
  console.error("用法：node scripts/apply-migrate-case-tools-report.mjs <report.json>");
  process.exit(1);
}
if (!url || !key) {
  console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const raw = await readFile(reportPath, "utf8");
const report = JSON.parse(raw);
const entries = report.entries || [];

const admin = createClient(url, key, { auth: { persistSession: false } });
const applyErrors = [];
let linkedCount = 0;

for (const row of entries) {
  if (row.status !== "would_link") continue;
  const { data, error } = await admin
    .from("cat_files")
    .update({
      related_lms_case_id: row.caseId,
      related_lms_case_title: row.caseTitle,
    })
    .eq("id", row.fileId)
    .is("related_lms_case_id", null)
    .select("id");

  if (error) {
    applyErrors.push(`${row.caseTitle}: cat_files 更新失敗 — ${error.message}`);
    continue;
  }
  if (!data?.length) {
    applyErrors.push(`${row.caseTitle}: 檔案已連結他案或不存在，略過寫入`);
    continue;
  }
  row.status = "linked";
  linkedCount += 1;
  await admin.from("cases").update({ cat_tool_enabled: true }).eq("id", row.caseId);
}

const caseIds = [...new Set(entries.filter((e) => ["linked", "already_linked"].includes(e.status)).map((e) => e.caseId))];
const { data: cases, error: casesErr } = await admin
  .from("cases")
  .select("id, tools")
  .in("id", caseIds);
if (casesErr) throw casesErr;

const stripByCase = new Map();
for (const row of entries) {
  if (!["linked", "already_linked"].includes(row.status)) continue;
  if (!stripByCase.has(row.caseId)) stripByCase.set(row.caseId, new Set());
  stripByCase.get(row.caseId).add(row.toolEntryId);
}

let stripped = 0;
for (const c of cases || []) {
  const stripIds = stripByCase.get(c.id);
  if (!stripIds?.size) continue;
  const tools = Array.isArray(c.tools) ? c.tools : [];
  const nextTools = tools.filter((t) => !stripIds.has(t.id));
  if (nextTools.length === tools.length) continue;
  const { error } = await admin.from("cases").update({ tools: nextTools }).eq("id", c.id);
  if (error) applyErrors.push(`${c.id}: tools[] 移除失敗 — ${error.message}`);
  else stripped += 1;
}

console.log(`已連結新檔案：${linkedCount}`);
console.log(`已移除自研工具列之案件數：${stripped}`);
if (applyErrors.length) {
  console.error("警告／略過：", applyErrors);
  process.exit(1);
}
