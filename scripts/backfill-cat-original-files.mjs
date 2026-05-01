/**
 * 將 cat_files.original_file_base64 搬到 Storage bucket `cat-original-files`，
 * 並寫入 original_file_path、將 original_file_base64 設為 NULL。
 *
 * 前置：已套用 migration `20260503120000_cat_original_files_storage.sql`
 *
 * 環境變數：
 *   SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role>（Dashboard → Project Settings → API）
 *
 * Windows PowerShell 範例：
 *   $env:SUPABASE_URL="https://xxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."
 *   npm run backfill:cat-original-files
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "cat-original-files";

function buildPath(projectId, fileId) {
  return `${projectId}/${fileId}/original`;
}

async function main() {
  if (!url || !key) {
    console.error("缺少 SUPABASE_URL（或 VITE_SUPABASE_URL）或 SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await admin
    .from("cat_files")
    .select("id, project_id, name, original_file_base64, original_file_path");

  if (error) throw error;

  const todo = (rows || []).filter((r) => {
    const b64 = String(r.original_file_base64 ?? "").trim();
    const p = String(r.original_file_path ?? "").trim();
    return b64.length > 0 && p.length === 0;
  });

  console.log(`待回填：${todo.length} 筆（有 base64、無 path）`);

  for (const r of todo) {
    const path = buildPath(r.project_id, r.id);
    const raw = String(r.original_file_base64);
    const buf = Buffer.from(raw, "base64");

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: "application/octet-stream",
      upsert: true,
    });
    if (upErr) {
      console.error(`[跳過] ${r.id} 上傳失敗:`, upErr.message);
      continue;
    }

    const { error: dbErr } = await admin
      .from("cat_files")
      .update({ original_file_path: path, original_file_base64: null })
      .eq("id", r.id);

    if (dbErr) console.error(`[錯誤] ${r.id} DB 更新失敗:`, dbErr.message);
    else console.log(`[完成] ${r.id} → ${path}`);
  }

  console.log("結束。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
