import { describe, expect, it } from "vitest";
import { resolvePmAdjustStatusClickAction } from "./wf-adjust-status-action.js";

describe("resolvePmAdjustStatusClickAction", () => {
  it("prep 進行中 → prep-complete", () => {
    expect(resolvePmAdjustStatusClickAction({ prepActive: true })).toBe("prep-complete");
  });

  it("非 prep：整檔與拆段一律 open-modal（回歸：不得改走舊下拉）", () => {
    expect(resolvePmAdjustStatusClickAction({ prepActive: false })).toBe("open-modal");
    expect(resolvePmAdjustStatusClickAction({})).toBe("open-modal");
    expect(resolvePmAdjustStatusClickAction()).toBe("open-modal");
  });
});
