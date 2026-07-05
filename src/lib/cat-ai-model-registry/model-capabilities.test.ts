import { describe, expect, it } from "vitest";
import { GPT55_TEMPERATURE_HINT_ZH, shouldOmitTemperature } from "./model-capabilities";

describe("shouldOmitTemperature", () => {
  it("matches GPT-5.5 family", () => {
    expect(shouldOmitTemperature("gpt-5.5")).toBe(true);
    expect(shouldOmitTemperature("gpt-5.5-2026-04-23")).toBe(true);
    expect(shouldOmitTemperature("gpt-5.5-pro")).toBe(true);
    expect(shouldOmitTemperature("gpt-5.5-pro-2026-04-23")).toBe(true);
  });

  it("does not match other models", () => {
    expect(shouldOmitTemperature("gpt-4.1-mini")).toBe(false);
  });

  it("exports hint text for UI", () => {
    expect(GPT55_TEMPERATURE_HINT_ZH).toContain("temperature");
  });
});
