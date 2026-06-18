/**
 * 批次將所有 CAT 檔案設為「審稿完成」，並對 LMS 連結檔案比對審稿人員。
 *
 * 規則：
 *  - prep 階段未完成的檔案 → 跳過，最後列出
 *  - 有綁定 LMS 案件（related_lms_case_id 非空）的檔案
 *      → 只比對 review 階段的 cat_stage_assignments（以 LMS 案件的 reviewer 為準）
 *        - 刪除不符合現有 reviewer 的審稿指派
 *        - 補齊缺少的審稿指派（呼叫 cat_upsert_review_stage_assignment）
 *        - 翻譯指派完全不動
 *      → 再設 translate + review 階段為 completed
 *  - 其他檔案 → 直接設 translate + review 階段為 completed
 *
 * 僅更新狀態欄位（不新增翻譯指派紀錄）。
 *
 * 預設 dry-run（不寫入）；加 --apply 才套用。
 *
 * 環境變數：
 *   SUPABASE_URL 或 VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 用法：
 *   node scripts/bulk-set-review-completed.mjs
 *   node scripts/bulk-set-review-completed.mjs --apply
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

const supabase = createClient(url, key, { auth: { persistSession: false } });

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// 工具：批次查詢（避免 URL 過長）
// ---------------------------------------------------------------------------
async function queryInBatches(table, column, ids, select = "*", batchSize = 200) {
  const results = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, chunk);
    if (error) throw new Error(`queryInBatches(${table}): ${error.message}`);
    if (data) results.push(...data);
  }
  return results;
}

// ---------------------------------------------------------------------------
// 步驟 1：讀取所有 cat_files（id + related_lms_case_id）
// ---------------------------------------------------------------------------
console.log("📋 讀取所有 CAT 檔案…");
const { data: allFiles, error: filesErr } = await supabase
  .from("cat_files")
  .select("id, name, related_lms_case_id");
if (filesErr) { console.error("❌ 無法讀取 cat_files:", filesErr.message); process.exit(1); }

const fileIds = allFiles.map((f) => f.id);
console.log(`  共 ${fileIds.length} 個檔案`);

// ---------------------------------------------------------------------------
// 步驟 2：讀取所有 cat_file_workflow_stages
// ---------------------------------------------------------------------------
console.log("📋 讀取 workflow stages…");
const allStages = await queryInBatches(
  "cat_file_workflow_stages",
  "file_id",
  fileIds,
  "id, file_id, stage_kind, status"
);

/** file_id → { prep, translate, review } */
const stagesByFile = {};
for (const s of allStages) {
  if (!stagesByFile[s.file_id]) stagesByFile[s.file_id] = {};
  stagesByFile[s.file_id][s.stage_kind] = s;
}

// ---------------------------------------------------------------------------
// 步驟 3：分類
// ---------------------------------------------------------------------------
const skipPrepIncomplete = [];   // prep 存在但未 completed
const lmsFiles = [];             // 有 related_lms_case_id
const plainFiles = [];           // 一般檔案

for (const f of allFiles) {
  const stages = stagesByFile[f.id] || {};
  const prep = stages["prep"];
  if (prep && prep.status !== "completed") {
    skipPrepIncomplete.push(f);
    continue;
  }
  if (f.related_lms_case_id) {
    lmsFiles.push(f);
  } else {
    plainFiles.push(f);
  }
}

console.log(`  一般檔案（直接設完成）：${plainFiles.length}`);
console.log(`  LMS 連結檔案（比對指派後設完成）：${lmsFiles.length}`);
console.log(`  跳過（prep 未完成）：${skipPrepIncomplete.length}`);

// ---------------------------------------------------------------------------
// 步驟 4：處理 LMS 連結檔案的指派比對
// ---------------------------------------------------------------------------

/** 以姓名或 email 查 profile id（快取） */
const profileCache = {};
async function resolveProfileId(name) {
  if (!name || !name.trim()) return null;
  const k = name.trim();
  if (profileCache[k] !== undefined) return profileCache[k];
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .or(`display_name.eq.${k},email.eq.${k}`)
    .limit(1)
    .maybeSingle();
  profileCache[k] = data?.id ?? null;
  return profileCache[k];
}

