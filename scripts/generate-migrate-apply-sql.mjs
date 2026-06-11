import { readFile, writeFile } from "node:fs/promises";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("用法：node scripts/generate-migrate-apply-sql.mjs <report.json> [out.sql]");
  process.exit(1);
}

const esc = (s) => String(s).replace(/'/g, "''");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const entries = report.entries || [];

const wouldLink = entries.filter((e) => e.status === "would_link");
const alreadyLinked = entries.filter((e) => e.status === "already_linked");

let sql = "BEGIN;\n\n-- 1. 寫入 cat_files 連結（僅尚未連結的檔案）\n";
for (const e of wouldLink) {
  sql += `UPDATE cat_files SET related_lms_case_id = '${e.caseId}', related_lms_case_title = '${esc(e.caseTitle)}' WHERE id = '${e.fileId}' AND related_lms_case_id IS NULL;\n`;
}

const caseIds = [...new Set(wouldLink.map((e) => e.caseId))];
if (caseIds.length) {
  sql += `\n-- 2. 啟用 cat_tool_enabled\n`;
  sql += `UPDATE cases SET cat_tool_enabled = true WHERE id IN (${caseIds.map((id) => `'${id}'`).join(", ")});\n`;
}

if (alreadyLinked.length || wouldLink.length) {
  sql += `\n-- 3. 自 cases.tools[] 移除已遷移的自研工具列（already_linked 全移；would_link 僅檔案已成功連到本案者）\n`;
  const alPairs = alreadyLinked
    .map((e) => `('${e.caseId}'::uuid, '${esc(e.toolEntryId)}', NULL::uuid)`)
    .join(",\n  ");
  const wlPairs = wouldLink
    .map((e) => `('${e.caseId}'::uuid, '${esc(e.toolEntryId)}', '${e.fileId}'::uuid)`)
    .join(",\n  ");
  const allPairs = [alPairs, wlPairs].filter(Boolean).join(",\n  ");
  sql += `WITH to_strip(case_id, tool_entry_id, file_id) AS (
  VALUES
  ${allPairs}
),
eligible AS (
  SELECT DISTINCT s.case_id, s.tool_entry_id
  FROM to_strip s
  WHERE s.file_id IS NULL
     OR EXISTS (
       SELECT 1 FROM cat_files f
       WHERE f.id = s.file_id AND f.related_lms_case_id = s.case_id
     )
)
UPDATE cases c
SET tools = COALESCE(
  (
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM (
      SELECT elem, ordinality AS ord
      FROM jsonb_array_elements(c.tools) WITH ORDINALITY AS t(elem, ordinality)
      WHERE NOT EXISTS (
        SELECT 1 FROM eligible e
        WHERE e.case_id = c.id AND elem->>'id' = e.tool_entry_id
      )
    ) filtered
  ),
  '[]'::jsonb
)
WHERE c.id IN (SELECT case_id FROM eligible);\n`;
}

sql += "\nCOMMIT;\n";

const out = process.argv[3] || "scripts/.cache/migrate-apply.sql";
await writeFile(out, sql, "utf8");
console.log(`已寫入 ${out}`);
console.log(
  `would_link=${wouldLink.length} already_linked=${alreadyLinked.length} max_strip_cases=${new Set([...alreadyLinked, ...wouldLink].map((e) => e.caseId)).size}`
);
