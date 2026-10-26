export type MemberCollabRowSnap = {
  id: string;
  accepted?: boolean;
  taskCompleted?: boolean;
  reviewTaskCompleted?: boolean;
};

export type MemberCollabWrite =
  | { action: "accept"; rowId: string }
  | { action: "complete_review"; rowIds: string[] }
  | { action: "cancel_review"; rowIds: string[] }
  | { action: "complete_translate"; rowId: string }
  | { action: "cancel_translate"; rowId: string }
  | { action: "none" };

/**
 * 成員在案件頁改共用列時，決定走哪一條寫入。
 * 審稿完成會同時帶起翻譯完成，必須先判審稿，否則會誤走「譯者任務完成」而被拒。
 */
export function resolveMemberCollabWrite(
  previous: MemberCollabRowSnap[],
  next: MemberCollabRowSnap[],
): MemberCollabWrite {
  const accepted = next.find((row) => {
    const prev = previous.find((item) => item.id === row.id);
    return !!row.accepted && !prev?.accepted;
  });
  if (accepted) return { action: "accept", rowId: accepted.id };

  const completedReviews = next.filter((row) => {
    const prev = previous.find((item) => item.id === row.id);
    return !!row.reviewTaskCompleted && !prev?.reviewTaskCompleted;
  });
  if (completedReviews.length) {
    return { action: "complete_review", rowIds: completedReviews.map((row) => row.id) };
  }

  const completedRow = next.find((row) => {
    const prev = previous.find((item) => item.id === row.id);
    return !!row.taskCompleted && !prev?.taskCompleted;
  });
  if (completedRow) return { action: "complete_translate", rowId: completedRow.id };

  const cancelledReviews = next.filter((row) => {
    const prev = previous.find((item) => item.id === row.id);
    return !row.reviewTaskCompleted && !!prev?.reviewTaskCompleted;
  });
  if (cancelledReviews.length) {
    return { action: "cancel_review", rowIds: cancelledReviews.map((row) => row.id) };
  }

  const cancelledTranslate = next.find((row) => {
    const prev = previous.find((item) => item.id === row.id);
    return !row.taskCompleted && !!prev?.taskCompleted;
  });
  if (cancelledTranslate) return { action: "cancel_translate", rowId: cancelledTranslate.id };

  return { action: "none" };
}
