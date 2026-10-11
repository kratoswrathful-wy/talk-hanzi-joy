import { describe, expect, it } from "vitest";
import {
  caseListTranslatorText,
  hasCollabTranslatorArrangement,
  listTranslatorLabels,
} from "./collab-translator-list";
import type { CollabRow } from "@/data/case-types";

function row(partial: Partial<CollabRow> & { id: string }): CollabRow {
  return {
    segment: "",
    translator: "",
    unitCount: 0,
    accepted: false,
    translationDeadline: null,
    reviewer: "",
    reviewDeadline: null,
    taskCompleted: false,
    delivered: false,
    ...partial,
  };
}

describe("listTranslatorLabels", () => {
  it("多帳號都列出", () => {
    expect(
      listTranslatorLabels([
        row({ id: "1", translator: "譯者二", translatorUserId: "uid-b" }),
        row({ id: "2", translator: "譯者一", translatorUserId: "uid-a" }),
      ]),
    ).toBe("譯者二、譯者一");
  });

  it("同帳號重複分段只列一次", () => {
    expect(
      listTranslatorLabels([
        row({ id: "1", translator: "譯者一", translatorUserId: "uid-a" }),
        row({ id: "2", translator: "譯者一", translatorUserId: "uid-a" }),
        row({ id: "3", translator: "譯者二", translatorUserId: "uid-b" }),
      ]),
    ).toBe("譯者一、譯者二");
  });

  it("同名不同帳號分開", () => {
    expect(
      listTranslatorLabels([
        row({ id: "1", translator: "甲", translatorUserId: "uid-a" }),
        row({ id: "2", translator: "甲", translatorUserId: "uid-b" }),
        row({ id: "3", translator: "甲", translatorUserId: "uid-a" }),
      ]),
    ).toBe("甲、甲");
  });

  it("沒有帳號才用顯示名去重；空列不虛構", () => {
    expect(
      listTranslatorLabels([
        row({ id: "1", translator: "甲" }),
        row({ id: "2", translator: "" }),
        row({ id: "3", translator: "乙" }),
        row({ id: "4", translator: "甲" }),
      ]),
    ).toBe("甲、乙");
    expect(listTranslatorLabels([])).toBe("");
    expect(listTranslatorLabels(null)).toBe("");
  });

  it("改派與移除後不留舊人", () => {
    expect(
      listTranslatorLabels([
        row({ id: "1", translator: "新譯者", translatorUserId: "uid-new" }),
        row({ id: "2", translator: "", translatorUserId: null }),
      ]),
    ).toBe("新譯者");
  });
});

describe("caseListTranslatorText", () => {
  it("有分段譯者時不用舊欄", () => {
    expect(
      caseListTranslatorText({
        collabRows: [row({ id: "1", translator: "乙", translatorUserId: "uid-b" })],
        translator: ["舊欄甲"],
      }),
    ).toBe("乙");
  });

  it("空列或沒有分段時沿用舊欄", () => {
    expect(caseListTranslatorText({ collabRows: [], translator: ["舊欄甲", "舊欄乙"] })).toBe(
      "舊欄甲、舊欄乙",
    );
    expect(caseListTranslatorText({ collabRows: [], translator: ["舊欄甲", "舊欄甲"] })).toBe("舊欄甲");
    expect(caseListTranslatorText({ translator: "單人甲" })).toBe("單人甲");
    expect(caseListTranslatorText({ collabRows: [], translator: [] })).toBe("");
  });

  it("有效多人安排移除最後一人後，不得因舊欄殘留復活", () => {
    expect(hasCollabTranslatorArrangement([row({ id: "1", translator: "" })])).toBe(true);
    expect(
      caseListTranslatorText({
        collabRows: [row({ id: "1", translator: "" }), row({ id: "2", translator: "   " })],
        translator: ["舊欄甲"],
      }),
    ).toBe("");
  });
});
