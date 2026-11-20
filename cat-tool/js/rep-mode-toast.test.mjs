import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "cat-tool/app.js"), "utf8");

describe("repetition mode apply notice", () => {
  it("uses the in-tool notice instead of a native alert", () => {
    const start = app.indexOf("const btnApplyRepMode");
    const end = app.indexOf("// Extractor State", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = app.slice(start, end);
    expect(block).toContain("showCatToast(");
    expect(block).not.toContain("alert(");
  });
});
