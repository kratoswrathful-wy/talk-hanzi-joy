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

export function mergeCaseListProjection(
  current: CaseRecord | undefined,
  incoming: CaseRecord,
  currentIsFull: boolean,
): CaseRecord {
  const base = mergeCasePublicSnapshot(current, incoming);
  if (!current || !currentIsFull) return base;
  const out: CaseRecord = { ...base };
  for (const key of CASE_LIST_OMITTED_APP_KEYS) {
    Object.assign(out, { [key]: current[key] });
  }
  return out;
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
