import { describe, expect, it } from "vitest";
import { shouldAutoOpenOnEnter } from "./inline-edit-auto-open";
import { shouldResyncMultiCommitOnClose } from "./inline-edit-close-sync";

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

/** Escape 關閉後須再同步一次最後多選值（避免顯示停在「—」） */
describe("shouldResyncMultiCommitOnClose", () => {
  it("resyncs when session has a commit", () => {
    expect(shouldResyncMultiCommitOnClose(["甲"])).toBe(true);
    expect(shouldResyncMultiCommitOnClose([])).toBe(true);
  });

  it("skips when session never committed", () => {
    expect(shouldResyncMultiCommitOnClose(null)).toBe(false);
  });
});
