import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadCatAiModelPicker() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../cat-tool/js");
  const tempModule = { exports: {} };
  vm.runInNewContext(readFileSync(path.join(root, "ai-model-temperature.js"), "utf8"), {
    module: tempModule,
    exports: tempModule.exports,
    globalThis: { CatAiModelTemperature: undefined },
    self: {},
    window: {},
  });
  const pickerModule = { exports: {} };
  const sandbox = {
    module: pickerModule,
    exports: pickerModule.exports,
    globalThis: {},
    self: {},
    window: { CatAiModelTemperature: tempModule.exports },
    DBService: undefined,
  };
  vm.runInNewContext(readFileSync(path.join(root, "ai-model-picker.js"), "utf8"), sandbox);
  return pickerModule.exports;
}

const picker = loadCatAiModelPicker();

describe("CatAiModelPicker (cat-tool/js/ai-model-picker.js)", () => {
  it("offline manifest has five curated models", () => {
    expect(picker.OFFLINE_MANIFEST).toHaveLength(5);
    expect(picker.OFFLINE_MANIFEST.map((row) => row.modelId)).toEqual([
      "gpt-5.5",
      "gpt-5.4-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-5.5-pro",
    ]);
  });

  it("resolveSelectedModelId keeps gpt-4.1 when in list", () => {
    const id = picker.resolveSelectedModelId("gpt-4.1", picker.OFFLINE_MANIFEST);
    expect(id).toBe("gpt-4.1");
  });

  it("resolveSelectedModelId falls back to gpt-5.5 when saved model disabled", () => {
    const id = picker.resolveSelectedModelId("gpt-4o", picker.OFFLINE_MANIFEST);
    expect(id).toBe("gpt-5.5");
  });

  it("formatOptionLabel shows default and pro copy", () => {
    const defaultRow = picker.OFFLINE_MANIFEST[0];
    const proRow = picker.OFFLINE_MANIFEST[4];
    expect(picker.formatOptionLabel(defaultRow)).toContain("預設");
    expect(picker.formatOptionLabel(proRow)).toContain("最高品質");
  });

  it("shouldOmitTemperature for gpt-5.5 and gpt-5.5-pro", () => {
    expect(picker.shouldOmitTemperature("gpt-5.5")).toBe(true);
    expect(picker.shouldOmitTemperature("gpt-5.5-pro")).toBe(true);
    expect(picker.shouldOmitTemperature("gpt-4.1")).toBe(false);
  });
});
