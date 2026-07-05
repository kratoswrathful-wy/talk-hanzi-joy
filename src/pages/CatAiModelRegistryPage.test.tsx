import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CatAiModelRegistryPage from "./CatAiModelRegistryPage";
import { fetchCatAiModelRegistryRows } from "@/lib/cat-ai-model-registry/list-registry-options";
import { GPT55_TEMPERATURE_HINT_ZH } from "@/lib/cat-ai-model-registry/model-capabilities";

vi.mock("@/lib/cat-ai-model-registry/list-registry-options", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cat-ai-model-registry/list-registry-options")>();
  return {
    ...actual,
    fetchCatAiModelRegistryRows: vi.fn(),
  };
});

const mockedFetch = vi.mocked(fetchCatAiModelRegistryRows);

describe("CatAiModelRegistryPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders registry rows with default, fallback, temperature hint, and null copy", async () => {
    mockedFetch.mockResolvedValue([
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
        providerAvailable: true,
        owned_by: "openai",
        last_seen_at: "2026-07-05T02:19:54Z",
        provider_created_at: "2026-04-22T00:00:00Z",
      },
      {
        id: "2",
        provider_key: "openai",
        model_id: "gpt-4.1-mini",
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
        providerAvailable: true,
        owned_by: "openai",
        last_seen_at: "2026-07-05T02:19:54Z",
        provider_created_at: "2025-04-10T00:00:00Z",
      },
    ]);

    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(CatAiModelRegistryPage)),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = container.textContent ?? "";
    expect(text).toContain("GPT-5.5");
    expect(text).toContain("目前 default");
    expect(text).toContain("fallback");
    expect(text).toContain(GPT55_TEMPERATURE_HINT_ZH);
    expect(text).toContain("（未設定）");
  });
});
