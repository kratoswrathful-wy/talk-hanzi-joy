import { describe, expect, it } from "vitest";
import type { Invoice } from "@/data/invoice-types";
import { attachInvoiceInternalComments } from "./invoice-internal-comments";

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
  });
});
