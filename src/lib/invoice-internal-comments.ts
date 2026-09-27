import type { Invoice } from "@/data/invoice-types";
import type { Json } from "@/integrations/supabase/types";
import { invoiceCommentsFromJson, type InvoiceComment } from "@/lib/invoice-comments";

export type InvoiceInternalCommentRow = {
  invoice_id: string;
  comments: Json;
};

/** 把獨立表列併回請款；沒有列就空陣列，不讀 note／comments。 */
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
  }));
}
