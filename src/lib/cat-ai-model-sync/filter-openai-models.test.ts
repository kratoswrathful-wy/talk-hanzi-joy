import { describe, expect, it } from "vitest";
import { classifyOpenAiModel, filterOpenAiModels, humanizeModelId } from "./filter-openai-models";

describe("classifyOpenAiModel", () => {
  it("recognizes gpt- prefix as recordable and stable", () => {
    const c = classifyOpenAiModel("gpt-4.1-mini");
    expect(c.recordable).toBe(true);
    expect(c.isPreview).toBe(false);
    expect(c.isStableCandidate).toBe(true);
  });

  it("recognizes o-series (o1/o3/o4) as recordable", () => {
    expect(classifyOpenAiModel("o1").recordable).toBe(true);
    expect(classifyOpenAiModel("o3-mini").recordable).toBe(true);
    expect(classifyOpenAiModel("o4-mini").recordable).toBe(true);
  });

  it("recognizes chatgpt- prefix as recordable", () => {
    expect(classifyOpenAiModel("chatgpt-4o-latest").recordable).toBe(true);
  });

  it.each([
    "text-embedding-3-small",
    "whisper-1",
    "tts-1",
    "dall-e-3",
    "gpt-image-1",
    "gpt-4o-audio-preview",
    "gpt-4o-realtime-preview",
    "text-moderation-latest",
    "gpt-4o-transcribe",
    "davinci-002",
    "ft:gpt-4.1-mini:acme::abc123",
  ])("excludes non-chat model %s", (id) => {
    expect(classifyOpenAiModel(id).recordable).toBe(false);
  });

  it("marks preview/experimental models as recordable but not stable candidates", () => {
    const preview = classifyOpenAiModel("gpt-4.5-preview");
    expect(preview.recordable).toBe(true);
    expect(preview.isPreview).toBe(true);
    expect(preview.isStableCandidate).toBe(false);

    const exp = classifyOpenAiModel("gpt-5-experimental");
    expect(exp.recordable).toBe(true);
    expect(exp.isPreview).toBe(true);
    expect(exp.isStableCandidate).toBe(false);
  });

  it("does not misclassify unrelated ids as gpt/o-series", () => {
    expect(classifyOpenAiModel("babbage-002").recordable).toBe(false);
    expect(classifyOpenAiModel("omni-moderation-latest").recordable).toBe(false);
  });
});

describe("filterOpenAiModels", () => {
  it("splits recordable vs stable candidates, excluding preview from stable", () => {
    const entries = [
      { id: "gpt-4.1-mini", object: "model" },
      { id: "gpt-4.5-preview", object: "model" },
      { id: "whisper-1", object: "model" },
      { id: "o3-mini", object: "model" },
    ];
    const result = filterOpenAiModels(entries);
    expect(result.recordable.map((m) => m.id).sort()).toEqual(
      ["gpt-4.1-mini", "gpt-4.5-preview", "o3-mini"].sort(),
    );
    expect(result.stableCandidates.map((m) => m.id).sort()).toEqual(
      ["gpt-4.1-mini", "o3-mini"].sort(),
    );
  });

  it("returns empty arrays for empty input", () => {
    const result = filterOpenAiModels([]);
    expect(result.recordable).toEqual([]);
    expect(result.stableCandidates).toEqual([]);
  });
});

describe("humanizeModelId", () => {
  it("uppercases the first segment and joins remaining with spaces", () => {
    expect(humanizeModelId("gpt-4.1-mini")).toBe("GPT-4.1 mini");
  });

  it("handles single-segment ids", () => {
    expect(humanizeModelId("o1")).toBe("O1");
  });
});
