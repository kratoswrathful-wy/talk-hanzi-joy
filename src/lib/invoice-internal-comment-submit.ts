import type { InvoiceComment } from "@/lib/invoice-comments";
import { allocateInternalCommentId, shouldRefuseInternalCommentWrite } from "@/lib/invoice-internal-comments";

export type InternalCommentDraftInput = {
  content: string;
  author: string;
  timestamp: string;
  imageUrls?: string[];
  fileUrls?: { name: string; url: string }[];
  replyTo?: string;
};

export type InternalCommentSubmitOk = {
  ok: true;
  comments: InvoiceComment[];
  commentId: string;
};

export type InternalCommentSubmitFail = {
  ok: false;
  refused?: boolean;
  error?: unknown;
  draft: InvoiceComment;
  commentId: string;
  incoming: InvoiceComment[];
};

/** 頁面送出／重試沿用同一則 id；測試不得替它指定相同識別。 */
export function createInternalCommentSubmitSession() {
  let pendingId: string | null = null;
  return {
    pendingId: () => pendingId,
    async submit(opts: {
      input: InternalCommentDraftInput;
      known: boolean | undefined;
      currentComments: InvoiceComment[];
      persist: (incoming: InvoiceComment[]) => Promise<{ error: unknown }>;
    }): Promise<InternalCommentSubmitOk | InternalCommentSubmitFail> {
      const commentId = allocateInternalCommentId(pendingId);
      pendingId = commentId;
      const draft: InvoiceComment = {
        id: commentId,
        author: opts.input.author,
        content: opts.input.content,
        timestamp: opts.input.timestamp,
        ...(opts.input.imageUrls ? { imageUrls: opts.input.imageUrls } : {}),
        ...(opts.input.fileUrls ? { fileUrls: opts.input.fileUrls } : {}),
        ...(opts.input.replyTo ? { replyTo: opts.input.replyTo } : {}),
      };
      const incoming = [...opts.currentComments, draft];
      if (shouldRefuseInternalCommentWrite(opts.known)) {
        return { ok: false, refused: true, draft, commentId, incoming };
      }
      const { error } = await opts.persist(incoming);
      if (error) return { ok: false, error, draft, commentId, incoming };
      pendingId = null;
      return { ok: true, comments: incoming, commentId };
    },
  };
}
