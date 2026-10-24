import { describe, expect, it } from "vitest";
import { collabRowFromJson } from "@/lib/collab-row-from-json";

describe("collabRowFromJson", () => {
  it("缺單位數的單列仍讀得回來，不會變成空表", () => {
    const row = collabRowFromJson({
      id: "e-merge-1",
      segment: "1-2",
      translator: "譯者一",
      accepted: true,
      reviewer: "",
      delivered: false,
      taskCompleted: false,
      lineRange: "1-2",
    });
    expect(row?.id).toBe("e-merge-1");
    expect(row?.unitCount).toBe(0);
    expect(row?.reviewer).toBe("");
    expect(row?.segment).toBe("1-2");
  });

  it("缺審稿名與完成旗標時用空字串／false，不丟整列", () => {
    const row = collabRowFromJson({
      id: "only-translator",
      translator: "譯者一",
    });
    expect(row).toMatchObject({
      id: "only-translator",
      reviewer: "",
      accepted: false,
      taskCompleted: false,
      delivered: false,
      unitCount: 0,
    });
  });

  it("沒有譯者識別的物件仍拒絕", () => {
    expect(collabRowFromJson({ id: "x", segment: "1-2" })).toBeUndefined();
    expect(collabRowFromJson(null)).toBeUndefined();
  });
});
