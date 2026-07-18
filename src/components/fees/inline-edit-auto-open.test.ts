import { describe, expect, it } from "vitest";
import { shouldAutoOpenOnEnter } from "./inline-edit-auto-open";

/**
 * Regression: cases translator / workType used multiColorSelect without
 * defaultOpen, requiring a second click. Must match status / colorSelect.
 */
describe("shouldAutoOpenOnEnter", () => {
  it("opens select / colorSelect / multiColorSelect / datetime on enter", () => {
    expect(shouldAutoOpenOnEnter("select")).toBe(true);
    expect(shouldAutoOpenOnEnter("colorSelect")).toBe(true);
    expect(shouldAutoOpenOnEnter("multiColorSelect")).toBe(true);
    expect(shouldAutoOpenOnEnter("datetime")).toBe(true);
  });

  it("does not auto-open text or checkbox", () => {
    expect(shouldAutoOpenOnEnter("text")).toBe(false);
    expect(shouldAutoOpenOnEnter("checkbox")).toBe(false);
  });
});
