import { describe, expect, it } from "vitest";
import { smartCompare } from "./filter-types";
import {
  caseListTranslatorPeople,
  caseListTranslatorText,
  hasCollabTranslatorArrangement,
  listTranslatorLabels,
  listTranslatorPeople,
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

describe("listTranslatorPeople / caseListTranslatorPeople", () => {
  it("每人各一筆，同帳號去重、同名不同帳號分開", () => {
    expect(
      listTranslatorPeople([
        row({ id: "1", translator: "甲", translatorUserId: "uid-a" }),
        row({ id: "2", translator: "甲", translatorUserId: "uid-b" }),
        row({ id: "3", translator: "甲", translatorUserId: "uid-a" }),
        row({ id: "4", translator: "乙", translatorUserId: "uid-c" }),
      ]),
    ).toEqual([
      { userId: "uid-a", label: "甲" },
      { userId: "uid-b", label: "甲" },
      { userId: "uid-c", label: "乙" },
    ]);
  });

  it("有分段空列時不回退舊欄，也不虛構人員", () => {
    expect(
      caseListTranslatorPeople({
        collabRows: [row({ id: "1", translator: "" })],
        translator: ["舊欄甲"],
      }),
    ).toEqual([]);
  });

  it("陣列標籤串接與既有彙整文字相同，供排序沿用", () => {
    const input = {
      collabRows: [
        row({ id: "1", translator: "譯者二", translatorUserId: "uid-b" }),
        row({ id: "2", translator: "譯者一", translatorUserId: "uid-a" }),
      ],
      translator: ["舊欄"],
    };
    const people = caseListTranslatorPeople(input);
    expect(people.map((p) => p.label).join("、")).toBe(caseListTranslatorText(input));
  });
});

describe("譯者欄排序用完整彙整值", () => {
  const multiText = caseListTranslatorText({
    collabRows: [
      row({ id: "1", translator: "譯者二（測試）", translatorUserId: "uid-b" }),
      row({ id: "2", translator: "譯者一（測試）", translatorUserId: "uid-a" }),
      row({ id: "3", translator: "譯者一（測試）", translatorUserId: "uid-a" }),
    ],
    translator: ["譯者一（測試）"],
  });
  const singleText = caseListTranslatorText({
    translator: ["譯者二（測試）"],
  });

  it("彙整值是完整名單，不是第一人或舊欄", () => {
    expect(multiText).toBe("譯者二（測試）、譯者一（測試）");
    expect(singleText).toBe("譯者二（測試）");
    expect(multiText).not.toBe("譯者二（測試）");
    expect(multiText).not.toBe("譯者一（測試）");
  });

  it("升序：單人「譯者二」在多人「譯者二、譯者一」之前（既有 zh-Hant-TW）", () => {
    expect(smartCompare(singleText, multiText, "select")).toBeLessThan(0);
    expect(smartCompare(multiText, singleText, "select")).toBeGreaterThan(0);
  });

  it("若只比第一人或舊欄，順序會跟完整彙整不同", () => {
    const firstPersonOnly = "譯者二（測試）";
    const oldFieldOnly = "譯者一（測試）";
    expect(smartCompare(firstPersonOnly, singleText, "select")).toBe(0);
    expect(smartCompare(oldFieldOnly, singleText, "select")).toBeLessThan(0);
    expect(smartCompare(multiText, singleText, "select")).not.toBe(0);
    expect(smartCompare(multiText, singleText, "select")).toBeGreaterThan(0);
  });
});
