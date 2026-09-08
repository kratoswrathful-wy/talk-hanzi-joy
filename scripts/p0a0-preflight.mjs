#!/usr/bin/env node
/**
 * P0-A0 唯讀盤點。
 *
 * 預設只輸出不含案件 ID／使用者 UUID 的統計摘要。傳入 --full 時，另將完整
 * unresolved 清單寫至已被 .gitignore 排除的 scripts/.cache/。
 *
 * recovery/p0a-20260830：依 2026-08-28 契約重建（createClient 唯讀 select；
 * 不採用舊 worktree spawnSync 版）。本腳本不做任何 mutation。
 *
 * 測試／mock：設 P0A0_PREFLIGHT_MOCK=1 時不連線，改讀 stdin JSON fixture。
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

for (const file of [process.env.P0A0_ENV_FILE, ".env", ".env.playwright.local"].filter(Boolean)) {
  try {
    process.loadEnvFile(file);
  } catch {
    // 本機未建立該檔時由下方統一回報缺少連線設定。
  }
}

const includeFull = process.argv.includes("--full");
const useMock = process.env.P0A0_PREFLIGHT_MOCK === "1";

function addCandidate(target, env, caseId, userId, role, source, reason) {
  target.push({
    env,
    caseId,
    userId: userId || null,
    role,
    source,
    reason,
    trusted: false,
  });
}

function buildReport({
  permissionRows,
  caseRows,
  fileRows,
  legacyAssignments,
  fileAssignments,
  stageAssignments,
  viewAssignments,
  views,
}) {
  const casesById = new Map(caseRows.map((row) => [row.id, row]));
  const filesById = new Map(fileRows.map((row) => [row.id, row]));
  const viewsById = new Map(views.map((row) => [row.id, row]));
  const candidates = [];

  for (const row of caseRows) {
    const collabRows = Array.isArray(row.collab_rows) ? row.collab_rows : [];
    for (const collabRow of collabRows) {
      if (!collabRow || typeof collabRow !== "object" || Array.isArray(collabRow)) continue;
      if (typeof collabRow.translatorUserId === "string" && collabRow.translatorUserId.trim()) {
        addCandidate(
          candidates,
          row.env,
          row.id,
          collabRow.translatorUserId,
          "translator",
          "collab_rows.translatorUserId",
          "歷史 migration 曾由姓名 resolver 覆寫，列內無不可變來源紀錄",
        );
      }
      if (typeof collabRow.reviewerUserId === "string" && collabRow.reviewerUserId.trim()) {
        addCandidate(
          candidates,
          row.env,
          row.id,
          collabRow.reviewerUserId,
          "reviewer",
          "collab_rows.reviewerUserId",
          "歷史 migration 曾由姓名 resolver 覆寫，列內無不可變來源紀錄",
        );
      }
    }
    if (Array.isArray(row.translator) && row.translator.some((value) => typeof value === "string" && value.trim())) {
      addCandidate(candidates, row.env, row.id, null, "translator", "cases.translator", "僅有顯示名稱");
    }
    if (typeof row.reviewer === "string" && row.reviewer.trim()) {
      addCandidate(candidates, row.env, row.id, null, "reviewer", "cases.reviewer", "僅有顯示名稱");
    }
  }

  for (const assignment of legacyAssignments) {
    const caseRow = casesById.get(assignment.case_id);
    if (!caseRow) continue;
    addCandidate(
      candidates,
      caseRow.env,
      caseRow.id,
      assignment.translator_user_id,
      "translator",
      "cat_assignments.translator_user_id",
      "歷史表缺少可驗證的建立來源",
    );
  }

  for (const assignment of fileAssignments) {
    const file = filesById.get(assignment.file_id);
    const caseRow = file?.related_lms_case_id ? casesById.get(file.related_lms_case_id) : null;
    if (!caseRow) continue;
    addCandidate(
      candidates,
      caseRow.env,
      caseRow.id,
      assignment.assignee_user_id,
      "unknown",
      "cat_file_assignments.assignee_user_id",
      assignment.assigned_by
        ? "assigned_by 不足以排除歷史 self-insert／寬鬆 RLS"
        : "缺少 actor，且歷史 sync 曾由姓名解析建立",
    );
  }

  for (const assignment of stageAssignments) {
    const file = filesById.get(assignment.file_id);
    const caseRow = file?.related_lms_case_id ? casesById.get(file.related_lms_case_id) : null;
    if (!caseRow) continue;
    addCandidate(
      candidates,
      caseRow.env,
      caseRow.id,
      assignment.assignee_user_id,
      "unknown",
      "cat_stage_assignments.assignee_user_id",
      assignment.assigned_by
        ? "歷史 privileged RPC 缺少 caller ACL，actor 不能證明來源"
        : "缺少 actor，且歷史 sync／resolver 可建立此列",
    );
  }

  for (const assignment of viewAssignments) {
    const view = viewsById.get(assignment.view_id);
    if (!view || !Array.isArray(view.file_ids)) continue;
    const caseIds = new Set();
    for (const fileId of view.file_ids) {
      const file = filesById.get(fileId);
      if (file?.related_lms_case_id) caseIds.add(file.related_lms_case_id);
    }
    for (const caseId of caseIds) {
      const caseRow = casesById.get(caseId);
      if (!caseRow) continue;
      addCandidate(
        candidates,
        caseRow.env,
        caseRow.id,
        assignment.assignee_user_id,
        "unknown",
        "cat_view_assignments.assignee_user_id",
        "歷史列缺少可驗證的案件 participant 來源",
      );
    }
  }

  const permissionSettings = Object.groupBy(permissionRows, (row) => row.env);
  const environments = [
    ...new Set([...caseRows.map((row) => row.env), ...permissionRows.map((row) => row.env)]),
  ].sort();
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    permissionSettings: environments.map((env) => ({
      env,
      count: permissionSettings[env]?.length ?? 0,
      hasDuplicate: (permissionSettings[env]?.length ?? 0) > 1,
    })),
    participantCandidates: environments.map((env) => {
      const rows = candidates.filter((row) => row.env === env);
      const bySource = Object.entries(Object.groupBy(rows, (row) => row.source))
        .map(([source, sourceRows]) => ({
          source,
          candidateRows: sourceRows.length,
          affectedCases: new Set(sourceRows.map((row) => row.caseId)).size,
          automaticallyTrustedRows: 0,
        }))
        .sort((a, b) => a.source.localeCompare(b.source));
      return {
        env,
        candidateRows: rows.length,
        affectedCases: new Set(rows.map((row) => row.caseId)).size,
        automaticallyTrustedRows: 0,
        unresolvedRows: rows.length,
        bySource,
      };
    }),
  };

  return { summary, candidates, permissionSettings };
}

async function readAll(db, table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function loadLiveTables() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("缺少 SUPABASE_URL（或 VITE_SUPABASE_URL）／SUPABASE_SERVICE_ROLE_KEY。");
    process.exit(1);
  }
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [permissionRows, caseRows, fileRows, legacyAssignments, fileAssignments, stageAssignments, viewAssignments, views] =
    await Promise.all([
      readAll(db, "permission_settings", "id,env"),
      readAll(db, "cases", "id,env,translator,reviewer,collab_rows"),
      readAll(db, "cat_files", "id,env,related_lms_case_id"),
      readAll(db, "cat_assignments", "case_id,translator_user_id"),
      readAll(db, "cat_file_assignments", "file_id,assignee_user_id,assigned_by,status"),
      readAll(db, "cat_stage_assignments", "file_id,assignee_user_id,assigned_by,collab_row_id,workflow_status"),
      readAll(db, "cat_view_assignments", "view_id,assignee_user_id,status"),
      readAll(db, "cat_views", "id,file_ids"),
    ]);
  return {
    permissionRows,
    caseRows,
    fileRows,
    legacyAssignments,
    fileAssignments,
    stageAssignments,
    viewAssignments,
    views,
  };
}

function loadMockTables() {
  const fixturePath = process.env.P0A0_PREFLIGHT_FIXTURE;
  if (!fixturePath) {
    console.error("P0A0_PREFLIGHT_MOCK=1 時必須設定 P0A0_PREFLIGHT_FIXTURE。");
    process.exit(1);
  }
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

export { buildReport };

async function main() {
  const tables = useMock ? loadMockTables() : await loadLiveTables();
  const { summary, candidates, permissionSettings } = buildReport(tables);

  console.log(JSON.stringify(summary, null, 2));

  if (includeFull) {
    const cacheDir = join(import.meta.dirname, ".cache");
    mkdirSync(cacheDir, { recursive: true });
    const output = join(cacheDir, `p0a0-unresolved-${Date.now()}.json`);
    writeFileSync(
      output,
      `${JSON.stringify(
        {
          generatedAt: summary.generatedAt,
          permissionSettings,
          unresolvedCandidates: candidates,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.error(`完整報告已寫入忽略目錄：${output}`);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  await main();
}
