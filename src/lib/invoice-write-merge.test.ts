import { describe, expect, it } from "vitest";
import { keepLocalInvoiceAfterAck, revertUnchangedJobFields, shouldFlushBufferedValue } from "./invoice-write-merge";

describe("invoice-write-merge", () => {
  it("成功回應只帶時間戳，不把晚回的舊 note 蓋掉本地新值", () => {
    const current = { id: "i1", title: "完整標題", note: "新備註", updatedAt: "t1" };
    const fromDb = { id: "i1", title: "完整標題", note: "", updatedAt: "t2" };
    expect(keepLocalInvoiceAfterAck(current, fromDb)).toEqual({
      id: "i1",
      title: "完整標題",
      note: "新備註",
      updatedAt: "t2",
    });
  });

  it("失敗只退回本筆仍相等的欄，後到的另一欄留下", () => {
    const previous = { title: "舊", note: "" };
    const current = { title: "新標題", note: "新備註" };
    expect(revertUnchangedJobFields(current, previous, { title: "新標題" })).toEqual({
      title: "舊",
      note: "新備註",
    });
  });

  it("失敗時若該欄已被更新的輸入取代，不退回", () => {
    const previous = { title: "舊" };
    const current = { title: "更新後" };
    expect(revertUnchangedJobFields(current, previous, { title: "中間值" })).toEqual({
      title: "更新後",
    });
  });

  it("緩衝值與已存不同才要離頁送出", () => {
    expect(shouldFlushBufferedValue("[AI驗收] 完整", "[AI驗收] 稿費請款 2")).toBe(true);
    expect(shouldFlushBufferedValue("同", "同")).toBe(false);
  });
});
