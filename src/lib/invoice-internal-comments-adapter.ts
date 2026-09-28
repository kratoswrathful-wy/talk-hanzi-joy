import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { invoiceCommentsFromJson, invoiceCommentsToJson } from "@/lib/invoice-comments";
import type { Invoice } from "@/data/invoice-types";
import {
  applyInternalCommentsFetch,
  type InternalCommentsFetchResult,
  type InvoiceInternalCommentRow,
} from "@/lib/invoice-internal-comments";
import type { InternalCommentRemote, InternalCommentWriteOp } from "@/lib/invoice-internal-comments-write";

export type InvoiceInternalCommentsClient = SupabaseClient<Database>;

function errorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    return String((error as { code?: string }).code ?? "");
  }
  return "";
}

/** 產品載入內部備註：只讀獨立表，失敗不當空白。store 與隔離測試共用。 */
export async function fetchInvoiceInternalCommentRows(
  client: InvoiceInternalCommentsClient,
  invoiceIds: string[],
): Promise<InternalCommentsFetchResult> {
  if (invoiceIds.length === 0) return { ok: true, rows: [] };
  try {
    const { data, error } = await client
      .from("invoice_internal_comments")
      .select("invoice_id, comments")
      .in("invoice_id", invoiceIds);
    if (error) return { ok: false, error };
    return { ok: true, rows: (data ?? []) as InvoiceInternalCommentRow[] };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function fetchInvoiceInternalCommentRowForWrite(
  client: InvoiceInternalCommentsClient,
  id: string,
): Promise<InternalCommentRemote> {
  try {
    const { data, error } = await client
      .from("invoice_internal_comments")
      .select("invoice_id, comments, updated_at")
      .eq("invoice_id", id)
      .maybeSingle();
    if (error) return { ok: false, error };
    if (!data) return { ok: true, comments: [], updatedAt: null, exists: false };
    return {
      ok: true,
      comments: invoiceCommentsFromJson(data.comments),
      updatedAt: data.updated_at,
      exists: true,
    };
  } catch (error) {
    return { ok: false, error };
  }
}

/** 與 fetchInvoiceById／清單載入同一條讀回入口。 */
export async function resolveInvoiceInternalComments(
  client: InvoiceInternalCommentsClient,
  invoices: Invoice[],
  previousById: Map<string, Invoice>,
): Promise<Invoice[]> {
  const fetch = await fetchInvoiceInternalCommentRows(client, invoices.map((inv) => inv.id));
  return applyInternalCommentsFetch(invoices, previousById, fetch);
}

/** 產品實際 insert／條件更新接線。測試不得另寫一套保存邏輯。 */
export function createInvoiceInternalCommentsAdapter(
  client: InvoiceInternalCommentsClient,
  opts: { invoiceId: string; env: string; uid: string | null },
) {
  const { invoiceId, env, uid } = opts;
  return {
    fetchRemote: () => fetchInvoiceInternalCommentRowForWrite(client, invoiceId),
    insertRow: async ({ comments, updatedAt }: { comments: Parameters<typeof invoiceCommentsToJson>[0]; updatedAt: string }): Promise<InternalCommentWriteOp> => {
      try {
        const { error: insertError } = await client.from("invoice_internal_comments").insert({
          invoice_id: invoiceId,
          env,
          comments: invoiceCommentsToJson(comments),
          updated_at: updatedAt,
          updated_by: uid,
        });
        if (!insertError) return { ok: true };
        return { ok: false, error: insertError, conflict: errorCode(insertError) === "23505" };
      } catch (error) {
        return { ok: false, error };
      }
    },
    casUpdate: async ({
      comments,
      updatedAt,
      expectedUpdatedAt,
    }: {
      comments: Parameters<typeof invoiceCommentsToJson>[0];
      updatedAt: string;
      expectedUpdatedAt: string | null;
    }): Promise<InternalCommentWriteOp & { wrote?: boolean }> => {
      try {
        const { data: casRow, error: casError } = await client
          .from("invoice_internal_comments")
          .update({
            comments: invoiceCommentsToJson(comments),
            updated_at: updatedAt,
            updated_by: uid,
          })
          .eq("invoice_id", invoiceId)
          .eq("updated_at", expectedUpdatedAt)
          .select("invoice_id")
          .maybeSingle();
        if (casError) return { ok: false, error: casError };
        if (!casRow) {
          return {
            ok: false,
            error: new Error("內部備註同時有其他人更新，請再送一次"),
            conflict: true,
            wrote: false,
          };
        }
        return { ok: true, wrote: true };
      } catch (error) {
        return { ok: false, error };
      }
    },
  };
}
