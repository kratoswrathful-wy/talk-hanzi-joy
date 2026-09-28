import type { Invoice } from "@/data/invoice-types";
import type { Json } from "@/integrations/supabase/types";
import { invoiceCommentsFromJson, type InvoiceComment } from "@/lib/invoice-comments";

export type InvoiceInternalCommentRow = {
  invoice_id: string;
  comments: Json;
};

export type InternalCommentsFetchResult =
  | { ok: true; rows: InvoiceInternalCommentRow[] }
  | { ok: false; error: unknown };

/** 把獨立表列併回請款；沒有列就空陣列，不讀 note／comments。只用於讀取成功。 */
export function attachInvoiceInternalComments(
  invoices: Invoice[],
  rows: InvoiceInternalCommentRow[] | null | undefined,
): Invoice[] {
  const map = new Map<string, InvoiceComment[]>();
  for (const row of rows ?? []) {
    if (!row?.invoice_id) continue;
    map.set(row.invoice_id, invoiceCommentsFromJson(row.comments));
  }
  return invoices.map((inv) => ({
    ...inv,
    internalComments: map.get(inv.id) ?? [],
    internalCommentsKnown: true,
  }));
}

/** 讀取失敗時保留本單已知內部備註，不把未知當成空白。 */
export function applyInternalCommentsFetch(
  invoices: Invoice[],
  previousById: Map<string, Invoice>,
  fetch: InternalCommentsFetchResult,
): Invoice[] {
  if (fetch.ok) {
    return attachInvoiceInternalComments(invoices, fetch.rows);
  }
  return invoices.map((inv) => {
    const prev = previousById.get(inv.id);
    return {
      ...inv,
      internalComments: prev?.internalComments ?? [],
      internalCommentsKnown: false,
    };
  });
}

/** 讀取未完成時不得把未知內容寫回。undefined 表示尚未標記者，不擋。 */
export function shouldRefuseInternalCommentWrite(known: boolean | undefined): boolean {
  return known === false;
}

/** 未知結果重試必須沿用同一則 id，避免同內容再新增一筆。新則不可只靠同一毫秒。 */
export function allocateInternalCommentId(pendingId: string | null | undefined): string {
  if (pendingId && pendingId.trim()) return pendingId;
  return `icomment-${crypto.randomUUID()}`;
}

/** 後端已有列優先，再接前端多出的新則；同 id 不重複、不互蓋。 */
export function mergeInvoiceInternalComments(
  server: InvoiceComment[],
  incoming: InvoiceComment[],
): InvoiceComment[] {
  const seen = new Set<string>();
  const out: InvoiceComment[] = [];
  for (const list of [server, incoming]) {
    for (const comment of list) {
      if (!comment?.id || seen.has(comment.id)) continue;
      out.push(comment);
      seen.add(comment.id);
    }
  }
  return out;
}
