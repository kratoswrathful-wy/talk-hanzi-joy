/**
 * TASK-002：完成連動（22:39）
 * 單段審稿完成只帶「同檔同範圍」翻譯完成，不得整檔連坐。
 * 譯者實際改譯文才取消該範圍翻譯／審稿完成；手動取消審稿不取消翻譯。
 */

/**
 * 審稿完成是否要把同檔「全部」翻譯指派寫成完成。規格為永不（舊整檔強制）。
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

function fileIdOf(a) {
  if (a?.fileId != null && String(a.fileId).trim()) return String(a.fileId);
  if (a?.file_id != null && String(a.file_id).trim()) return String(a.file_id);
  return "";
}

/**
 * @param {{ lineStart?: number|null, lineEnd?: number|null, line_start?: number|null, line_end?: number|null }} a
 * @returns {string}
 */
export function assignmentRangeKey(a) {
  const startRaw = a?.lineStart != null ? a.lineStart : a?.line_start;
  const endRaw = a?.lineEnd != null ? a.lineEnd : a?.line_end;
  if (startRaw == null && endRaw == null) return "whole";
  const start = Number(startRaw != null ? startRaw : endRaw);
  const end = Number(endRaw != null ? endRaw : startRaw);
  return `${start}:${end}`;
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function assignmentsHaveExactSameRange(a, b) {
  return assignmentRangeKey(a) === assignmentRangeKey(b);
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function assignmentsSameFile(a, b) {
  const fa = fileIdOf(a);
  const fb = fileIdOf(b);
  if (!fa || !fb) return true;
  return fa === fb;
}

/**
 * @param {{
 *   hits?: Array<{ id?: string, assignmentId?: string }>,
 *   allAssignments?: Array<{ id?: string }>,
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
 *   hits?: Array<object>,
 *   allAssignments?: Array<object>,
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
 * 手動審稿完成應一併完成的「同檔、精確同範圍」翻譯指派。
 * 不含部分重疊的更大／其他範圍。
 * @param {{ review?: object, all?: Array<object> }} [input]
 * @returns {string[]}
 */
export function translateAssignmentsCompletedWithReview(input) {
  const review = input?.review;
  if (!review || assignmentRoleKind(review) !== "review") return [];
  const all = Array.isArray(input?.all) ? input.all : [];
  const seen = new Set();
  const ids = [];
  for (const a of all) {
    if (assignmentRoleKind(a) !== "translate") continue;
    if (!assignmentsSameFile(a, review)) continue;
    if (!assignmentsHaveExactSameRange(a, review)) continue;
    const id = String(a.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 明確操作「整檔審稿全部完成」時，才列出該檔全部翻譯指派。
 * @param {{ all?: Array<object>, isExplicitWholeFile?: boolean }} [input]
 * @returns {string[]}
 */
export function translateIdsForExplicitWholeFileReviewComplete(input) {
  if (!input?.isExplicitWholeFile) return [];
  const all = Array.isArray(input?.all) ? input.all : [];
  return all
    .filter((a) => assignmentRoleKind(a) === "translate")
    .map((a) => String(a.id || ""))
    .filter(Boolean);
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
 * 依「該步全部有效分段」決定整步下一狀態。回傳 null 表示不要改現況。
 * 呼叫端必須給該步全部 workflowStatus，不得只用某人畫面上看得到的列。
 * @param {{
 *   stageKind?: string,
 *   stage_kind?: string,
 *   currentStatus?: string,
 *   status?: string,
 *   assignmentStatuses?: string[],
 *   allowDowngrade?: boolean,
 * }} [input]
 * @returns {'active'|'completed'|null}
 */
export function nextFileWorkflowStageStatusFromAssignments(input) {
  const o = input || {};
  const stageKind = String(o.stageKind || o.stage_kind || "");
  if (stageKind === "prep") return null;
  const current = String(o.currentStatus || o.status || "");
  const allowDowngrade = !!o.allowDowngrade;
  const statuses = Array.isArray(o.assignmentStatuses) ? o.assignmentStatuses : [];
  if (!statuses.length) return null;
  let next = null;
  if (statuses.every((s) => String(s || "") === "completed")) {
    next = "completed";
  } else if (statuses.some((s) => {
    const v = String(s || "");
    return v === "in_progress" || v === "completed";
  })) {
    next = "active";
  } else if (current === "completed") {
    next = "active";
  } else if (current === "pending" && statuses.some((s) => String(s || "") !== "assigned")) {
    next = "active";
  }
  if (!next || next === current) return null;
  if (stageKind === "translate" && current === "completed" && next !== "completed" && !allowDowngrade) {
    return null;
  }
  return next;
}

/**
 * 兩段列範圍是否重疊（含單點、開區間）。缺範圍視為整檔，與任何範圍重疊。
 * 僅供診斷；完成連動不得用重疊去完成另一整段。
 * @param {object} a
 * @param {object} b
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

/**
 * 譯者實際改譯文才取消完成。審稿工作階段、未改內容不觸發。
 * @param {{
 *   actingAsReviewer?: boolean,
 *   sessionKind?: string|null,
 *   textChanged?: boolean,
 * }} [input]
 * @returns {boolean}
 */
export function shouldReopenCompleteOnTranslatorTargetEdit(input) {
  const o = input || {};
  if (!o.textChanged) return false;
  if (String(o.sessionKind || "") === "review") return false;
  // 翻譯工作階段優先：同一人兼審稿時，進翻譯工作仍要取消該段完成。
  if (String(o.sessionKind || "") === "translate") return true;
  if (o.actingAsReviewer) return false;
  return true;
}

/**
 * 譯者改譯文時應取消完成的指派：只取消覆蓋該句的已完成翻譯。
 * 已審稿完成的範圍不得由譯者改譯文取消；須先由主管取消審稿完成。
 * @param {{ covering?: Array<object> }} [input]
 * @returns {string[]}
 */
export function assignmentIdsToReopenOnTranslatorEdit(input) {
  const covering = Array.isArray(input?.covering) ? input.covering : [];
  const ids = [];
  const seen = new Set();
  for (const a of covering) {
    if (assignmentRoleKind(a) !== "translate") continue;
    const st = String(a?.workflowStatus || a?.workflow_status || "");
    if (st !== "completed") continue;
    const id = String(a?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 單人整檔常沒有 LMS 協作列 id。沒有 id 時不能略過案件回寫。
 * @param {object|null|undefined} a
 * @returns {string}
 */
export function assignmentLmsCollabRowId(a) {
  const raw = a?.collabRowId != null ? a.collabRowId : a?.collab_row_id;
  return String(raw || "").trim();
}

/**
 * 需要改走案件層完成／退回的指派（沒有協作列 id）。
 * @param {object[]} [assignments]
 * @returns {object[]}
 */
export function assignmentsNeedingCaseLevelLmsSync(assignments) {
  const list = Array.isArray(assignments) ? assignments : [];
  const out = [];
  const seen = new Set();
  for (const a of list) {
    if (!a || assignmentLmsCollabRowId(a)) continue;
    const key = String(a.id || a.fileId || a.file_id || `idx-${out.length}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function assignmentStageId(a) {
  return a?.fileWorkflowStageId != null ? a.fileWorkflowStageId : a?.file_workflow_stage_id;
}

function assignmentAssigneeId(a) {
  return a?.assigneeUserId != null ? a.assigneeUserId : a?.assignee_user_id;
}

function assignmentViewId(a) {
  return a?.viewId != null ? a.viewId : a?.view_id;
}

function assignmentSameView(a, viewId) {
  if (viewId == null || String(viewId) === "") return true;
  const vid = assignmentViewId(a);
  if (vid == null || String(vid) === "") return true;
  return String(vid) === String(viewId);
}

/**
 * 整份檔案的審稿步驟設為完成後，譯者不得再改。
 * 句段狀態設成審稿完成不構成此鎖。
 * @param {string|null|undefined} reviewStageStatus
 * @returns {boolean}
 */
export function reviewStageForbidsMemberEdit(reviewStageStatus) {
  return String(reviewStageStatus || "").trim().toLowerCase() === "completed";
}

function assignmentWorkflowStatus(a) {
  return String(a?.workflowStatus || a?.workflow_status || "").trim().toLowerCase();
}

/**
 * 該列所屬審稿分段（指派列）是否已設為完成。句段確認狀態不在此判斷。
 * @param {object[]} assignments
 * @param {number|null|undefined} lineNo
 * @returns {boolean}
 */
export function reviewAssignmentRangeCompleted(assignments, lineNo) {
  const list = Array.isArray(assignments) ? assignments : [];
  if (lineNo == null || !Number.isFinite(Number(lineNo))) return false;
  return list.some((a) =>
    assignmentRoleKind(a) === "review"
    && assignmentWorkflowStatus(a) === "completed"
    && assignmentCoversLine(a, lineNo)
  );
}

/**
 * 譯者翻譯操作是否因審稿完成而禁止。
 * - 覆蓋該列的審稿指派已完成 → 鎖（不論審稿受派者是不是目前這人）
 * - 整份檔案審稿步驟完成，且該列沒有未完成的審稿指派 → 鎖
 * - 主管重開其中一段後，即使整檔步驟殘留 completed，該段仍可編
 * - 句段審稿確認不構成此鎖
 * 呼叫端必須給該檔全部階段指派，不得只傳本人列。
 * @param {{
 *   assignments?: Array<object>,
 *   reviewStageStatus?: string|null,
 *   lineNo?: number|null,
 * }} [input]
 * @returns {boolean}
 */
export function reviewWorkForbidsMemberEdit(input) {
  const o = input || {};
  const assignments = Array.isArray(o.assignments) ? o.assignments : [];
  const lineNo = o.lineNo;
  const hasLine = lineNo != null && Number.isFinite(Number(lineNo));
  if (hasLine && reviewAssignmentRangeCompleted(assignments, lineNo)) return true;
  if (!reviewStageForbidsMemberEdit(o.reviewStageStatus)) return false;
  if (!hasLine) return true;
  const coveringReview = assignments.filter((a) =>
    assignmentRoleKind(a) === "review" && assignmentCoversLine(a, lineNo)
  );
  if (!coveringReview.length) return true;
  return coveringReview.every((a) => assignmentWorkflowStatus(a) === "completed");
}

/**
 * 翻譯完成後，工作步驟可能跳到尚未指派或進行中的審稿。
 * 未明示身分時，可用本人翻譯／審稿指派繼續編輯。
 * 句段狀態是否審稿完成不參與判斷。
 * 明示翻譯／審稿身分時，仍只看該步本人指派。
 * 整檔或分段審稿完成的鎖定由 reviewWorkForbidsMemberEdit 另判，
 * 避免主管重開其中一段時被殘留整檔完成狀態誤鎖。
 * @param {{
 *   assignments?: Array<object>,
 *   userId?: string,
 *   sessionStageId?: string,
 *   sessionKind?: string|null,
 *   viewId?: string|null,
 *   reviewStageStatus?: string|null,
 * }} [input]
 * @returns {object[]}
 */
export function resolveMemberEditAssignments(input) {
  const list = Array.isArray(input?.assignments) ? input.assignments : [];
  const uid = String(input?.userId || "");
  if (!uid) return [];
  const viewId = input?.viewId;
  const sessionStageId = input?.sessionStageId;
  const mineOnSession = list.filter((a) =>
    String(assignmentAssigneeId(a) || "") === uid
    && (sessionStageId == null || String(sessionStageId) === "" || String(assignmentStageId(a) || "") === String(sessionStageId))
    && assignmentSameView(a, viewId)
  );
  if (mineOnSession.length) return mineOnSession;
  const kind = input?.sessionKind;
  if (kind === "translate" || kind === "review") return [];
  return list.filter((a) =>
    String(assignmentAssigneeId(a) || "") === uid && assignmentSameView(a, viewId)
  );
}

/**
 * @param {object} a
 * @param {number|null|undefined} lineNo
 * @returns {boolean}
 */
export function assignmentCoversLine(a, lineNo) {
  const ls = a?.lineStart != null ? a.lineStart : a?.line_start;
  const le = a?.lineEnd != null ? a.lineEnd : a?.line_end;
  if (ls == null && le == null) return true;
  if (lineNo == null || !Number.isFinite(Number(lineNo))) return true;
  const start = ls != null ? Number(ls) : 1;
  const end = le != null ? Number(le) : Number.MAX_SAFE_INTEGER;
  const n = Number(lineNo);
  return n >= start && n <= end;
}

/**
 * 未明示工作身分時，依本人實際指派決定目前是翻譯還是審稿。
 * 翻譯完成後工作步驟可能跳到尚未指派的審稿；此時仍視為翻譯，才能取消完成、確認譯文。
 * 明示翻譯／審稿身分時，仍以明示為準。
 * @param {{
 *   assignments?: Array<object>,
 *   userId?: string,
 *   sessionStageId?: string,
 *   sessionKind?: string|null,
 *   viewId?: string|null,
 *   reviewStageStatus?: string|null,
 * }} [input]
 * @returns {'translate'|'review'|null}
 */
export function resolveMemberWorkKind(input) {
  const explicit = String(input?.sessionKind || "").trim().toLowerCase();
  if (explicit === "translate" || explicit === "review") return explicit;
  const mine = resolveMemberEditAssignments(input);
  const seen = new Set();
  const kinds = [];
  for (const a of mine) {
    const k = assignmentRoleKind(a);
    if (k !== "translate" && k !== "review") continue;
    if (seen.has(k)) continue;
    seen.add(k);
    kinds.push(k);
  }
  if (kinds.length === 1) return kinds[0];
  if (kinds.includes("translate")) return "translate";
  if (kinds.includes("review")) return "review";
  return null;
}

/**
 * 成員句段是否因檔案／分段狀態禁止編輯。
 * - 整份檔案審稿步驟完成 → 譯者不能改
 * - 該分段審稿指派完成 → 該段譯者不能改；其他未完成段仍可改
 * - 句段狀態審稿完成、檔案或分段仍審稿進行中 → 仍可改自己的範圍
 * @param {{
 *   assignments?: Array<object>,
 *   userId?: string,
 *   sessionStageId?: string,
 *   sessionKind?: string|null,
 *   viewId?: string|null,
 *   reviewStageStatus?: string|null,
 *   lineNo?: number|null,
 *   segmentReviewConfirmed?: boolean,
 * }} [input]
 * @returns {boolean}
 */
export function memberSegmentEditForbidden(input) {
  if (reviewWorkForbidsMemberEdit(input)) return true;
  const mine = resolveMemberEditAssignments(input);
  if (!mine.length) return true;
  if (input?.lineNo == null) return false;
  void input?.segmentReviewConfirmed;
  return !mine.some((a) => assignmentCoversLine(a, input.lineNo));
}

const WfCompleteIndependence = {
  shouldForceTranslateCompletedDueToReview,
  shouldLockTranslateDueToReviewComplete,
  assignmentRoleKind,
  assignmentRangeKey,
  assignmentsHaveExactSameRange,
  assignmentsSameFile,
  assignmentIdsTouchedByUserHits,
  extraTranslateIdsForcedByReviewComplete,
  translateAssignmentsCompletedWithReview,
  translateIdsForExplicitWholeFileReviewComplete,
  aggregateStageStatusFromAssignmentStatuses,
  nextFileWorkflowStageStatusFromAssignments,
  assignmentRangesOverlap,
  shouldReopenCompleteOnTranslatorTargetEdit,
  assignmentIdsToReopenOnTranslatorEdit,
  assignmentLmsCollabRowId,
  assignmentsNeedingCaseLevelLmsSync,
  resolveMemberEditAssignments,
  resolveMemberWorkKind,
  assignmentCoversLine,
  memberSegmentEditForbidden,
  reviewStageForbidsMemberEdit,
  reviewAssignmentRangeCompleted,
  reviewWorkForbidsMemberEdit,
};

if (typeof globalThis !== "undefined") {
  globalThis.WfCompleteIndependence = WfCompleteIndependence;
}

export default WfCompleteIndependence;
