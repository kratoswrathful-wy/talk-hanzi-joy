import type { TranslatorFee } from "@/data/fee-mock-data";
import { supabase } from "@/integrations/supabase/client";
import type { SelectOption } from "@/stores/select-options-store";

/** Match TranslatorFeeDetail: option by label or email, then email for DB lookup. */
export function resolveAssigneeEmail(assignee: string, options: SelectOption[]): string {
  const opt = options.find((o) => o.label === assignee || o.email === assignee);
  return opt?.email || assignee;
}

export async function fetchNoFeeByEmails(emails: string[]): Promise<Map<string, boolean>> {
  const unique = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("member_translator_settings")
    .select("email, no_fee")
    .in("email", unique);

  const map = new Map<string, boolean>();
  if (error || !data) {
    for (const e of unique) map.set(e, false);
    return map;
  }
  for (const row of data as { email: string; no_fee: boolean | null }[]) {
    map.set(row.email, !!row.no_fee);
  }
  for (const e of unique) {
    if (!map.has(e)) map.set(e, false);
  }
  return map;
}

export type FinalizeEligibility =
  | { ok: true }
  | { ok: false; reason: string };

/** Same rules as TranslatorFeeDetail toolbar「開立稿費條」+ no_fee lookup. */
export function getFinalizeEligibility(
  fee: TranslatorFee,
  ctx: { assigneeOptions: SelectOption[]; noFeeByEmail: Map<string, boolean> }
): FinalizeEligibility {
  if (fee.status !== "draft") {
    return { ok: false, reason: "已向譯者開立稿費條，無法再次開立" };
  }
  if (!fee.assignee?.trim()) {
    return { ok: false, reason: "請先選擇譯者，才能開立稿費條。" };
  }
  const email = resolveAssigneeEmail(fee.assignee, ctx.assigneeOptions);
  const isNoFeeTranslator = ctx.noFeeByEmail.get(email) ?? false;
  if (!isNoFeeTranslator && !fee.clientInfo?.rateConfirmed) {
    return { ok: false, reason: "請先勾選「費率無誤」" };
  }
  return { ok: true };
}
