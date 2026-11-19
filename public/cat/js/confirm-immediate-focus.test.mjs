import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

describe("確認後立刻打字", () => {
  it("已掛上的下一句在非同步確認之前就取得焦點", () => {
    const at = app.indexOf("if (e.ctrlKey && e.key === 'Enter')");
    const handler = app.slice(at, at + 500);
    const focusAt = handler.indexOf("focusMountedAfterConfirmTarget(i)");
    const asyncAt = handler.indexOf("void (async () => {");
    expect(focusAt).toBeGreaterThanOrEqual(0);
    expect(asyncAt).toBeGreaterThan(focusAt);
  });

  it("虛擬捲動重畫前先收下已打進下一句的文字", () => {
    const start = app.indexOf("function flushPendingEditorFocus(");
    const end = app.indexOf("function scheduleEditorFocus(", start);
    const flush = app.slice(start, end);
    const adoptAt = flush.indexOf("adoptLiveEditorTextIntoSegment(pending.segId)");
    const scrollAt = flush.indexOf("scrollToSegId");
    expect(adoptAt).toBeGreaterThanOrEqual(0);
    expect(scrollAt).toBeGreaterThan(adoptAt);
  });
});
