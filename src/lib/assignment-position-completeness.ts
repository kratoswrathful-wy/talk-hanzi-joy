/**
 * 派案清單完整性：從案件「實際指派狀態」推導預期位置，再與確認／套用 job 比對。
 * 不得只核對 job 已列出的項目（Gate2 34/34 假綠教訓）。
 * 有姓名但缺 UUID 的位置仍須列出，不可因缺 UUID 略過。
 */

export type AssignmentPositionKind =
  | "single_translator"
  | "case_reviewer"
  | "review_row"
  | "collab_translator_row";

export interface ExpectedAssignmentPosition {
  positionKind: AssignmentPositionKind;
  /** 可信 UUID；姓名-only 時為 null（仍列入預期位置） */
  userId: string | null;
  sourceRowId?: string | null;
  /** 有顯示名／列存在但無可信 UUID */
  nameOnlyGap?: boolean;
}

export interface LiveCaseAssignmentSnapshot {
  multiCollab: boolean;
  /** 單檔譯者 UUID（來自 active participant 或可信指派欄）；無則 null */
  translatorUserId: string | null;
  /** 顯示譯者標籤數（僅用於完整性警示，不授權） */
  translatorLabelCount: number;
  reviewerUserId: string | null;
  reviewerLabel: string | null;
  collabRows: Array<{
    id: string;
    translatorUserId?: string | null;
    translatorLabel?: string | null;
  }>;
  reviewRows: Array<{
    id: string;
    reviewerUserId?: string | null;
    reviewerLabel?: string | null;
  }>;
}

export interface ConfirmedAssignmentSlot {
  positionKind: AssignmentPositionKind;
  candidateUserId?: string | null;
  sourceRowId?: string | null;
}

export function deriveExpectedAssignmentPositions(
  live: LiveCaseAssignmentSnapshot,
): ExpectedAssignmentPosition[] {
  const out: ExpectedAssignmentPosition[] = [];

  if (live.multiCollab) {
    for (const row of live.collabRows) {
      const uid = (row.translatorUserId || "").trim() || null;
      const hasLabel = !!(row.translatorLabel || "").trim() || !!uid;
      if (!hasLabel && !uid) continue;
      out.push({
        positionKind: "collab_translator_row",
        userId: uid,
        sourceRowId: row.id,
        nameOnlyGap: !uid,
      });
    }
  } else if (live.translatorUserId || live.translatorLabelCount > 0) {
    out.push({
      positionKind: "single_translator",
      userId: live.translatorUserId,
      nameOnlyGap: !live.translatorUserId,
    });
  }

  const hasReviewRowUids = live.reviewRows.some((r) => (r.reviewerUserId || "").trim());
  const hasReviewRowLabels = live.reviewRows.some(
    (r) => (r.reviewerLabel || "").trim() || (r.reviewerUserId || "").trim(),
  );

  if (hasReviewRowUids || hasReviewRowLabels) {
    for (const row of live.reviewRows) {
      const uid = (row.reviewerUserId || "").trim() || null;
      const hasLabel = !!(row.reviewerLabel || "").trim() || !!uid;
      if (!hasLabel && !uid) continue;
      out.push({
        positionKind: "review_row",
        userId: uid,
        sourceRowId: row.id,
        nameOnlyGap: !uid,
      });
    }
  } else if (live.reviewerUserId || (live.reviewerLabel || "").trim()) {
    out.push({
      positionKind: "case_reviewer",
      userId: live.reviewerUserId,
      nameOnlyGap: !live.reviewerUserId,
    });
  }

  return out;
}

export interface AssignmentCompletenessReport {
  /** 案件有譯者顯示名但無可信 UUID／participant */
  nameOnlyTranslatorGap: boolean;
  /** 所有有姓名缺 UUID 的位置（單人／協作／審稿） */
  nameOnlyGaps: ExpectedAssignmentPosition[];
  missingFromConfirmation: ExpectedAssignmentPosition[];
  extraInConfirmation: ConfirmedAssignmentSlot[];
}

function slotKey(kind: string, userId: string | null | undefined, sourceRowId?: string | null) {
  return `${kind}|${userId || ""}|${sourceRowId || ""}`;
}

export function diffAssignmentConfirmation(input: {
  live: LiveCaseAssignmentSnapshot;
  confirmed: ConfirmedAssignmentSlot[];
}): AssignmentCompletenessReport {
  const expected = deriveExpectedAssignmentPositions(input.live);
  const confirmedKeys = new Set(
    input.confirmed.map((c) =>
      slotKey(c.positionKind, c.candidateUserId, c.sourceRowId),
    ),
  );
  const expectedKeys = new Set(
    expected.map((e) => slotKey(e.positionKind, e.userId, e.sourceRowId)),
  );

  const nameOnlyGaps = expected.filter((e) => e.nameOnlyGap);

  return {
    nameOnlyTranslatorGap:
      !input.live.multiCollab
      && input.live.translatorLabelCount > 0
      && !input.live.translatorUserId,
    nameOnlyGaps,
    missingFromConfirmation: expected.filter(
      (e) => !e.nameOnlyGap && !confirmedKeys.has(slotKey(e.positionKind, e.userId, e.sourceRowId)),
    ),
    extraInConfirmation: input.confirmed.filter(
      (c) => !expectedKeys.has(slotKey(c.positionKind, c.candidateUserId, c.sourceRowId)),
    ),
  };
}
