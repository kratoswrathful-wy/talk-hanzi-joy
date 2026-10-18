/**
 * TASK-002：翻譯／審稿完成狀態各自獨立。
 * 審稿完成不得強制改寫翻譯指派或阻擋翻譯狀態；一段完成不能推論全部完成。
 */

/**
 * 審稿完成是否要把同檔翻譯指派／翻譯步驟寫成完成。規格為永不。
 * @returns {false}
 */
export function shouldForceTranslateCompletedDueToReview() {
  return false;
}

/**
 * 是否因「檔內仍有審稿完成」而顯示橘字、擋翻譯降級或鎖翻譯編輯。規格為永不。
 * @returns {false}
 */
export function shouldLockTranslateDueToReviewComplete() {
  return false;
}

/**
 * @param {{ kind?: string, stageKind?: string, stage_kind?: string }|null|undefined} a
 * @returns {'translate'|'review'|'other'}
 */
export function assignmentRoleKind(a) {
  const raw = String(a?.kind || a?.stageKind || a?.stage_kind || "").trim().toLowerCase();
  if (raw === "review") return "review";
  if (raw === "translate") return "translate";
  return "other";
}

/**
 * 使用者改哪一筆，就只更新那一筆；另一角色與其他範圍不得被自動寫入。
 * @param {{
 *   hits?: Array<{ id?: string, assignmentId?: string }>,
 *   allAssignments?: Array<{ id?: string, kind?: string, stageKind?: string, workflowStatus?: string }>,
 * }} [input]
 * @returns {string[]}
 */
export function assignmentIdsTouchedByUserHits(input) {
  const hits = Array.isArray(input?.hits) ? input.hits : [];
  const ids = [];
  const seen = new Set();
  for (const hit of hits) {
    const id = String(hit?.id || hit?.assignmentId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 舊「任一審稿完成 → 全檔翻譯完成」會多寫哪些翻譯指派。新規格應為空。
 * @param {{
 *   hits?: Array<{ id?: string, assignmentId?: string, kind?: string, stageKind?: string, workflowStatus?: string }>,
 *   allAssignments?: Array<{ id?: string, kind?: string, stageKind?: string, workflowStatus?: string }>,
 * }} [input]
 * @returns {string[]}
 */
export function extraTranslateIdsForcedByReviewComplete(input) {
  if (!shouldForceTranslateCompletedDueToReview()) return [];
  const all = Array.isArray(input?.allAssignments) ? input.allAssignments : [];
  const hits = Array.isArray(input?.hits) ? input.hits : [];
  const hitIds = new Set(assignmentIdsTouchedByUserHits({ hits }));
  const reviewCompleted = hits.some(
    (h) => assignmentRoleKind(h) === "review" && String(h.workflowStatus || "") === "completed",
  ) || all.some(
    (a) => assignmentRoleKind(a) === "review" && String(a.workflowStatus || "") === "completed",
  );
  if (!reviewCompleted) return [];
  return all
    .filter((a) => assignmentRoleKind(a) === "translate" && !hitIds.has(String(a.id || "")))
    .map((a) => String(a.id));
}

/**
 * 整檔步驟狀態只依該角色有效指派彙整；一段完成不能當成全部完成。
 * @param {string[]} statuses
 * @returns {'completed'|'active'|'pending'|null}
 */
export function aggregateStageStatusFromAssignmentStatuses(statuses) {
  const list = Array.isArray(statuses) ? statuses.map((s) => String(s || "")) : [];
  if (!list.length) return null;
  if (list.every((s) => s === "completed")) return "completed";
  if (list.some((s) => s === "in_progress" || s === "completed")) return "active";
  return "pending";
}

/**
 * 兩段列範圍是否重疊（含單點、開區間）。缺範圍視為整檔，與任何範圍重疊。
 * @param {{ lineStart?: number|null, lineEnd?: number|null, line_start?: number|null, line_end?: number|null }} a
 * @param {{ lineStart?: number|null, lineEnd?: number|null, line_start?: number|null, line_end?: number|null }} b
 * @returns {boolean}
 */
export function assignmentRangesOverlap(a, b) {
  const rangeOf = (x) => {
    const startRaw = x?.lineStart != null ? x.lineStart : x?.line_start;
    const endRaw = x?.lineEnd != null ? x.lineEnd : x?.line_end;
    if (startRaw == null && endRaw == null) return null;
    const start = Number(startRaw != null ? startRaw : endRaw);
    const end = Number(endRaw != null ? endRaw : startRaw);
    return { start, end };
  };
  const ra = rangeOf(a);
  const rb = rangeOf(b);
  if (!ra || !rb) return true;
  return ra.start <= rb.end && rb.start <= ra.end;
}

const WfCompleteIndependence = {
  shouldForceTranslateCompletedDueToReview,
  shouldLockTranslateDueToReviewComplete,
  assignmentRoleKind,
  assignmentIdsTouchedByUserHits,
  extraTranslateIdsForcedByReviewComplete,
  aggregateStageStatusFromAssignmentStatuses,
  assignmentRangesOverlap,
};

if (typeof globalThis !== "undefined") {
  globalThis.WfCompleteIndependence = WfCompleteIndependence;
}

export default WfCompleteIndependence;
