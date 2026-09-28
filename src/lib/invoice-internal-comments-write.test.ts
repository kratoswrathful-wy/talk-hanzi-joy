import { describe, expect, it } from "vitest";
import type { InvoiceComment } from "@/lib/invoice-comments";
import { persistInvoiceInternalComments } from "./invoice-internal-comments-write";

function comment(id: string, content: string): InvoiceComment {
  return { id, author: "PM（測試）", content, timestamp: "2026/09/28 13:00:00" };
}

type MemoryRow = { comments: InvoiceComment[]; updatedAt: string };

function createMemoryTable(opts?: { afterRead?: () => Promise<void> }) {
  let row: MemoryRow | null = null;
  let reads = 0;
  const writes: MemoryRow[] = [];

  return {
    writes,
    snapshot: () => row,
    seed(next: MemoryRow) {
      row = { comments: [...next.comments], updatedAt: next.updatedAt };
    },
    fetchRemote: async () => {
      reads += 1;
      const snap = row
        ? { ok: true as const, comments: [...row.comments], updatedAt: row.updatedAt, exists: true }
        : { ok: true as const, comments: [], updatedAt: null, exists: false };
      if (opts?.afterRead) await opts.afterRead();
      return snap;
    },
    insertRow: async ({ comments, updatedAt }: { comments: InvoiceComment[]; updatedAt: string }) => {
      if (row) return { ok: false as const, error: { code: "23505" }, conflict: true };
      row = { comments: [...comments], updatedAt };
      writes.push(row);
      return { ok: true as const };
    },
    casUpdate: async ({
      comments,
      updatedAt,
      expectedUpdatedAt,
    }: {
      comments: InvoiceComment[];
      updatedAt: string;
      expectedUpdatedAt: string | null;
    }) => {
      if (!row || row.updatedAt !== expectedUpdatedAt) {
        return { ok: false as const, error: new Error("cas miss"), conflict: true, wrote: false };
      }
      row = { comments: [...comments], updatedAt };
      writes.push(row);
      return { ok: true as const, wrote: true };
    },
    get reads() {
      return reads;
    },
  };
}

describe("persistInvoiceInternalComments A 寫入成功但回應遺失", () => {
  it("後端已有該則後，同一 id 重試不會再新增一筆", async () => {
    const table = createMemoryTable();
    const incoming = [comment("old", "舊則"), comment("n1", "AIQA-已寫入未知")];

    const first = await persistInvoiceInternalComments({
      incoming,
      fetchRemote: table.fetchRemote,
      insertRow: async (input) => {
        await table.insertRow(input);
        return { ok: false, error: new Error("Failed to fetch") };
      },
      casUpdate: table.casUpdate,
      now: () => "2026-09-28T05:00:00.000Z",
    });
    expect(first.ok).toBe(false);
    expect(table.snapshot()?.comments.map((c) => c.id)).toEqual(["old", "n1"]);

    const retry = await persistInvoiceInternalComments({
      incoming,
      fetchRemote: table.fetchRemote,
      insertRow: table.insertRow,
      casUpdate: table.casUpdate,
      now: () => "2026-09-28T05:00:01.000Z",
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.wrote.map((c) => c.id)).toEqual(["old", "n1"]);
    }
    expect(table.snapshot()?.comments.map((c) => c.id)).toEqual(["old", "n1"]);
    expect(table.snapshot()?.comments.filter((c) => c.content === "AIQA-已寫入未知")).toHaveLength(1);
  });

  it("重試若重建 id，後端會變成兩則同內容（產品不得走這條）", async () => {
    const table = createMemoryTable();
    table.seed({
      comments: [comment("old", "舊則"), comment("n1", "同內容")],
      updatedAt: "2026-09-28T05:00:00.000Z",
    });
    const retryNewId = await persistInvoiceInternalComments({
      incoming: [comment("old", "舊則"), comment("n2", "同內容")],
      fetchRemote: table.fetchRemote,
      insertRow: table.insertRow,
      casUpdate: table.casUpdate,
    });
    expect(retryNewId.ok).toBe(true);
    expect(table.snapshot()?.comments.map((c) => c.id)).toEqual(["old", "n1", "n2"]);
  });
});

describe("persistInvoiceInternalComments B 真正同時寫入", () => {
  it("兩邊先讀到同一份舊留言，交錯送出後舊則與兩則新增都在", async () => {
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seen = 0;
    const table = createMemoryTable({
      afterRead: async () => {
        seen += 1;
        if (seen >= 2) release();
        await bothRead;
      },
    });
    table.seed({ comments: [comment("old", "舊則")], updatedAt: "t0" });

    const [a, b] = await Promise.all([
      persistInvoiceInternalComments({
        incoming: [comment("old", "舊則"), comment("a", "窗口A")],
        fetchRemote: table.fetchRemote,
        insertRow: table.insertRow,
        casUpdate: table.casUpdate,
        now: () => "tA",
      }),
      persistInvoiceInternalComments({
        incoming: [comment("old", "舊則"), comment("b", "窗口B")],
        fetchRemote: table.fetchRemote,
        insertRow: table.insertRow,
        casUpdate: table.casUpdate,
        now: () => "tB",
      }),
    ]);

    expect(a.ok && b.ok).toBe(true);
    const ids = table.snapshot()?.comments.map((c) => c.id).sort() ?? [];
    expect(ids).toEqual(["a", "b", "old"]);
    expect(table.snapshot()?.comments).toHaveLength(3);
    expect(table.reads).toBeGreaterThanOrEqual(3);
  });

  it("原本沒有內部列時兩次同時新增，兩則都在且各一筆", async () => {
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seen = 0;
    const table = createMemoryTable({
      afterRead: async () => {
        seen += 1;
        if (seen >= 2) release();
        await bothRead;
      },
    });

    const [a, b] = await Promise.all([
      persistInvoiceInternalComments({
        incoming: [comment("a", "首次A")],
        fetchRemote: table.fetchRemote,
        insertRow: table.insertRow,
        casUpdate: table.casUpdate,
        now: () => "tA",
      }),
      persistInvoiceInternalComments({
        incoming: [comment("b", "首次B")],
        fetchRemote: table.fetchRemote,
        insertRow: table.insertRow,
        casUpdate: table.casUpdate,
        now: () => "tB",
      }),
    ]);

    expect(a.ok && b.ok).toBe(true);
    const ids = table.snapshot()?.comments.map((c) => c.id).sort() ?? [];
    expect(ids).toEqual(["a", "b"]);
  });
});
