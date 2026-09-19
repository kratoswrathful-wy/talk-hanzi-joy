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
  it("offline manifest has four curated models", () => {
    expect(picker.OFFLINE_MANIFEST).toHaveLength(4);
    expect(picker.OFFLINE_MANIFEST.map((row) => row.modelId)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-6-astra",
    ]);
    expect(picker.DEFAULT_MODEL_ID).toBe("gpt-5.6-sol");
  });

  it("resolveSelectedModelId keeps gpt-5.6-terra when in list", () => {
    const id = picker.resolveSelectedModelId("gpt-5.6-terra", picker.OFFLINE_MANIFEST);
    expect(id).toBe("gpt-5.6-terra");
  });

  it("resolveSelectedModelId falls back to gpt-5.6-sol when saved model unknown", () => {
    const id = picker.resolveSelectedModelId("gpt-5.5", picker.OFFLINE_MANIFEST);
    expect(id).toBe("gpt-5.6-sol");
  });

  it("formatOptionLabel shows default and astra copy", () => {
    const defaultRow = picker.OFFLINE_MANIFEST[0];
    const astraRow = picker.OFFLINE_MANIFEST[3];
    expect(picker.formatOptionLabel(defaultRow)).toContain("預設");
    expect(picker.formatOptionLabel(astraRow)).toContain("手動高品質");
    expect(picker.formatOptionLabel(picker.OFFLINE_MANIFEST[2])).toContain("備援");
  });

  it("shouldOmitTemperature for 5.5, 5.6 and Astra", () => {
    expect(picker.shouldOmitTemperature("gpt-5.5")).toBe(true);
    expect(picker.shouldOmitTemperature("gpt-5.5-pro")).toBe(true);
    expect(picker.shouldOmitTemperature("gpt-5.6-sol")).toBe(true);
    expect(picker.shouldOmitTemperature("gpt-5.6-luna")).toBe(true);
    expect(picker.shouldOmitTemperature("gpt-6-astra")).toBe(true);
    expect(picker.shouldOmitTemperature("gpt-4.1-mini")).toBe(false);
  });
});
