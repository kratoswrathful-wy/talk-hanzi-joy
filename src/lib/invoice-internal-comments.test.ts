import { describe, expect, it } from "vitest";
import type { Invoice } from "@/data/invoice-types";
import {
  allocateInternalCommentId,
  applyInternalCommentsFetch,
  attachInvoiceInternalComments,
  mergeInvoiceInternalComments,
  shouldRefuseInternalCommentWrite,
} from "./invoice-internal-comments";

function baseInvoice(id: string): Invoice {
  return {
    id,
    title: "t",
    translator: "譯者一",
    status: "pending",
    note: "一般備註不可當內部",
    createdBy: "u1",
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    feeIds: [],
    payments: [],
    comments: [{ id: "pub", author: "譯者一", content: "一般留言", timestamp: "2026/09/28 00:00:00" }],
  };
}

describe("attachInvoiceInternalComments", () => {
  it("沒有列時給空陣列，不把 note 或一般留言當內部", () => {
    const [inv] = attachInvoiceInternalComments([baseInvoice("a")], []);
    expect(inv.internalComments).toEqual([]);
    expect(inv.note).toBe("一般備註不可當內部");
    expect(inv.comments?.[0]?.content).toBe("一般留言");
  });

  it("只把對應請款的內部列併上，不交叉污染", () => {
    const [a, b] = attachInvoiceInternalComments(
      [baseInvoice("a"), baseInvoice("b")],
      [
        {
          invoice_id: "a",
          comments: [
            { id: "i1", author: "PM", content: "內部", timestamp: "2026/09/28 01:00:00" },
          ],
        },
      ],
    );
    expect(a.internalComments).toEqual([
      { id: "i1", author: "PM", content: "內部", timestamp: "2026/09/28 01:00:00" },
    ]);
    expect(b.internalComments).toEqual([]);
    expect(a.internalCommentsKnown).toBe(true);
    expect(b.internalCommentsKnown).toBe(true);
  });
});

describe("applyInternalCommentsFetch", () => {
  it("讀取失敗時保留本單已知內部備註，不寫成空白", () => {
    const previous = new Map<string, Invoice>([
      ["a", {
        ...baseInvoice("a"),
        internalComments: [
          { id: "old", author: "PM", content: "舊則", timestamp: "2026/09/28 01:00:00" },
        ],
        internalCommentsKnown: true,
      }],
    ]);
    const [inv] = applyInternalCommentsFetch(
      [baseInvoice("a")],
      previous,
      { ok: false, error: new Error("network") },
    );
    expect(inv.internalComments).toEqual([
      { id: "old", author: "PM", content: "舊則", timestamp: "2026/09/28 01:00:00" },
    ]);
    expect(inv.internalCommentsKnown).toBe(false);
  });

  it("讀取成功且無列才是真的空", () => {
    const previous = new Map<string, Invoice>([
      ["a", {
        ...baseInvoice("a"),
        internalComments: [{ id: "stale", author: "PM", content: "應被成功空結果取代", timestamp: "x" }],
      }],
    ]);
    const [inv] = applyInternalCommentsFetch(
      [baseInvoice("a")],
      previous,
      { ok: true, rows: [] },
    );
    expect(inv.internalComments).toEqual([]);
    expect(inv.internalCommentsKnown).toBe(true);
  });
});

describe("shouldRefuseInternalCommentWrite / allocateInternalCommentId", () => {
  it("只在讀取未完成時擋送出", () => {
    expect(shouldRefuseInternalCommentWrite(false)).toBe(true);
    expect(shouldRefuseInternalCommentWrite(true)).toBe(false);
    expect(shouldRefuseInternalCommentWrite(undefined)).toBe(false);
  });

  it("未知結果重試沿用同一則 id", () => {
    const first = allocateInternalCommentId(null);
    expect(first.startsWith("icomment-")).toBe(true);
    expect(allocateInternalCommentId(first)).toBe(first);
    expect(allocateInternalCommentId(null)).not.toBe(first);
  });
});

describe("mergeInvoiceInternalComments", () => {
  it("兩個工作階段各新增一則時合併，不互蓋", () => {
    const server = [
      { id: "old", author: "PM", content: "舊", timestamp: "1" },
      { id: "a", author: "PM", content: "A", timestamp: "2" },
    ];
    const incoming = [
      { id: "old", author: "PM", content: "舊", timestamp: "1" },
      { id: "b", author: "PM2", content: "B", timestamp: "3" },
    ];
    expect(mergeInvoiceInternalComments(server, incoming).map((c) => c.id)).toEqual(["old", "a", "b"]);
  });
});
