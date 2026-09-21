import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

function loadCatAiTranslate() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../cat-tool/js");
  const tempModule = { exports: {} };
  vm.runInNewContext(readFileSync(path.join(root, "ai-model-temperature.js"), "utf8"), {
    module: tempModule,
    exports: tempModule.exports,
    globalThis: {},
    self: {},
    window: {},
  });
  const window = {
    CatAiModelTemperature: tempModule.exports,
    __catAiLastChatRequest: undefined,
  };
  const captured = [];
  const sandbox = {
    window,
    location: { origin: "http://cat.test" },
    fetch: async (url, init) => {
      const payload = JSON.parse(String(init.body));
      captured.push({ url: String(url), model: payload.openaiBody.model });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({ translations: [{ idx: 0, translation: "合成譯文" }] }),
                },
              },
            ],
          };
        },
      };
    },
  };
  vm.runInNewContext(readFileSync(path.join(root, "ai-translate.js"), "utf8"), sandbox);
  return { translate: window.CatAiTranslate.translate, captured, window };
}

describe("CatAiTranslate request model (cat-tool/js/ai-translate.js)", () => {
  afterEach(() => {
    // no shared globals
  });

  it.each([
    ["gpt-5.6-sol", "gpt-5.6-sol"],
    ["gpt-5.6-terra", "gpt-5.6-terra"],
    ["gpt-5.6-luna", "gpt-5.6-luna"],
    ["gpt-6-astra", "gpt-6-astra"],
  ])("sends settings.model %s through translate() to the proxy body", async (model) => {
    const { translate, captured, window } = loadCatAiTranslate();
    const mapped = { id: 1, model, batchSize: 20, preferOpenAiProxy: true, apiKey: "", prompts: {} };
    const result = await translate([{ id: "seg-1", sourceText: "Hello isolation ping." }], {
      settings: mapped,
      sourceLang: "en",
      targetLang: "zh-TW",
      includeKeys: false,
      includeExtraValue: false,
      includeContext: false,
    });
    expect(result.error).toBeNull();
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("http://cat.test/api/cat-openai");
    expect(captured[0].model).toBe(model);
    expect(window.__catAiLastChatRequest.model).toBe(model);
  });
});
