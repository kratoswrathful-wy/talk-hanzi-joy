import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollabRow, ReviewCollabRow } from "@/data/case-types";
import { pmUpdateCaseAssignments } from "@/lib/pm-case-assignment-rpc";
import { projectCollabReviewIntoReviewRows } from "@/lib/collab-review-pair";
import { deriveReviewerSummary } from "@/lib/review-rows";
import {
  attachLinkedFilesToWholeFileReview,
  bindUniqueCollabRowsToFile,
  matchSharedRowsForLinkedFile,
} from "@/lib/shared-assign-inherit";
import {
  syncCatWorkflowAssignmentsForCase,
  broadcastCatWorkflowAssignmentsSynced,
  type CatWorkflowSyncReport,
} from "@/lib/cat-workflow-dispatch";

export type InheritAssignmentsResult = {
  ok: boolean;
  needsRowChoice: boolean;
  candidates: Array<{ id: string; segment: string; lineRange: string | null }>;
  report: CatWorkflowSyncReport | null;
  reason?: string;
};

function asCollabRows(value: unknown): CollabRow[] {
  return Array.isArray(value) ? (value as CollabRow[]) : [];
}

function asReviewRows(value: unknown): ReviewCollabRow[] {
  return Array.isArray(value) ? (value as ReviewCollabRow[]) : [];
}

/** 檔案已存在並連結後才呼叫。可重跑；不把未承接詢案列當成已承接。 */
function chosenRowIdsFrom(input: { chosenRowId?: string; chosenRowIds?: string[] }): string[] {
  const many = Array.isArray(input.chosenRowIds)
    ? input.chosenRowIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const one = String(input.chosenRowId || "").trim();
  if (one && !many.includes(one)) many.push(one);
  return many;
}

export async function inheritCaseAssignmentsForLinkedFile(
  supabase: SupabaseClient,
  input: { caseId: string; fileId: string; fileName?: string; chosenRowId?: string; chosenRowIds?: string[] },
): Promise<InheritAssignmentsResult> {
  const caseId = String(input.caseId || "").trim();
  const fileId = String(input.fileId || "").trim();
  if (!caseId || !fileId) {
    return { ok: false, needsRowChoice: false, candidates: [], report: null, reason: "missing ids" };
  }

  const { data: caseRow, error } = await supabase
    .from("cases_visible")
    .select("id, revision, status, multi_collab, collab_rows, review_rows, reviewer")
    .eq("id", caseId)
    .maybeSingle();
  if (error || !caseRow) {
    return { ok: false, needsRowChoice: false, candidates: [], report: null, reason: "case not found" };
  }

  const collabRows = asCollabRows((caseRow as { collab_rows?: unknown }).collab_rows);
  const reviewRows = asReviewRows((caseRow as { review_rows?: unknown }).review_rows);
  let match = matchSharedRowsForLinkedFile({
    fileId,
    fileName: String(input.fileName || "").trim(),
    collabRows,
  });

  if (match.kind === "ambiguous") {
    const chosenIds = new Set(chosenRowIdsFrom(input));
    const chosen = chosenIds.size
      ? match.candidates.filter((row) => chosenIds.has(row.id))
      : [];
    if (!chosen.length) {
      return {
        ok: false,
        needsRowChoice: true,
        candidates: match.candidates.map((row) => ({
          id: row.id,
          segment: String(row.segment || "").trim(),
          lineRange: row.lineRange ?? null,
        })),
        report: null,
        reason: "ambiguous shared rows",
      };
    }
    match = { kind: "unique", collabRows: chosen };
  }

  let nextCollab = collabRows;
  let nextReview = reviewRows;
  if (match.kind === "unique") {
    nextCollab = bindUniqueCollabRowsToFile(collabRows, match.collabRows, fileId);
    nextReview = projectCollabReviewIntoReviewRows(nextCollab, reviewRows);
  } else if (match.kind === "whole-case" || match.kind === "none") {
    nextReview = attachLinkedFilesToWholeFileReview(reviewRows, [
      { id: fileId, name: String(input.fileName || "").trim() },
    ]);
  }

  const expectedRevision =
    typeof (caseRow as { revision?: number }).revision === "number"
      ? (caseRow as { revision: number }).revision
      : 0;
  const { error: updErr } = await pmUpdateCaseAssignments(
    supabase,
    caseId,
    {
      collab_rows: nextCollab,
      review_rows: nextReview,
      reviewer: deriveReviewerSummary(nextReview) || String((caseRow as { reviewer?: string }).reviewer || ""),
    },
    expectedRevision,
  );
  if (updErr) {
    return { ok: false, needsRowChoice: false, candidates: [], report: null, reason: updErr.message };
  }

  const report = await syncCatWorkflowAssignmentsForCase(supabase, caseId);
  broadcastCatWorkflowAssignmentsSynced(caseId);
  return { ok: true, needsRowChoice: false, candidates: [], report };
}
