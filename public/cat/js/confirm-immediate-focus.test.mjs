import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

describe("確認後立刻打字", () => {
  it("確認先算唯一目標，再由同一個交接移焦", () => {
    const at = app.indexOf("if (e.ctrlKey && e.key === 'Enter')");
    const handler = app.slice(at, at + 700);
    expect(handler.includes("focusMountedAfterConfirmTarget(i)")).toBe(false);
    expect(handler.includes("startEditorConfirm(seg, row, i, targetInput")).toBe(true);
    const beginAt = app.indexOf("function beginConfirmedFocusHandoff(");
    const begin = app.slice(beginAt, app.indexOf("function startEditorConfirm(", beginAt));
    const repAt = begin.indexOf("applyOptimisticRepetitionAfterPrimaryConfirm");
    const indexAt = begin.indexOf("getAfterConfirmFocusIndex");
    const focusAt = begin.indexOf("focusMountedAfterConfirmTarget");
    expect(repAt).toBeGreaterThanOrEqual(0);
    expect(indexAt).toBeGreaterThan(repAt);
    expect(focusAt).toBeGreaterThan(indexAt);
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
