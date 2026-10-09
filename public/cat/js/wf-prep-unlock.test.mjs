import { describe, expect, it } from "vitest";
import {
  prepIncompleteForbidsAssignedEdit,
  editorPrepLeaveMessage,
  projectPrepLeaveMessage,
  shouldLeaveKeepingPrep,
} from "./wf-prep-unlock.js";

describe("prepIncompleteForbidsAssignedEdit", () => {
  it("準備中不再禁止已受派編輯", () => {
    expect(prepIncompleteForbidsAssignedEdit()).toBe(false);
  });
});

describe("prep leave copy", () => {
  it("單檔離頁說明保持準備中", () => {
    expect(editorPrepLeaveMessage("重測-1.txt")).toContain("保持準備中並離開");
    expect(editorPrepLeaveMessage("重測-1.txt")).toContain("取消則留在此頁");
    expect(editorPrepLeaveMessage("重測-1.txt")).not.toContain("請先標記準備完成");
  });

  it("多檔專案離頁列出檔名", () => {
    const msg = projectPrepLeaveMessage(["甲.txt", "乙.txt"]);
    expect(msg).toContain("· 甲.txt");
    expect(msg).toContain("· 乙.txt");
    expect(msg).toContain("保持準備中並離開");
  });
});

describe("shouldLeaveKeepingPrep", () => {
  it("確定離開、取消留下，都不當成準備完成", () => {
    expect(shouldLeaveKeepingPrep(true)).toBe(true);
    expect(shouldLeaveKeepingPrep(false)).toBe(false);
  });
});
