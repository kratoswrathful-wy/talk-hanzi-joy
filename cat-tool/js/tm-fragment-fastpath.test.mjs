import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

function sliceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return appSource.slice(start, end);
}

describe("即時比對的片段與過期清單", () => {
  const live = sliceBetween("async function renderLiveTmMatches(seg)", "window.handleCatResultClick = function");

  it("長度上界低於 50% 時仍收短片段", () => {
    const fast = live.slice(live.indexOf("if (upperSim < 50)"), live.indexOf("const sim = calculateSimilarity"));
    expect(fast).toContain("type: 'Fragment'");
    expect(fast.indexOf("type: 'Fragment'")).toBeLessThan(fast.lastIndexOf("return;"));
  });

  it("這句沒有比對時清空上一句留下的清單", () => {
    const misses = live.split("window.currentTmMatches = []").length - 1;
    expect(misses).toBeGreaterThanOrEqual(2);
  });
});
