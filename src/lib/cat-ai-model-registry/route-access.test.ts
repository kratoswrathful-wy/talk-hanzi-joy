import { describe, expect, it } from "vitest";
import { canAccessCatAiModelRegistry } from "./route-access";

describe("canAccessCatAiModelRegistry", () => {
  it("allows executive", () => {
    expect(canAccessCatAiModelRegistry([{ role: "executive" }])).toBe(true);
  });

  it("denies pm and member", () => {
    expect(canAccessCatAiModelRegistry([{ role: "pm" }])).toBe(false);
    expect(canAccessCatAiModelRegistry([{ role: "member" }])).toBe(false);
    expect(canAccessCatAiModelRegistry([])).toBe(false);
  });
});
