import { mergeCasePublicSnapshot } from "@/lib/case-public-snapshot";
import type { CaseRecord } from "@/data/case-types";

/** 清單投影沒有帶回、詳情／複製必須另取的欄位。 */
export const CASE_LIST_OMITTED_APP_KEYS = [
  "tools",
  "questionTools",
  "processNote",
  "inquiryNote",
  "toolFieldValues",
  "deliveryMethodFiles",
  "clientReceipt",
  "clientReceiptFiles",
  "customGuidelinesUrl",
  "clientGuidelines",
  "commonInfo",
  "commonLinks",
  "internalNoteForm",
  "clientQuestionForm",
  "workingFiles",
  "otherLoginInfo",
  "loginAccount",
  "loginPassword",
  "onlineToolProject",
  "onlineToolFilename",
  "sourceFiles",
  "seriesReferenceMaterials",
  "caseReferenceMaterials",
  "referenceMaterials",
  "questionForm",
  "translatorFinal",
  "internalReviewFinal",
  "trackChanges",
  "internalRecords",
  "comments",
  "internalComments",
  "bodyContent",
  "inquirySlackRecords",
  "edit_logs",
] as const satisfies readonly (keyof CaseRecord)[];

export type CaseCompleteness = "list" | "full" | "stale";

export type MergeCaseListProjectionResult = {
  record: CaseRecord;
  completeness: CaseCompleteness;
};

function timestampMs(value: string | undefined): number {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** 清單列是否比已快取完整／過期列更新（先比 revision，再比 updatedAt）。 */
export function listSnapshotIsNewer(current: CaseRecord, incoming: CaseRecord): boolean {
  const currentRev = current.revision ?? 0;
  const incomingRev = incoming.revision ?? 0;
  if (incomingRev !== currentRev) return incomingRev > currentRev;
  return timestampMs(incoming.updatedAt) > timestampMs(current.updatedAt);
}

export function omittedKeysInPartial(
  partial: Partial<CaseRecord>,
): Array<(typeof CASE_LIST_OMITTED_APP_KEYS)[number]> {
  return CASE_LIST_OMITTED_APP_KEYS.filter((key) => partial[key] !== undefined);
}

/**
 * 非完整列不得寫入清單沒有帶回的欄位（內文／附件／工具／edit_logs）。
 * 清單欄（標題、狀態等）仍可寫。
 */
export function caseUpdateBlockedReason(
  completeness: CaseCompleteness | undefined,
  partial: Partial<CaseRecord>,
): string | null {
  if (completeness === "full") return null;
  if (omittedKeysInPartial(partial).length === 0) return null;
  return "案件完整內容尚未載入或已過期，未寫入內文／附件／工具。請重新載入後再儲存。";
}

/**
 * 清單投影合併。
 * - 記憶體沒有完整／過期快取：結果為 list，不得把空 omitted 當成已載入。
 * - 已有完整快取且清單列未更新：保留 omitted，仍為 full。
 * - 已有完整／過期快取且清單列較新：保留舊 omitted 供顯示，但標 stale，不得當最新完整資料寫回。
 */
export function mergeCaseListProjection(
  current: CaseRecord | undefined,
  incoming: CaseRecord,
  currentCompleteness: CaseCompleteness | undefined,
): MergeCaseListProjectionResult {
  const hasOmittedCache =
    !!current && (currentCompleteness === "full" || currentCompleteness === "stale");
  const base = mergeCasePublicSnapshot(current, incoming);
  if (!hasOmittedCache || !current) {
    return { record: base, completeness: "list" };
  }
  const out: CaseRecord = { ...base };
  for (const key of CASE_LIST_OMITTED_APP_KEYS) {
    Object.assign(out, { [key]: current[key] });
  }
  if (listSnapshotIsNewer(current, incoming)) {
    return { record: out, completeness: "stale" };
  }
  return {
    record: out,
    completeness: currentCompleteness === "stale" ? "stale" : "full",
  };
}

/** 全表失敗不得把既有清單清成「沒有案件」。 */
export function casesAfterFullListFailure<T>(previous: T[]): T[] {
  return previous;
}

export function casesListEmptyKind(args: {
  loadError: string | null;
  count: number;
}): "error" | "empty" | "ready" {
  if (args.loadError) return "error";
  if (args.count === 0) return "empty";
  return "ready";
}
