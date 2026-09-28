import type { InvoiceComment } from "@/lib/invoice-comments";
import { mergeInvoiceInternalComments } from "@/lib/invoice-internal-comments";

export type InternalCommentRemote =
  | { ok: true; comments: InvoiceComment[]; updatedAt: string | null; exists: boolean }
  | { ok: false; error: unknown };

export type InternalCommentWriteOp =
  | { ok: true }
  | { ok: false; error: unknown; conflict?: boolean };

export type PersistInvoiceInternalCommentsDeps = {
  incoming: InvoiceComment[];
  fetchRemote: () => Promise<InternalCommentRemote>;
  insertRow: (input: { comments: InvoiceComment[]; updatedAt: string }) => Promise<InternalCommentWriteOp>;
  casUpdate: (input: {
    comments: InvoiceComment[];
    updatedAt: string;
    expectedUpdatedAt: string | null;
  }) => Promise<InternalCommentWriteOp & { wrote?: boolean }>;
  now?: () => string;
  maxAttempts?: number;
};

export type PersistInvoiceInternalCommentsResult =
  | { ok: true; wrote: InvoiceComment[] }
  | { ok: false; error: unknown };

/**
 * 讀取 → 合併 → 新增或依 updated_at 條件更新；衝突有限重試。
 * 寫入完成後若呼叫端收不到回應，重試必須帶同一批 id。
 */
export async function persistInvoiceInternalComments(
  deps: PersistInvoiceInternalCommentsDeps,
): Promise<PersistInvoiceInternalCommentsResult> {
  const maxAttempts = deps.maxAttempts ?? 3;
  const nowFn = deps.now ?? (() => new Date().toISOString());
  let lastError: unknown = new Error("內部備註寫入未完成");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remote = await deps.fetchRemote();
    if (remote.ok === false) {
      return { ok: false, error: remote.error };
    }
    const merged = mergeInvoiceInternalComments(remote.comments, deps.incoming);
    const updatedAt = nowFn();
    if (!remote.exists) {
      const inserted = await deps.insertRow({ comments: merged, updatedAt });
      if (inserted.ok === true) return { ok: true, wrote: merged };
      lastError = inserted.error;
      if (inserted.conflict) continue;
      return { ok: false, error: inserted.error };
    }
    const updated = await deps.casUpdate({
      comments: merged,
      updatedAt,
      expectedUpdatedAt: remote.updatedAt,
    });
    if (updated.ok === true && updated.wrote !== false) return { ok: true, wrote: merged };
    lastError = updated.ok === false
      ? updated.error
      : new Error("內部備註同時有其他人更新，請再送一次");
    if (updated.ok === false && (updated.conflict || updated.wrote === false)) continue;
    return { ok: false, error: lastError };
  }
  return { ok: false, error: lastError };
}
