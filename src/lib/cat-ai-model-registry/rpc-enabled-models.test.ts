import { describe, expect, it } from "vitest";
import { mergeRegistryRows } from "./list-registry-options";
import { mapEnabledModelOptionsToRpc } from "./rpc-enabled-models";

const FIVE_MODEL_IDS = [
  "gpt-5.5",
  "gpt-5.4-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-5.5-pro",
];

function makeOptionRow(modelId: string, sortOrder: number, isDefault: boolean) {
  return {
    id: modelId,
    provider_key: "openai",
    model_id: modelId,
    display_name_zh: modelId,
    usage_hint_zh: `${modelId} hint`,
    short_label_zh: `${modelId} short`,
    enabled: true,
    is_default: isDefault,
    use_case: "general",
    tier: "standard",
    sort_order: sortOrder,
    supports_chat_completions: true,
    supports_responses_api: true,
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
  };
}

describe("mapEnabledModelOptionsToRpc", () => {
  it("maps five curated models in sort_order with camelCase DTO", () => {
    const merged = mergeRegistryRows(
      FIVE_MODEL_IDS.map((id, idx) => makeOptionRow(id, (idx + 1) * 10, id === "gpt-5.5")),
      FIVE_MODEL_IDS.map((id) => ({
        provider_key: "openai",
        model_id: id,
        is_currently_available: true,
        owned_by: "system",
        last_seen_at: "2026-07-06T00:00:00Z",
        provider_created_at: "2026-07-06T00:00:00Z",
      })),
    );

    const dto = mapEnabledModelOptionsToRpc(merged);
    expect(dto).toHaveLength(5);
    expect(dto.map((row) => row.modelId)).toEqual(FIVE_MODEL_IDS);
    expect(dto[0]?.isDefault).toBe(true);
    expect(dto[0]?.modelId).toBe("gpt-5.5");
    expect(dto[4]?.modelId).toBe("gpt-5.5-pro");
    expect(dto[4]?.shortLabelZh).toBe("gpt-5.5-pro short");
    expect(dto.every((row) => row.providerAvailable)).toBe(true);
  });
});
