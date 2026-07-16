/**
 * LMS sync / assignment upsert 的 workflow_status 決策（純函式，供 Vitest）。
 * 對應 migration：防降級（stage 仍 completed 時不得把 completed 洗回 assigned），
 * 以及反向路徑（stage 已改回 active／pending 時允許降回 assigned）。
 */

/**
 * Sync 端「建議寫入」狀態（呼叫 upsert 前）。
 * @param {{ stageStatus?: string|null, taskCompleted?: boolean }} input
 * @returns {'completed'|'assigned'}
 */
export function resolveRequestedSyncWorkflowStatus(input) {
  const stageStatus = String(input?.stageStatus || "");
  const taskCompleted = !!input?.taskCompleted;
  if (taskCompleted) return "completed";
  if (stageStatus === "completed") return "completed";
  return "assigned";
}

/**
 * Upsert 時「實際寫入」狀態：在 stage 仍 completed 時禁止把已完成指派降級。
 * @param {{
 *   stageStatus?: string|null,
 *   existingStatus?: string|null,
 *   requestedStatus?: string|null,
 *   allowDowngrade?: boolean,
 * }} input
 * @returns {string}
 */
export function resolveEffectiveUpsertWorkflowStatus(input) {
  const stageStatus = String(input?.stageStatus || "");
  const existingStatus = String(input?.existingStatus || "");
  const requestedStatus = String(input?.requestedStatus || "assigned");
  const allowDowngrade = !!input?.allowDowngrade;
  // LMS sync 永遠不傳 allowDowngrade（預設 false）；僅 PM 重開路徑可 true
  if (
    existingStatus === "completed" &&
    requestedStatus !== "completed" &&
    stageStatus === "completed" &&
    !allowDowngrade
  ) {
    return "completed";
  }
  return requestedStatus || "assigned";
}
