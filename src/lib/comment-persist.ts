import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthRecoverableError, getAuthenticatedUser } from "@/lib/auth-ready";
import { applyCommentDelete, isPmPlusRoles, mergeCommentList, type CommentBase } from "@/lib/comment-model";

export async function loadCommentActor(
  supabase: SupabaseClient,
): Promise<{ actorId: string | null; isPmPlus: boolean }> {
  const user = await getAuthenticatedUser().catch((e) => {
    if (e instanceof AuthRecoverableError) return null;
    throw e;
  });
  const actorId = user?.id ?? null;
  if (!actorId) return { actorId: null, isPmPlus: false };
  const table = supabase.from("user_roles") as { select?: (cols: string) => { eq: (col: string, id: string) => Promise<{ data: { role: string }[] | null }> } };
  if (typeof table.select !== "function") return { actorId, isPmPlus: false };
  try {
    const { data } = await table.select("role").eq("user_id", actorId);
    return { actorId, isPmPlus: isPmPlusRoles(data) };
  } catch {
    return { actorId, isPmPlus: false };
  }
}

export function mergeCommentField<T extends CommentBase>(input: {
  current: readonly T[] | null | undefined;
  incoming: readonly T[] | null | undefined;
  actorId: string | null;
  isPmPlus: boolean;
}): { ok: true; next: T[] } | { ok: false; error: Error } {
  const merged = mergeCommentList({
    current: input.current,
    incoming: input.incoming,
    actorId: input.actorId,
    isPmPlus: input.isPmPlus,
  });
  if (merged.status === "forbidden") {
    return { ok: false, error: new Error(merged.reason) };
  }
  return { ok: true, next: merged.next };
}

export async function persistCommentDelete<T extends CommentBase>(input: {
  current: readonly T[];
  commentId: string;
  actorId: string | null | undefined;
  isPmPlus: boolean;
  persist: (next: T[]) => Promise<boolean>;
}): Promise<{ ok: true; next: T[] } | { ok: false; reason: "forbidden" | "failed" }> {
  const result = applyCommentDelete({
    current: input.current,
    commentId: input.commentId,
    actorId: input.actorId,
    isPmPlus: input.isPmPlus,
  });
  if (result.status === "forbidden") return { ok: false, reason: "forbidden" };
  const saved = await input.persist(result.next);
  return saved ? { ok: true, next: result.next } : { ok: false, reason: "failed" };
}
