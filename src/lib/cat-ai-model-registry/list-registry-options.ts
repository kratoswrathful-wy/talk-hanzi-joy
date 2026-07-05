import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { sortRegistryRows } from "./registry-display";

export const CAT_AI_MODEL_OPTIONS_LIST_COLUMNS =
  "id, provider_key, model_id, display_name_zh, usage_hint_zh, short_label_zh, enabled, is_default, use_case, tier, sort_order, supports_chat_completions, supports_responses_api, created_at, updated_at" as const;

export const AI_PROVIDER_MODELS_LIST_COLUMNS =
  "provider_key, model_id, is_currently_available, owned_by, last_seen_at, provider_created_at" as const;

type CatAiModelOptionListRow = Pick<
  Database["public"]["Tables"]["cat_ai_model_options"]["Row"],
  | "id"
  | "provider_key"
  | "model_id"
  | "display_name_zh"
  | "usage_hint_zh"
  | "short_label_zh"
  | "enabled"
  | "is_default"
  | "use_case"
  | "tier"
  | "sort_order"
  | "supports_chat_completions"
  | "supports_responses_api"
  | "created_at"
  | "updated_at"
>;

type AiProviderModelListRow = Pick<
  Database["public"]["Tables"]["ai_provider_models"]["Row"],
  "provider_key" | "model_id" | "is_currently_available" | "owned_by" | "last_seen_at" | "provider_created_at"
>;

export type CatAiModelRegistryRow = CatAiModelOptionListRow & {
  providerAvailable: boolean;
  owned_by: string | null;
  last_seen_at: string | null;
  provider_created_at: string | null;
};

function providerModelKey(providerKey: string, modelId: string): string {
  return `${providerKey}\0${modelId}`;
}

export function mergeRegistryRows(
  options: CatAiModelOptionListRow[],
  providerModels: AiProviderModelListRow[],
): CatAiModelRegistryRow[] {
  const providerByKey = new Map<string, AiProviderModelListRow>();
  for (const pm of providerModels) {
    providerByKey.set(providerModelKey(pm.provider_key, pm.model_id), pm);
  }

  const merged = options.map((opt) => {
    const pm = providerByKey.get(providerModelKey(opt.provider_key, opt.model_id));
    return {
      ...opt,
      providerAvailable: pm?.is_currently_available ?? false,
      owned_by: pm?.owned_by ?? null,
      last_seen_at: pm?.last_seen_at ?? null,
      provider_created_at: pm?.provider_created_at ?? null,
    };
  });

  return sortRegistryRows(merged);
}

export async function fetchCatAiModelRegistryRows(): Promise<CatAiModelRegistryRow[]> {
  const [optionsRes, providerRes] = await Promise.all([
    supabase
      .from("cat_ai_model_options")
      .select(CAT_AI_MODEL_OPTIONS_LIST_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("display_name_zh", { ascending: true }),
    supabase.from("ai_provider_models").select(AI_PROVIDER_MODELS_LIST_COLUMNS),
  ]);

  if (optionsRes.error) {
    throw new Error(optionsRes.error.message);
  }
  if (providerRes.error) {
    throw new Error(providerRes.error.message);
  }

  return mergeRegistryRows(optionsRes.data ?? [], providerRes.data ?? []);
}
