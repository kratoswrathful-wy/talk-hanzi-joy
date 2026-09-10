import { describe, expect, it } from "vitest";
import {
  invoiceCommentsFromJson,
  invoiceCommentsToJson,
  type InvoiceComment,
} from "./invoice-comments";

const a: InvoiceComment = {
  id: "c1",
  author: "PM",
  content: "第一則",
  timestamp: "2026/09/10 18:00:00 (台北)",
};
const b: InvoiceComment = {
  id: "c2",
  author: "PM",
  content: "回覆",
  replyTo: "c1",
  timestamp: "2026/09/10 18:01:00 (台北)",
};

describe("invoiceCommentsFromJson", () => {
  it("null／非陣列／空陣列都回空，不與 note 混欄", () => {
    expect(invoiceCommentsFromJson(null)).toEqual([]);
    expect(invoiceCommentsFromJson(undefined)).toEqual([]);
    expect(invoiceCommentsFromJson("備註文字")).toEqual([]);
    expect(invoiceCommentsFromJson([])).toEqual([]);
  });

  it("略過缺欄或非物件列，保留合法兩則不互蓋", () => {
    const parsed = invoiceCommentsFromJson([
      a,
      { id: "bad" },
      b,
      null,
    ]);
    expect(parsed.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(parsed[1]?.replyTo).toBe("c1");
  });

  it("往返 JSON 不丟 id／內容", () => {
    const round = invoiceCommentsFromJson(invoiceCommentsToJson([a, b]));
    expect(round).toEqual([a, b]);
  });
});
