import type { CatAiModelOptionRow } from "./list-registry-options";
import { sortRegistryRows } from "./registry-display";

/** CAT iframe RPC：`db.listEnabledCatAiModelOptions` 單列 DTO（camelCase）。 */
export type CatAiEnabledModelRpcRow = {
  modelId: string;
  displayNameZh: string;
  shortLabelZh: string | null;
  usageHintZh: string | null;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  supportsChatCompletions: boolean;
  supportsResponsesApi: boolean;
  providerAvailable: boolean;
};

export function mapEnabledModelOptionsToRpc(rows: CatAiModelOptionRow[]): CatAiEnabledModelRpcRow[] {
  return sortRegistryRows(rows).map((row) => ({
    modelId: row.model_id,
    displayNameZh: row.display_name_zh,
    shortLabelZh: row.short_label_zh,
    usageHintZh: row.usage_hint_zh,
    enabled: row.enabled,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    supportsChatCompletions: row.supports_chat_completions,
    supportsResponsesApi: row.supports_responses_api,
    providerAvailable: row.providerAvailable,
  }));
}
