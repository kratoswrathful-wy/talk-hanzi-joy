import type { Json } from "@/integrations/supabase/types";
import type { SimplePersistedLog } from "./edit-log-coalesce";

/** 與稿費請款 store 同一套解析契約；缺欄或非陣列視為沒有紀錄。 */
export function editLogsFromJson(raw: Json | null | undefined): SimplePersistedLog[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SimplePersistedLog[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string" || typeof o.changedBy !== "string") continue;
    if (typeof o.description !== "string" || typeof o.timestamp !== "string") continue;
    out.push({
      id: o.id,
      changedBy: o.changedBy,
      description: o.description,
      timestamp: o.timestamp,
      ...(typeof o.fieldKey === "string" ? { fieldKey: o.fieldKey } : {}),
    });
  }
  return out;
}

export function editLogsToJson(logs: SimplePersistedLog[]): Json {
  return logs.map((l) => ({
    id: l.id,
    changedBy: l.changedBy,
    description: l.description,
    timestamp: l.timestamp,
    ...(l.fieldKey ? { fieldKey: l.fieldKey } : {}),
  }));
}

/** 進頁／換單時才用後端紀錄灌畫面；同一張單的留言更新不得清掉本機紀錄。 */
export function hydrateInvoiceEditLogsOnOpen(
  invoiceId: string | undefined,
  persisted: SimplePersistedLog[] | undefined,
): SimplePersistedLog[] {
  if (!invoiceId) return [];
  return persisted ?? [];
}
