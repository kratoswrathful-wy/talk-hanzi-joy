import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

describe("match list belongs to the sentence on screen", () => {
  it("drops the previous list as soon as the sentence changes", () => {
    const start = app.indexOf("function dropMatchListForSentenceChange");
    const end = app.indexOf("async function renderLiveTmMatches", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = app.slice(start, end);
    expect(block).toContain("window.currentTmMatches = []");
    expect(block).toContain("scheduleRenderLiveTmMatches");
    expect(block.indexOf("dropMatchListForSentenceChange(seg)")).toBeGreaterThan(0);
    expect(block.indexOf("dropMatchListForSentenceChange(seg)")).toBeLessThan(block.indexOf("setTimeout"));
  });

  it("restores the saved caret for a mouse insert when the selection has left the sentence", () => {
    const start = app.indexOf("window.handleCatResultApply = async function");
    const end = app.indexOf("window.applyCatMatchAtIndex", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = app.slice(start, end);
    const guard = block.indexOf("if (!liveSelectionInTarget)");
    const remember = block.indexOf("beginInsert", guard);
    const restore = block.indexOf("restoreSavedCaretIntoEditor", guard);
    expect(guard).toBeGreaterThan(0);
    expect(remember).toBeGreaterThan(guard);
    expect(restore).toBeGreaterThan(remember);
    expect(block).not.toContain("if (fromKeyboard && !isTrueCursorInEditor)");
  });
});
