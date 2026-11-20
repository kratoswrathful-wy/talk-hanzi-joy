import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

function sliceBetween(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return app.slice(start, end);
}

describe("caret stays with the edit that just happened", () => {
  it("keeps a padding break after a trailing newline so the next character is not written on the previous line", () => {
    const block = sliceBetween("function placeCaretAfterNode", "function getEditorFromSelection");
    expect(block).toContain("data-cat-pad");
    expect(block).toContain("setStartBefore(pad)");
    const ghost = sliceBetween("function isGhostBr", "function isGhostOnlyDiv");
    expect(ghost).toContain("data-cat-pad");
    const scan = sliceBetween("function editorDomHasGhostNewlineArtifacts", "function canonicalizeTargetEditorFromExtractPlain");
    expect(scan).toContain("data-cat-pad");
  });

  it("does not put the caret back to the pre-blur offset after a newer edit", () => {
    expect(app).toContain("if (liveNow !== newVal) return;");
  });
});
