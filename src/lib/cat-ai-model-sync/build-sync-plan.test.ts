import { describe, expect, it } from "vitest";
import { buildSyncPlan } from "./build-sync-plan";

describe("buildSyncPlan", () => {
  it("creates provider model upserts and option drafts for new stable models", () => {
    const plan = buildSyncPlan({
      providerKey: "openai",
      openAiModels: [
        { id: "gpt-4.1-mini", object: "model", owned_by: "openai", created: 1700000000 },
        { id: "gpt-5-mini", object: "model", owned_by: "openai", created: 1700000001 },
      ],
      existingProviderModelIds: ["gpt-4.1-mini"],
      existingOptionIds: ["gpt-4.1-mini"],
    });

    expect(plan.discoveredCount).toBe(2);
    expect(plan.filteredCount).toBe(2);
    expect(plan.providerModelUpserts.map((u) => u.model_id).sort()).toEqual(
      ["gpt-4.1-mini", "gpt-5-mini"].sort(),
    );

    // gpt-4.1-mini 已存在於 cat_ai_model_options，不得再次進入新草稿（保護既有 seed）。
    expect(plan.optionDrafts.map((o) => o.model_id)).toEqual(["gpt-5-mini"]);
    const draft = plan.optionDrafts[0];
    expect(draft.enabled).toBe(false);
    expect(draft.is_default).toBe(false);
    expect(draft.display_name_zh).toBe("GPT-5 mini");
  });

  it("does not touch existing gpt-4.1-mini option even though it is a stable candidate", () => {
    const plan = buildSyncPlan({
      providerKey: "openai",
      openAiModels: [{ id: "gpt-4.1-mini", object: "model" }],
      existingProviderModelIds: ["gpt-4.1-mini"],
      existingOptionIds: ["gpt-4.1-mini"],
    });
    expect(plan.optionDrafts).toEqual([]);
  });

  it("does not create option drafts for preview models even if new", () => {
    const plan = buildSyncPlan({
      providerKey: "openai",
      openAiModels: [{ id: "gpt-4.5-preview", object: "model" }],
      existingProviderModelIds: [],
      existingOptionIds: [],
    });
    expect(plan.providerModelUpserts.map((u) => u.model_id)).toEqual(["gpt-4.5-preview"]);
    expect(plan.optionDrafts).toEqual([]);
  });

  it("marks DB models missing from this sync as unavailable without deleting", () => {
    const plan = buildSyncPlan({
      providerKey: "openai",
      openAiModels: [{ id: "gpt-4.1-mini", object: "model" }],
      existingProviderModelIds: ["gpt-4.1-mini", "gpt-4-turbo-legacy"],
      existingOptionIds: ["gpt-4.1-mini"],
    });
    expect(plan.providerModelMissing).toEqual([
      { provider_key: "openai", model_id: "gpt-4-turbo-legacy", is_currently_available: false },
    ]);
  });

  it("excludes non-chat models from provider model upserts entirely", () => {
    const plan = buildSyncPlan({
      providerKey: "openai",
      openAiModels: [
        { id: "gpt-4.1-mini", object: "model" },
        { id: "whisper-1", object: "model" },
        { id: "text-embedding-3-small", object: "model" },
      ],
      existingProviderModelIds: [],
      existingOptionIds: [],
    });
    expect(plan.providerModelUpserts.map((u) => u.model_id)).toEqual(["gpt-4.1-mini"]);
    expect(plan.filteredCount).toBe(1);
    expect(plan.discoveredCount).toBe(3);
  });

  it("returns empty plan when OpenAI returns no models", () => {
    const plan = buildSyncPlan({
      providerKey: "openai",
      openAiModels: [],
      existingProviderModelIds: ["gpt-4.1-mini"],
      existingOptionIds: ["gpt-4.1-mini"],
    });
    expect(plan.providerModelUpserts).toEqual([]);
    expect(plan.optionDrafts).toEqual([]);
    // 既有的 gpt-4.1-mini 這次沒回傳 → 標 unavailable，但不刪除。
    expect(plan.providerModelMissing).toEqual([
      { provider_key: "openai", model_id: "gpt-4.1-mini", is_currently_available: false },
    ]);
  });
});
