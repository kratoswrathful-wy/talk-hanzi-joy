import { describe, expect, it } from "vitest";
import { plainTextFromCaseBodyContent } from "./case-body-plain-text";

describe("plainTextFromCaseBodyContent", () => {
  it("joins text nodes split across paragraphs so the last sentence is still readable", () => {
    const raw = JSON.stringify([
      {
        type: "paragraph",
        content: [{ text: "N07A-GATE-1", type: "text", styles: {} }],
        children: [],
      },
      {
        type: "paragraph",
        content: [{ text: "-LAST", type: "text", styles: {} }],
        children: [],
      },
    ]);
    expect(plainTextFromCaseBodyContent(raw)).toBe("N07A-GATE-1-LAST");
    expect(plainTextFromCaseBodyContent(JSON.parse(raw))).toContain("N07A-GATE-1-LAST");
  });

  it("treats empty document JSON as no text", () => {
    expect(plainTextFromCaseBodyContent("[]")).toBe("");
    expect(plainTextFromCaseBodyContent("null")).toBe("");
  });
});
