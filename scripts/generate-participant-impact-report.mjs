/**
 * 唯讀 production impact report（Git-ignored 輸出）。
 * 用法：node scripts/generate-participant-impact-report.mjs
 * 需 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（勿提交）。
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, ".cache");
const OUT_JSON = path.join(OUT_DIR, "participant-impact-report.json");
const OUT_MD = path.join(OUT_DIR, "participant-impact-report.md");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function hasUuidInRows(rows, field) {
  if (!Array.isArray(rows)) return false;
  return rows.some((r) => {
    const v = r?.[field];
    return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  });
}

async function main() {
  const { data: cases, error } = await sb
    .from("cases")
    .select(
      "id, title, status, env, multi_collab, translator, reviewer, collab_rows, review_rows, translation_deadline, review_deadline",
    )
    .eq("env", "production")
    .neq("status", "delivered")
    .order("title");

  if (error) throw error;

  const assigned = (cases ?? []).filter((c) => {
    const t = c.translator;
    const hasTranslator = Array.isArray(t) ? t.length > 0 : !!t;
    const hasCollab =
      c.multi_collab &&
      Array.isArray(c.collab_rows) &&
      c.collab_rows.some((r) => r?.translator);
    const hasReview =
      Array.isArray(c.review_rows) && c.review_rows.some((r) => r?.reviewer);
    return hasTranslator || hasCollab || hasReview || !!c.reviewer;
  });

  const caseIds = assigned.map((c) => c.id);
  const { data: participants } = caseIds.length
    ? await sb
        .from("case_participants")
        .select("case_id, user_id, role, access_revoked_at, source")
        .in("case_id", caseIds)
        .is("access_revoked_at", null)
    : { data: [] };

  const partByCase = new Map();
  for (const p of participants ?? []) {
    const list = partByCase.get(p.case_id) ?? [];
    list.push(p);
    partByCase.set(p.case_id, list);
  }

  const rows = assigned.map((c) => {
    const collab = Array.isArray(c.collab_rows) ? c.collab_rows : [];
    const review = Array.isArray(c.review_rows) ? c.review_rows : [];
    const hasCollabUuid = hasUuidInRows(collab, "translatorUserId");
    const hasReviewUuid = hasUuidInRows(review, "reviewerUserId");
    const activeParts = partByCase.get(c.id) ?? [];
    const needsPmConfirm =
      activeParts.length === 0 &&
      ((Array.isArray(c.translator) && c.translator.length > 0) ||
        collab.some((r) => r?.translator) ||
        review.some((r) => r?.reviewer) ||
        !!c.reviewer);

    const blockedAfterDeploy = [];
    if (needsPmConfirm) {
      blockedAfterDeploy.push("update_case_permitted_fields");
      blockedAfterDeploy.push("get_case_credentials");
      blockedAfterDeploy.push("complete_case_translation");
      if (review.some((r) => r?.reviewer) || c.reviewer) {
        blockedAfterDeploy.push("complete_case_review_row");
      }
    }

    return {
      caseId: c.id,
      title: c.title,
      status: c.status,
      multiCollab: c.multi_collab,
      translatorDisplay: c.translator,
      reviewerDisplay: c.reviewer,
      collabTranslators: collab.map((r) => ({
        segment: r?.segment,
        translator: r?.translator,
        translatorUserId: r?.translatorUserId ?? null,
      })),
      reviewReviewers: review.map((r) => ({
        segment: r?.segment,
        reviewer: r?.reviewer,
        reviewerUserId: r?.reviewerUserId ?? null,
      })),
      hasCollabUuid,
      hasReviewUuid,
      activeParticipantCount: activeParts.length,
      needsPmConfirm,
      blockedAfterDeploy,
    };
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    env: "production",
    totalNonDeliveredAssigned: rows.length,
    needsPmConfirm: rows.filter((r) => r.needsPmConfirm).length,
    hasAnyUuidInRows: rows.filter((r) => r.hasCollabUuid || r.hasReviewUuid).length,
    note:
      "未 delivered 既有案件：正式上線前須 PM 明確確認 participant；不得依姓名自動授權。",
  };

  const report = { summary, cases: rows };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const md = [
    "# Participant Impact Report（production 唯讀）",
    "",
    `產生時間：${summary.generatedAt}`,
    "",
    "## 摘要",
    "",
    `- 未 delivered 且已指派案件：${summary.totalNonDeliveredAssigned}`,
    `- 需 PM 人工確認 participant：${summary.needsPmConfirm}`,
    `- collab/review 列含 UUID：${summary.hasAnyUuidInRows}`,
    "",
    "## 需確認案件（前 50 筆）",
    "",
    ...rows
      .filter((r) => r.needsPmConfirm)
      .slice(0, 50)
      .map(
        (r) =>
          `- **${r.title}** (${r.status}) — 譯者 ${JSON.stringify(r.translatorDisplay)}；審稿 ${r.reviewerDisplay || "—"}；現有 participant ${r.activeParticipantCount}`,
      ),
    "",
    `完整 JSON：${OUT_JSON}`,
  ].join("\n");

  await writeFile(OUT_MD, md, "utf8");
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
