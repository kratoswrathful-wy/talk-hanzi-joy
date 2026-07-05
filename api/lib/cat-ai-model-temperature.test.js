import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadCatAiModelTemperature() {
  const filePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../cat-tool/js/ai-model-temperature.js",
  );
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filePath, "utf8"), {
    module,
    exports: module.exports,
    globalThis: {},
    self: {},
    window: {},
  });
  return module.exports;
}

const { buildOpenAiChatBody, shouldOmitTemperature } = loadCatAiModelTemperature();

const messages = [{ role: "user", content: "hi" }];

describe("CatAiModelTemperature (cat-tool/js/ai-model-temperature.js)", () => {
  describe("shouldOmitTemperature", () => {
    it("omits GPT-5.5 family models", () => {
      expect(shouldOmitTemperature("gpt-5.5")).toBe(true);
      expect(shouldOmitTemperature("gpt-5.5-2026-04-23")).toBe(true);
      expect(shouldOmitTemperature("gpt-5.5-pro")).toBe(true);
      expect(shouldOmitTemperature("gpt-5.5-pro-2026-04-23")).toBe(true);
    });

    it("keeps temperature for other models", () => {
      expect(shouldOmitTemperature("gpt-4.1-mini")).toBe(false);
    });
  });

  describe("buildOpenAiChatBody", () => {
    it("includes default temperature for gpt-4.1-mini", () => {
      const body = buildOpenAiChatBody({ model: "gpt-4.1-mini" }, messages, {});
      expect(body.temperature).toBe(0.3);
    });

    it("omits temperature for gpt-5.5", () => {
      const body = buildOpenAiChatBody({ model: "gpt-5.5" }, messages, {});
      expect(body).not.toHaveProperty("temperature");
    });

    it("omits temperature for gpt-5.5-2026-04-23", () => {
      const body = buildOpenAiChatBody({ model: "gpt-5.5-2026-04-23" }, messages, {});
      expect(body).not.toHaveProperty("temperature");
    });

    it("omits temperature for gpt-5.5-pro", () => {
      const body = buildOpenAiChatBody({ model: "gpt-5.5-pro" }, messages, {});
      expect(body).not.toHaveProperty("temperature");
    });

    it("keeps explicit extra.temperature for gpt-4.1-mini", () => {
      const body = buildOpenAiChatBody(
        { model: "gpt-4.1-mini" },
        messages,
        { temperature: 0.2, response_format: { type: "json_object" } },
      );
      expect(body.temperature).toBe(0.2);
      expect(body.response_format).toEqual({ type: "json_object" });
    });

    it("drops explicit extra.temperature for gpt-5.5", () => {
      const body = buildOpenAiChatBody(
        { model: "gpt-5.5" },
        messages,
        { temperature: 0.2, response_format: { type: "json_object" } },
      );
      expect(body).not.toHaveProperty("temperature");
      expect(body.response_format).toEqual({ type: "json_object" });
    });
  });
});
