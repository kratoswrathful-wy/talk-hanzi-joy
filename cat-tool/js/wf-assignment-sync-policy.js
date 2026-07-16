/**
 * LMS sync / assignment upsert 的 workflow_status 決策（純函式，供 Vitest）。
 * 對應 migration：防降級（completed／in_progress 不得被 sync 洗回 assigned），
 * 以及反向路徑（stage 已改回 active／pending 時允許自 completed 降回）。
 */

/** @param {string|null|undefined} status */
export function workflowStatusRank(status) {
  const s = String(status || "");
  if (s === "completed") return 2;
  if (s === "in_progress") return 1;
  return 0; // assigned / 未知
}

/**
 * Sync 端「建議寫入」狀態（呼叫 upsert 前）。
 * @param {{
 *   stageStatus?: string|null,
 *   taskCompleted?: boolean,
 *   existingStatus?: string|null,
 * }} input
 * @returns {'completed'|'in_progress'|'assigned'}
 */
export function resolveRequestedSyncWorkflowStatus(input) {
  const stageStatus = String(input?.stageStatus || "");
  const taskCompleted = !!input?.taskCompleted;
  const existingStatus = String(input?.existingStatus || "");
  if (taskCompleted) return "completed";
  if (stageStatus === "completed") return "completed";
  // 既有 in_progress／completed：建議維持，避免 sync 一律傳 assigned 造成降級意圖
  if (existingStatus === "in_progress" || existingStatus === "completed") {
    return existingStatus;
  }
  return "assigned";
}

/**
 * Upsert 時「實際寫入」狀態。
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
  const requestedStatus = String(input?.requestedStatus || "assigned") || "assigned";
  const allowDowngrade = !!input?.allowDowngrade;
  // LMS sync 永遠不傳 allowDowngrade（預設 false）；僅 PM 重開路徑可 true

  // —— 2026-07-14（保留）：stage 仍 completed 時禁止洗回 ——
  if (
    existingStatus === "completed" &&
    requestedStatus !== "completed" &&
    stageStatus === "completed" &&
    !allowDowngrade
  ) {
    return "completed";
  }

  // —— 等級：不允許降級，除非 allowDowngrade ——
  // 反向路徑例外：stage 已非 completed 時，允許自 completed 降回（否則檔案重開卡死）
  if (
    workflowStatusRank(requestedStatus) < workflowStatusRank(existingStatus) &&
    !allowDowngrade
  ) {
    if (existingStatus === "completed" && stageStatus !== "completed") {
      return requestedStatus;
    }
    return existingStatus;
  }

  return requestedStatus;
}
