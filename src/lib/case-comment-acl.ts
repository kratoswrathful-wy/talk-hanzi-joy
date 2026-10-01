import type { CaseComment } from "@/data/case-types";

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
 * 一般成員只能追加留言，不能整包覆寫刪掉別人的。
 * 主管可以刪。
 */
export function mergeCaseComments(input: {
  current: CaseComment[] | null | undefined;
  incoming: CaseComment[] | null | undefined;
  isAdmin: boolean;
}): CommentMergeResult {
  const current = Array.isArray(input.current) ? input.current : [];
  const incoming = Array.isArray(input.incoming) ? input.incoming : [];
  const currentIds = new Set(current.map((c) => commentIdentity(c)).filter(Boolean));
  const incomingIds = new Set(incoming.map((c) => commentIdentity(c)).filter(Boolean));

  if (!input.isAdmin) {
    for (const id of currentIds) {
      if (id && !incomingIds.has(id)) {
        return { status: "forbidden", next: current, reason: "comment_not_deletable" };
      }
    }
  }

  if (input.isAdmin) {
    return { status: "ok", next: incoming };
  }

  const next = [...current];
  const live = new Set(currentIds);
  for (const item of incoming) {
    const id = commentIdentity(item);
    if (!id || live.has(id)) continue;
    next.push(item);
    live.add(id);
  }
  return { status: "ok", next };
}
