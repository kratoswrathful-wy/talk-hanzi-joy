import { describe, expect, it } from "vitest";
import { prepNotReadyWarningDescription } from "./prep-not-ready-warning";

describe("prepNotReadyWarningDescription", () => {
  it("主管文案不再說句段鎖定", () => {
    const text = prepNotReadyWarningDescription(true, ["重測-1.txt"]);
    expect(text).toContain("重測-1.txt");
    expect(text).toContain("仍可編輯已受派範圍");
    expect(text).not.toContain("句段鎖定");
    expect(text).not.toContain("暫時無法編輯");
  });

  it("譯者文案不再說無法編輯", () => {
    const text = prepNotReadyWarningDescription(false, []);
    expect(text).toContain("仍可編輯已受派範圍");
    expect(text).not.toContain("暫時無法編輯");
    expect(text).not.toContain("句段為鎖定");
  });
});
