import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

describe("jump to a sentence uses the saved scroll setting", () => {
  it("passes the bottom-row setting into the same focus schedule as confirm", () => {
    const start = app.indexOf("function _qaJumpToSegment");
    const end = app.indexOf("async function openJumpToSegmentPrompt", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = app.slice(start, end);
    expect(block).toContain("scrollBlock: getAfterConfirmScrollBlock()");
  });
});
