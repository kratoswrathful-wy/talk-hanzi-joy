import type { CaseComment } from "@/data/case-types";
import { mergeCommentList } from "@/lib/comment-model";

export function canToggleClientQuestionForm(input: {
  isAdmin: boolean;
  actorId: string | null | undefined;
  translatorUserIds: readonly string[];
}): boolean {
  if (input.isAdmin) return true;
  const actor = input.actorId ?? "";
  if (!actor) return false;
  return input.translatorUserIds.includes(actor);
}

export function commentIdentity(comment: Pick<CaseComment, "id"> | null | undefined): string | null {
  if (!comment || typeof comment.id !== "string" || !comment.id) return null;
  return comment.id;
}

export type CommentMergeResult =
  | { status: "ok"; next: CaseComment[] }
  | { status: "forbidden"; next: CaseComment[]; reason: string };

/**
 * 以最新儲存為準合併：新則蓋上操作者 ID；刪除依原作者或 PM 以上。
 * isAdmin 僅相容舊呼叫，等同 isPmPlus。
 */
export function mergeCaseComments(input: {
  current: CaseComment[] | null | undefined;
  incoming: CaseComment[] | null | undefined;
  actorId?: string | null;
  isPmPlus?: boolean;
  isAdmin?: boolean;
}): CommentMergeResult {
  return mergeCommentList({
    current: input.current,
    incoming: input.incoming,
    actorId: input.actorId,
    isPmPlus: input.isPmPlus ?? input.isAdmin === true,
  });
}
