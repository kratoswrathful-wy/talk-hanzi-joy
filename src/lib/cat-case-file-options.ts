/** 案件頁工具區變更 CAT 連結後，同頁指派表立即重讀選單（不輪詢）。 */

export const CAT_CASE_FILES_CHANGED_EVENT = "tms-cat-case-files-changed";

export type CatFileOptionsCommit =
  | { apply: true }
  | { apply: false; reason: "stale_case" | "superseded" | "fetch_error"; message?: string };

export function decideCatFileOptionsCommit(input: {
  requestCaseId: string;
  currentCaseId: string | undefined;
  requestGeneration: number;
  currentGeneration: number;
  fetchError: { message?: string } | null;
}): CatFileOptionsCommit {
  if (!input.currentCaseId || input.requestCaseId !== input.currentCaseId) {
    return { apply: false, reason: "stale_case" };
  }
  if (input.requestGeneration !== input.currentGeneration) {
    return { apply: false, reason: "superseded" };
  }
  if (input.fetchError) {
    return {
      apply: false,
      reason: "fetch_error",
      message: input.fetchError.message?.trim() || "無法載入 CAT 檔案選單",
    };
  }
  return { apply: true };
}

export function broadcastCatCaseFilesChanged(caseId: string): void {
  if (!caseId || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CAT_CASE_FILES_CHANGED_EVENT, { detail: { caseId } }),
  );
}

export function subscribeCatCaseFilesChanged(
  caseId: string | undefined,
  onMatch: () => void,
): () => void {
  if (!caseId || typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ caseId?: string }>).detail;
    if (detail?.caseId === caseId) onMatch();
  };
  window.addEventListener(CAT_CASE_FILES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CAT_CASE_FILES_CHANGED_EVENT, handler);
}
