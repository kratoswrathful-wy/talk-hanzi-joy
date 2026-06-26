/**
 * 清除 cat_segments 中 status=unconfirmed 但 wf_trans_confirmed_at 仍有值的矛盾列。
 *
 * 條件（與 bug-report §2.3 一致）：
 *   status = 'unconfirmed'
 *   AND wf_trans_confirmed_at IS NOT NULL
 *   AND COALESCE(wf_review_revoked_pending, false) = false
 *
 * --apply 時清除 wf_trans_confirmed_at、wf_trans_confirmed_by（保留審稿後再編輯合法中間態）。
 *
 * 預設 dry-run；加 --apply 才寫入。
 *
 * 環境變數：
 *   SUPABASE_URL 或 VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 用法：
 *   node scripts/reconcile-cat-segment-wf-status.mjs
 *   node scripts/reconcile-cat-segment-wf-status.mjs --apply
 *   node scripts/reconcile-cat-segment-wf-status.mjs --file-id <uuid>
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ 缺少環境變數：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fileIdIdx = args.indexOf("--file-id");
const fileIdFilter = fileIdIdx >= 0 ? args[fileIdIdx + 1] : null;

if (fileIdIdx >= 0 && !fileIdFilter) {
  console.error("❌ --file-id 需指定 UUID");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 1000;

async function fetchAllContradictory() {
  const rows = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("cat_segments")
      .select("id, file_id, global_id, status, wf_trans_confirmed_at, wf_trans_confirmed_by, wf_review_revoked_pending")
      .eq("status", "unconfirmed")
      .not("wf_trans_confirmed_at", "is", null)
      .eq("wf_review_revoked_pending", false)
      .order("file_id")
      .order("global_id")
      .range(from, from + PAGE - 1);

    if (fileIdFilter) q = q.eq("file_id", fileIdFilter);

    const { data, error } = await q;
    if (error) throw new Error(`查詢 cat_segments 失敗：${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

async function applyFix(ids) {
  const BATCH = 200;
  let updated = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { error } = await supabase
      .from("cat_segments")
      .update({
        wf_trans_confirmed_at: null,
        wf_trans_confirmed_by: null,
      })
      .in("id", chunk);

    if (error) throw new Error(`更新失敗（batch ${i / BATCH + 1}）：${error.message}`);
    updated += chunk.length;
  }

  return updated;
}

console.log(apply ? "🔧 模式：--apply（將寫入）" : "👀 模式：dry-run（僅統計）");
if (fileIdFilter) console.log(`   限定 file_id = ${fileIdFilter}`);

const rows = await fetchAllContradictory();
console.log(`\n📊 矛盾列總數：${rows.length}`);

if (rows.length === 0) {
  console.log("✅ 無需修復。");
  process.exit(0);
}

/** file_id → count */
const byFile = {};
for (const r of rows) {
  byFile[r.file_id] = (byFile[r.file_id] || 0) + 1;
}

const fileIds = Object.keys(byFile);
console.log(`   涉及 ${fileIds.length} 個檔案`);

const { data: files } = await supabase
  .from("cat_files")
  .select("id, name")
  .in("id", fileIds.slice(0, 500));

const nameById = Object.fromEntries((files || []).map((f) => [f.id, f.name]));

console.log("\n依檔案統計（前 20）：");
const sorted = Object.entries(byFile).sort((a, b) => b[1] - a[1]);
for (const [fid, cnt] of sorted.slice(0, 20)) {
  const name = nameById[fid] || "(未知檔名)";
  console.log(`  ${cnt.toString().padStart(5)}  ${name}  [${fid}]`);
}
if (sorted.length > 20) console.log(`  … 另有 ${sorted.length - 20} 個檔案`);

console.log("\n範例列（前 10）：");
for (const r of rows.slice(0, 10)) {
  console.log(
    `  file=${r.file_id} global_id=${r.global_id} wf_at=${r.wf_trans_confirmed_at}`
  );
}

if (!apply) {
  console.log("\n💡 若要套用修復，請加 --apply");
  process.exit(0);
}

console.log("\n⏳ 套用修復…");
const ids = rows.map((r) => r.id);
const updated = await applyFix(ids);
console.log(`✅ 已更新 ${updated} 列（清除 wf_trans_confirmed_at / wf_trans_confirmed_by）`);

// 驗證
const remaining = await fetchAllContradictory();
if (remaining.length > 0) {
  console.error(`⚠️  仍有 ${remaining.length} 列矛盾，請人工檢查`);
  process.exit(1);
}
console.log("✅ 驗證通過：矛盾列 0 筆");