/** 讀取一個案件的 translator / reviewer / collab_rows / multi_collab */
const caseCache = {};
async function fetchCase(caseId) {
  if (caseCache[caseId]) return caseCache[caseId];
  const { data } = await supabase
    .from("cases")
    .select("id, multi_collab, translator, reviewer, collab_rows")
    .eq("id", caseId)
    .maybeSingle();
  caseCache[caseId] = data ?? null;
  return caseCache[caseId];
}

/**
 * 對一個 LMS 連結檔案比對審稿指派（翻譯指派完全不動）。
 * - 刪除 assignee_user_id 不符合案件現有 reviewer 的審稿指派
 * - reviewer 為空時：清除所有審稿指派
 * 回傳 { deleted, skippedNoCase }
 */
async function reconcileReviewerAssignment(file, caseRow, reviewStageId) {
  const result = { deleted: 0, skippedNoCase: false };
  if (!caseRow) { result.skippedNoCase = true; return result; }
  if (!reviewStageId) return result;

  const { data: existingReview } = await supabase
    .from("cat_stage_assignments")
    .select("id, assignee_user_id")
    .eq("file_workflow_stage_id", reviewStageId);

  const existing = existingReview || [];
  const reviewerId = await resolveProfileId(caseRow.reviewer);
  const toDelete = [];

  for (const a of existing) {
    if (reviewerId && a.assignee_user_id !== reviewerId) {
      toDelete.push(a.id);
    } else if (!reviewerId) {
      // reviewer 已從案件移除 → 清除所有審稿指派
      toDelete.push(a.id);
    }
  }

  if (toDelete.length > 0) {
    if (apply) {
      const { error } = await supabase
        .from("cat_stage_assignments")
        .delete()
        .in("id", toDelete);
      if (error) throw new Error(`刪除審稿指派失敗 (${file.id}): ${error.message}`);
    }
    result.deleted += toDelete.length;
  }

  // 補齊缺少的審稿指派（若 reviewer 有對應 profile）
  if (reviewerId) {
    const alreadyExists = existing.some(
      (a) => !toDelete.includes(a.id) && a.assignee_user_id === reviewerId
    );
    if (!alreadyExists) {
      result.reviewerAdded = true;
      if (apply) {
        const { error } = await supabase.rpc("cat_upsert_review_stage_assignment", {
          p_file_id: file.id,
          p_assignee_user_id: reviewerId,
          p_workflow_status: "assigned",
        });
        if (error) throw new Error(`補齊審稿指派失敗 (${file.id}): ${error.message}`);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 步驟 5：設指定檔案的所有 workflow stages 為 completed
// ---------------------------------------------------------------------------
async function setStagesCompleted(file) {
  const stages = stagesByFile[file.id] || {};
  const stageIds = Object.values(stages)
    .filter((s) => s.stage_kind !== "prep" && s.status !== "completed")
    .map((s) => s.id);

  if (stageIds.length === 0) return { stagesUpdated: 0, assignmentsUpdated: 0 };

  let stagesUpdated = 0;
  let assignmentsUpdated = 0;

  if (apply) {
    // 更新 cat_file_workflow_stages
    const { error: stErr, count } = await supabase
      .from("cat_file_workflow_stages")
      .update({ status: "completed", completed_at: now, updated_at: now })
      .in("id", stageIds);
    if (stErr) throw new Error(`更新 stages 失敗 (${file.id}): ${stErr.message}`);
    stagesUpdated = count ?? stageIds.length;

    // 更新現有的 cat_stage_assignments
    const { error: asErr, count: asCount } = await supabase
      .from("cat_stage_assignments")
      .update({ workflow_status: "completed", updated_at: now })
      .in("file_workflow_stage_id", stageIds)
      .neq("workflow_status", "completed");
    if (asErr) throw new Error(`更新 assignments 失敗 (${file.id}): ${asErr.message}`);
    assignmentsUpdated = asCount ?? 0;
  } else {
    stagesUpdated = stageIds.length;
  }

  return { stagesUpdated, assignmentsUpdated };
}

// ---------------------------------------------------------------------------
// 步驟 6：執行
// ---------------------------------------------------------------------------

let totalStagesUpdated = 0;
let totalAssignmentsUpdated = 0;
let totalAssignmentsDeleted = 0;
let totalReviewerAdded = 0;
const skipLmsNoCase = [];

if (!apply) {
  console.log("\n⚠️  Dry-run 模式（加 --apply 才實際寫入）\n");
}

// 6a: 一般檔案
console.log(`\n--- 一般檔案（${plainFiles.length} 個）---`);
for (const file of plainFiles) {
  const r = await setStagesCompleted(file);
  totalStagesUpdated += r.stagesUpdated;
  totalAssignmentsUpdated += r.assignmentsUpdated;
}
console.log(`  stages 設為 completed：${totalStagesUpdated}`);
console.log(`  assignments 設為 completed：${totalAssignmentsUpdated}`);

// 6b: LMS 連結檔案
console.log(`\n--- LMS 連結檔案（${lmsFiles.length} 個）---`);

const distinctCaseIds = [...new Set(lmsFiles.map((f) => f.related_lms_case_id))];
console.log(`  涉及 ${distinctCaseIds.length} 個不同 LMS 案件`);

// 比對審稿指派（翻譯指派完全不動）
for (const file of lmsFiles) {
  const caseRow = await fetchCase(file.related_lms_case_id);
  if (!caseRow) {
    skipLmsNoCase.push(file);
    continue;
  }
  const stages = stagesByFile[file.id] || {};
  const reviewStageId = stages["review"]?.id ?? null;

  const { deleted, reviewerAdded } = await reconcileReviewerAssignment(
    file, caseRow, reviewStageId
  );
  totalAssignmentsDeleted += deleted;
  if (reviewerAdded) totalReviewerAdded++;
}

// 設 LMS 連結檔案為 completed
let lmsStages = 0, lmsAssigns = 0;
for (const file of lmsFiles) {
  if (skipLmsNoCase.find((f) => f.id === file.id)) continue;
  const r = await setStagesCompleted(file);
  lmsStages += r.stagesUpdated;
  lmsAssigns += r.assignmentsUpdated;
}
totalStagesUpdated += lmsStages;
totalAssignmentsUpdated += lmsAssigns;

console.log(`  審稿指派刪除（不符合現有 reviewer）：${totalAssignmentsDeleted}`);
console.log(`  審稿指派補齊（新增）：${totalReviewerAdded}`);
console.log(`  stages 設為 completed：${lmsStages}`);
console.log(`  assignments 設為 completed：${lmsAssigns}`);

// ---------------------------------------------------------------------------
// 步驟 7：結果摘要
// ---------------------------------------------------------------------------
console.log("\n========== 結果摘要 ==========");
console.log(`總 stages 更新：${totalStagesUpdated}`);
console.log(`總 assignments 更新（設完成）：${totalAssignmentsUpdated}`);
console.log(`總審稿指派刪除（比對清理）：${totalAssignmentsDeleted}`);
console.log(`總審稿指派補齊（新增）：${totalReviewerAdded}`);

if (skipPrepIncomplete.length > 0) {
  console.log(`\n⏭️  跳過（prep 未完成）${skipPrepIncomplete.length} 個檔案：`);
  for (const f of skipPrepIncomplete) {
    console.log(`  - ${f.name || f.id} (${f.id})`);
  }
}

if (skipLmsNoCase.length > 0) {
  console.log(`\n⏭️  跳過（LMS 案件找不到）${skipLmsNoCase.length} 個檔案：`);
  for (const f of skipLmsNoCase) {
    console.log(`  - ${f.name || f.id} (LMS case: ${f.related_lms_case_id})`);
  }
}

if (!apply) {
  console.log("\n💡 以上為模擬結果，實際未寫入。加 --apply 執行。");
} else {
  console.log("\n✅ 完成。");
}
