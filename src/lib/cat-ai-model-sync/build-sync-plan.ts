/**
 * CAT AI Model Registry Phase 2：依 OpenAI 回應與既有 DB 狀態，計算本次同步的寫入計畫。
 *
 * 型別化 re-export——**唯一權威實作**在 [`api/lib/model-sync-rules.js`](../../../api/lib/model-sync-rules.js)，
 * 理由見 [`filter-openai-models.ts`](./filter-openai-models.ts) 檔頭說明。
 *
 * 非破壞性原則（見 docs/CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md Phase 2）：
 *   - 不刪除既有 ai_provider_models 列，本次未回傳者只標 is_currently_available=false。
 *   - cat_ai_model_options 只對「穩定候選且 DB 尚無此 model_id」的模型建立新草稿；
 *     既有列一律 skip，不 update（保護人工設定與 gpt-4.1-mini seed）。
 *   - 新草稿一律 enabled=false、is_default=false。
 */

import { buildSyncPlan as buildSyncPlanImpl } from "../../../api/lib/model-sync-rules.js";
import type { OpenAiModelEntry } from "./filter-openai-models";

export interface ProviderModelUpsert {
  provider_key: string;
  model_id: string;
  owned_by: string | null;
  api_object: string | null;
  provider_created_at: string | null;
  is_currently_available: boolean;
  raw: Record<string, unknown>;
}

export interface ProviderModelMissingUpdate {
  provider_key: string;
  model_id: string;
  is_currently_available: false;
}

export interface OptionDraftInsert {
  provider_key: string;
  model_id: string;
  enabled: false;
  is_default: false;
  display_name_zh: string;
  use_case: "general";
  tier: "standard";
  sort_order: 999;
}

export interface SyncPlan {
  providerKey: string;
  discoveredCount: number;
  filteredCount: number;
  providerModelUpserts: ProviderModelUpsert[];
  providerModelMissing: ProviderModelMissingUpdate[];
  optionDrafts: OptionDraftInsert[];
}

export interface BuildSyncPlanInput {
  providerKey: string;
  openAiModels: OpenAiModelEntry[];
  existingProviderModelIds: string[];
  existingOptionIds: string[];
}

export function buildSyncPlan(input: BuildSyncPlanInput): SyncPlan {
  return buildSyncPlanImpl(input) as SyncPlan;
}
