import { describe, expect, it } from "vitest";
import { mergeRegistryRows } from "./list-registry-options";
import {
  FALLBACK_MODEL_ID,
  formatNullableZh,
  getRegistryRowFlags,
  sortRegistryRows,
} from "./registry-display";

describe("mergeRegistryRows", () => {
  it("joins provider availability by provider_key + model_id", () => {
    const rows = mergeRegistryRows(
      [
        {
          id: "1",
          provider_key: "openai",
          model_id: "gpt-5.5",
          display_name_zh: "GPT-5.5",
          usage_hint_zh: null,
          short_label_zh: null,
          enabled: true,
          is_default: true,
          use_case: "general",
          tier: "standard",
          sort_order: 999,
          supports_chat_completions: true,
          supports_responses_api: true,
          created_at: "2026-07-05T00:00:00Z",
          updated_at: "2026-07-05T00:00:00Z",
        },
        {
          id: "2",
          provider_key: "openai",
          model_id: FALLBACK_MODEL_ID,
          display_name_zh: "GPT-4.1 mini",
          usage_hint_zh: "快速省錢",
          short_label_zh: "快速省錢",
          enabled: true,
          is_default: false,
          use_case: "pretranslate",
          tier: "fast",
          sort_order: 10,
          supports_chat_completions: true,
          supports_responses_api: true,
          created_at: "2026-07-04T00:00:00Z",
          updated_at: "2026-07-04T00:00:00Z",
        },
      ],
      [
        {
          provider_key: "openai",
          model_id: "gpt-5.5",
          is_currently_available: true,
          owned_by: "openai",
          last_seen_at: "2026-07-05T02:19:54Z",
          provider_created_at: "2026-04-22T00:00:00Z",
        },
        {
          provider_key: "openai",
          model_id: FALLBACK_MODEL_ID,
          is_currently_available: true,
          owned_by: "openai",
          last_seen_at: "2026-07-05T02:19:54Z",
          provider_created_at: "2025-04-10T00:00:00Z",
        },
      ],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.model_id).toBe(FALLBACK_MODEL_ID);
    expect(rows[1]?.model_id).toBe("gpt-5.5");
    expect(rows[1]?.providerAvailable).toBe(true);
  });

  it("marks missing provider row as unavailable", () => {
    const rows = mergeRegistryRows(
      [
        {
          id: "x",
          provider_key: "openai",
          model_id: "missing-model",
          display_name_zh: "Missing",
          usage_hint_zh: null,
          short_label_zh: null,
          enabled: false,
          is_default: false,
          use_case: "general",
          tier: "standard",
          sort_order: 500,
          supports_chat_completions: true,
          supports_responses_api: true,
          created_at: "2026-07-05T00:00:00Z",
          updated_at: "2026-07-05T00:00:00Z",
        },
      ],
      [],
    );
    expect(rows[0]?.providerAvailable).toBe(false);
  });
});

describe("registry display helpers", () => {
  it("flags default, fallback, temperature, and null copy", () => {
    const defaultFlags = getRegistryRowFlags({
      model_id: "gpt-5.5",
      enabled: true,
      is_default: true,
      usage_hint_zh: null,
      short_label_zh: null,
      providerAvailable: true,
    });
    expect(defaultFlags.isDefault).toBe(true);
    expect(defaultFlags.omitTemperature).toBe(true);
    expect(defaultFlags.missingUsageHint).toBe(true);

    const fallbackFlags = getRegistryRowFlags({
      model_id: FALLBACK_MODEL_ID,
      enabled: true,
      is_default: false,
      usage_hint_zh: "hint",
      short_label_zh: "label",
      providerAvailable: true,
    });
    expect(fallbackFlags.isFallback).toBe(true);
    expect(fallbackFlags.omitTemperature).toBe(false);
  });

  it("formatNullableZh does not crash on null", () => {
    expect(formatNullableZh(null)).toBe("（未設定）");
    expect(formatNullableZh("  ")).toBe("（未設定）");
    expect(formatNullableZh("已有文案")).toBe("已有文案");
  });

  it("sortRegistryRows orders by sort_order then name", () => {
    const sorted = sortRegistryRows([
      { sort_order: 999, display_name_zh: "Z" },
      { sort_order: 10, display_name_zh: "A" },
    ]);
    expect(sorted[0]?.sort_order).toBe(10);
  });
});
