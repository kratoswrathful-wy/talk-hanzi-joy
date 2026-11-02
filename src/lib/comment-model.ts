/** 留言／回覆刪除：以可信帳號 ID 判定，不以暱稱。 */

export const COMMENT_DELETED_PLACEHOLDER = "留言已刪除";

export type CommentFileRef = { name: string; url: string };

export type CommentBase = {
  id: string;
  author: string;
  content: string;
  authorUserId?: string;
  deleted?: boolean;
  deletedAt?: string;
  deletedByUserId?: string;
  replyTo?: string;
  imageUrls?: string[];
  fileUrls?: CommentFileRef[];
  createdAt?: string;
};

export function isPmPlusRole(role: string | null | undefined): boolean {
  return role === "pm" || role === "executive";
}

export function isPmPlusRoles(roles: readonly { role: string }[] | null | undefined): boolean {
  return !!roles?.some((r) => isPmPlusRole(r.role));
}

export function trustedAuthorUserId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return undefined;
  }
  return id;
}

export function canDeleteComment(input: {
  comment: Pick<CommentBase, "authorUserId" | "deleted">;
  actorId: string | null | undefined;
  isPmPlus: boolean;
}): boolean {
  if (input.comment.deleted) return false;
  const actor = trustedAuthorUserId(input.actorId);
  if (!actor) return false;
  if (input.isPmPlus) return true;
  const owner = trustedAuthorUserId(input.comment.authorUserId);
  if (!owner) return false;
  return owner === actor;
}

export function tombstoneComment<T extends CommentBase>(comment: T, actorId: string, nowIso: string): T {
  return {
    ...comment,
    content: COMMENT_DELETED_PLACEHOLDER,
    deleted: true,
    deletedAt: nowIso,
    deletedByUserId: actorId,
    imageUrls: undefined,
    fileUrls: undefined,
  };
}

export type CommentDeleteResult<T extends CommentBase> =
  | { status: "ok"; next: T[] }
  | { status: "forbidden"; next: T[]; reason: "comment_not_deletable" | "comment_missing" };

export function applyCommentDelete<T extends CommentBase>(input: {
  current: readonly T[];
  commentId: string;
  actorId: string | null | undefined;
  isPmPlus: boolean;
  nowIso?: string;
}): CommentDeleteResult<T> {
  const current = input.current.slice();
  const target = current.find((c) => c.id === input.commentId);
  if (!target) return { status: "forbidden", next: current, reason: "comment_missing" };
  if (!canDeleteComment({ comment: target, actorId: input.actorId, isPmPlus: input.isPmPlus })) {
    return { status: "forbidden", next: current, reason: "comment_not_deletable" };
  }
  const actor = trustedAuthorUserId(input.actorId);
  if (!actor) return { status: "forbidden", next: current, reason: "comment_not_deletable" };
  const nowIso = input.nowIso ?? new Date().toISOString();
  const keepOthers = current.filter((c) => c.id !== input.commentId);
  const hasLiveChild = keepOthers.some((c) => c.replyTo === input.commentId && !c.deleted);
  if (hasLiveChild) {
    return {
      status: "ok",
      next: current.map((c) => (c.id === input.commentId ? tombstoneComment(c, actor, nowIso) : c)),
    };
  }
  return { status: "ok", next: keepOthers };
}

export type CommentMergeResult<T extends CommentBase> =
  | { status: "ok"; next: T[] }
  | { status: "forbidden"; next: T[]; reason: string };

/**
 * 以最新儲存為準合併：新則追加並蓋上操作者 ID；刪除依原作者或 PM 以上。
 * 既有則的 authorUserId 不得被前端改寫。
 */
export function mergeCommentList<T extends CommentBase>(input: {
  current: readonly T[] | null | undefined;
  incoming: readonly T[] | null | undefined;
  actorId: string | null | undefined;
  isPmPlus: boolean;
  nowIso?: string;
}): CommentMergeResult<T> {
  const current = Array.isArray(input.current) ? input.current.slice() : [];
  const incoming = Array.isArray(input.incoming) ? input.incoming : [];
  const actor = trustedAuthorUserId(input.actorId);
  if (!actor) {
    return { status: "forbidden", next: current, reason: "not_authorized" };
  }

  const currentById = new Map(current.map((c) => [c.id, c]));
  const incomingById = new Map(
    incoming.filter((c) => typeof c.id === "string" && c.id).map((c) => [c.id, c]),
  );

  const toDelete = new Set<string>();
  for (const cur of current) {
    if (cur.deleted) continue;
    const next = incomingById.get(cur.id);
    if (!next || next.deleted === true) toDelete.add(cur.id);
  }

  let working = current.slice();
  for (const id of toDelete) {
    const del = applyCommentDelete({
      current: working,
      commentId: id,
      actorId: actor,
      isPmPlus: input.isPmPlus,
      nowIso: input.nowIso,
    });
    if (del.status === "forbidden") {
      return { status: "forbidden", next: current, reason: del.reason };
    }
    working = del.next;
  }

  const liveIds = new Set(working.map((c) => c.id));
  for (const item of incoming) {
    if (!item.id || liveIds.has(item.id) || item.deleted) continue;
    if (currentById.has(item.id)) continue;
    working.push({
      ...item,
      authorUserId: actor,
      deleted: undefined,
      deletedAt: undefined,
      deletedByUserId: undefined,
    });
    liveIds.add(item.id);
  }

  return { status: "ok", next: working };
}

export function commentPreviewLabel(comment: Pick<CommentBase, "content" | "deleted">): string {
  if (comment.deleted) return COMMENT_DELETED_PLACEHOLDER;
  const text = comment.content.replace(/\s+/g, " ").trim();
  if (!text) return "（無文字）";
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export function extraCommentFields(raw: Record<string, unknown>): Pick<
  CommentBase,
  "authorUserId" | "deleted" | "deletedAt" | "deletedByUserId"
> {
  const authorUserId = trustedAuthorUserId(raw.authorUserId);
  return {
    ...(authorUserId ? { authorUserId } : {}),
    ...(raw.deleted === true ? { deleted: true } : {}),
    ...(typeof raw.deletedAt === "string" ? { deletedAt: raw.deletedAt } : {}),
    ...(trustedAuthorUserId(raw.deletedByUserId)
      ? { deletedByUserId: trustedAuthorUserId(raw.deletedByUserId) }
      : {}),
  };
}

export function extraCommentJson(
  comment: Pick<CommentBase, "authorUserId" | "deleted" | "deletedAt" | "deletedByUserId">,
): Record<string, string | boolean> {
  return {
    ...(comment.authorUserId ? { authorUserId: comment.authorUserId } : {}),
    ...(comment.deleted ? { deleted: true } : {}),
    ...(comment.deletedAt ? { deletedAt: comment.deletedAt } : {}),
    ...(comment.deletedByUserId ? { deletedByUserId: comment.deletedByUserId } : {}),
  };
}
