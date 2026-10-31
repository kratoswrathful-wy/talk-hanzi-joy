/** CAT iframe 等待父頁案件完成／回退寫入結果，避免把 postMessage 當成已成功。 */

export const CAT_WF_LMS_RESULT_TYPE = "CAT_WF_LMS_RESULT";

export function catWfLmsResultMessage(
  requestId: string,
  ok: boolean,
  error?: string,
): {
  type: typeof CAT_WF_LMS_RESULT_TYPE;
  payload: { requestId: string; ok: boolean; error: string };
} {
  const id = String(requestId || "").trim();
  const succeeded = ok === true;
  return {
    type: CAT_WF_LMS_RESULT_TYPE,
    payload: {
      requestId: id,
      ok: succeeded,
      error: succeeded ? "" : String(error || "lms_sync_failed"),
    },
  };
}

export function parseCatWfLmsRequestId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  return String((payload as { requestId?: unknown }).requestId || "").trim();
}
