import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Invoice } from "@/data/invoice-types";
import type { InvoiceComment } from "@/lib/invoice-comments";
import { createInternalCommentSubmitSession } from "./invoice-internal-comment-submit";
import {
  createInvoiceInternalCommentsAdapter,
  fetchInvoiceInternalCommentRowForWrite,
  resolveInvoiceInternalComments,
  type InvoiceInternalCommentsClient,
} from "./invoice-internal-comments-adapter";
import { persistInvoiceInternalComments } from "./invoice-internal-comments-write";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.VITE_SUPABASE_ANON_KEY
  ?? process.env.SUPABASE_ANON_KEY
  ?? "";
const pmEmail = process.env.PLAYWRIGHT_ISO_PM_EMAIL ?? "";
const pmPassword = process.env.PLAYWRIGHT_ISO_PM_PASSWORD ?? "";

const isolationReady = url.includes("kymyughnkleuoyzsuiob")
  && Boolean(anon && pmEmail && pmPassword);

type FetchFn = typeof fetch;

function comment(id: string, content: string, replyTo?: string): InvoiceComment {
  return {
    id,
    author: "PM（測試）",
    content,
    timestamp: "2026/09/28 13:00:00",
    ...(replyTo ? { replyTo } : {}),
  };
}

function emptyInvoice(id: string): Invoice {
  return {
    id,
    title: "[AI驗收] TASK-001 1644",
    translator: "譯者一（測試）",
    status: "pending",
    note: "",
    createdBy: "",
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    feeIds: [],
    payments: [],
    comments: [],
    internalComments: [],
    internalCommentsKnown: undefined,
  };
}

function persistWith(
  adapter: ReturnType<typeof createInvoiceInternalCommentsAdapter>,
  incoming: InvoiceComment[],
) {
  return persistInvoiceInternalComments({ incoming, ...adapter });
}

function bindPersist(adapter: ReturnType<typeof createInvoiceInternalCommentsAdapter>) {
  return async (incoming: InvoiceComment[]) => {
    const result = await persistWith(adapter, incoming);
    return { error: result.ok === true ? null : result.error };
  };
}

function installInternalCommentFetchInterceptor(opts: {
  failRead: () => boolean;
  dropWriteAck: () => boolean;
}) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<FetchFn>[0], init?: Parameters<FetchFn>[1]) => {
    const request = input instanceof Request ? input : null;
    const urlText = typeof input === "string"
      ? input
      : request
        ? request.url
        : String(input);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (!urlText.includes("/rest/v1/invoice_internal_comments")) {
      return orig(input, init);
    }
    if (opts.failRead() && (method === "GET" || method === "HEAD")) {
      return new Response(JSON.stringify({ message: "aiqa-read-fail", code: "503" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (opts.dropWriteAck() && (method === "POST" || method === "PATCH")) {
      const res = await orig(input, init);
      if (res.ok) throw new TypeError("Failed to fetch");
      return res;
    }
    return orig(input, init);
  }) as FetchFn;
  return () => {
    globalThis.fetch = orig;
  };
}

function wrapDropWriteAck(
  adapter: ReturnType<typeof createInvoiceInternalCommentsAdapter>,
) {
  let dropOnce = true;
  const afterWrite = async <T extends { ok: boolean }>(wrote: T): Promise<T | { ok: false; error: Error }> => {
    if (wrote.ok && dropOnce) {
      dropOnce = false;
      return { ok: false, error: new Error("Failed to fetch") };
    }
    return wrote;
  };
  return {
    ...adapter,
    insertRow: async (input: Parameters<typeof adapter.insertRow>[0]) => afterWrite(await adapter.insertRow(input)),
    casUpdate: async (input: Parameters<typeof adapter.casUpdate>[0]) => afterWrite(await adapter.casUpdate(input)),
  };
}

async function loginPm() {
  const client = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `iso-abd-${crypto.randomUUID()}`,
    },
  }) as InvoiceInternalCommentsClient;
  const { error } = await client.auth.signInWithPassword({ email: pmEmail, password: pmPassword });
  expect(error).toBeNull();
  const { data } = await client.auth.getUser();
  expect(data.user?.email).toBe(pmEmail);
  expect(url).toContain("kymyughnkleuoyzsuiob");
  expect(url).not.toContain("wshsmerltcakffllgyul");
  return { client, uid: data.user?.id ?? null };
}

async function createSyntheticInvoice(
  client: InvoiceInternalCommentsClient,
  uid: string | null,
  title: string,
) {
  const id = crypto.randomUUID();
  const { error } = await client.from("invoices").insert({
    id,
    title,
    translator: "譯者一（測試）",
    status: "pending",
    note: "",
    created_by: uid,
    env: "test",
  });
  expect(error).toBeNull();
  return id;
}

describe.skipIf(!isolationReady)("A/B/D 隔離實際接線", () => {
  let restoreFetch: (() => void) | undefined;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  it("A 寫入完成後丟失回應，產品重試沿用同一則 id", async () => {
    const { client, uid } = await loginPm();
    const invoiceId = await createSyntheticInvoice(client, uid, "[AI驗收] TASK-001 1644 A 丟應答");
    const adapter = createInvoiceInternalCommentsAdapter(client, { invoiceId, env: "test", uid });
    const old = comment("old-main", "AIQA-舊主則");
    const reply = comment("old-reply", "AIQA-舊回覆", "old-main");
    const seeded = await persistWith(adapter, [old, reply]);
    expect(seeded.ok).toBe(true);

    const dropping = wrapDropWriteAck(adapter);
    const session = createInternalCommentSubmitSession();
    const first = await session.submit({
      input: { content: "AIQA-寫入後丟應答", author: "PM（測試）", timestamp: "2026/09/28 19:10:00" },
      known: true,
      currentComments: [old, reply],
      persist: bindPersist(dropping),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(String(first.error)).toMatch(/Failed to fetch/i);
    expect(session.pendingId()).toBe(first.commentId);

    const afterLost = await fetchInvoiceInternalCommentRowForWrite(client, invoiceId);
    expect(afterLost.ok).toBe(true);
    if (afterLost.ok === false) return;
    expect(afterLost.comments.map((c) => c.id)).toEqual(["old-main", "old-reply", first.commentId]);
    expect(afterLost.comments.filter((c) => c.content === "AIQA-寫入後丟應答")).toHaveLength(1);

    const retry = await session.submit({
      input: { content: "AIQA-寫入後丟應答", author: "PM（測試）", timestamp: "2026/09/28 19:10:00" },
      known: true,
      currentComments: [old, reply],
      persist: bindPersist(adapter),
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.commentId).toBe(first.commentId);
    expect(session.pendingId()).toBeNull();

    const finalRemote = await fetchInvoiceInternalCommentRowForWrite(client, invoiceId);
    expect(finalRemote.ok).toBe(true);
    if (finalRemote.ok === false) return;
    expect(finalRemote.comments.map((c) => c.id)).toEqual(["old-main", "old-reply", first.commentId]);
    expect(finalRemote.comments.filter((c) => c.content === "AIQA-寫入後丟應答")).toHaveLength(1);
    expect(finalRemote.comments.some((c) => c.content === "AIQA-舊主則")).toBe(true);
    expect(finalRemote.comments.some((c) => c.content === "AIQA-舊回覆")).toBe(true);
  }, 60_000);

  it("B 兩個獨立 client 先讀同一快照再競爭寫入", async () => {
    const a = await loginPm();
    const b = await loginPm();
    const invoiceId = await createSyntheticInvoice(a.client, a.uid, "[AI驗收] TASK-001 1644 B 同時寫入");
    const adapterA = createInvoiceInternalCommentsAdapter(a.client, { invoiceId, env: "test", uid: a.uid });
    const adapterB = createInvoiceInternalCommentsAdapter(b.client, { invoiceId, env: "test", uid: b.uid });
    const old = comment("old-main", "AIQA-舊主則");
    const reply = comment("old-reply", "AIQA-舊回覆", "old-main");
    expect((await persistWith(adapterA, [old, reply])).ok).toBe(true);

    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seen = 0;
    const wrapBarrier = (adapter: ReturnType<typeof createInvoiceInternalCommentsAdapter>) => ({
      ...adapter,
      fetchRemote: async () => {
        const snap = await adapter.fetchRemote();
        seen += 1;
        if (seen >= 2) release();
        await bothRead;
        return snap;
      },
    });
    const racedA = wrapBarrier(adapterA);
    const racedB = wrapBarrier(adapterB);
    const sessionA = createInternalCommentSubmitSession();
    const sessionB = createInternalCommentSubmitSession();

    const [resA, resB] = await Promise.all([
      sessionA.submit({
        input: { content: "AIQA-窗口A", author: "PM（測試）", timestamp: "2026/09/28 19:11:00" },
        known: true,
        currentComments: [old, reply],
        persist: bindPersist(racedA),
      }),
      sessionB.submit({
        input: { content: "AIQA-窗口B", author: "PM（測試）", timestamp: "2026/09/28 19:11:01" },
        known: true,
        currentComments: [old, reply],
        persist: bindPersist(racedB),
      }),
    ]);
    expect(resA.ok && resB.ok).toBe(true);
    expect(seen).toBeGreaterThanOrEqual(3);
    if (!resA.ok || !resB.ok) return;
    expect(resA.commentId).not.toBe(resB.commentId);

    const finalRemote = await fetchInvoiceInternalCommentRowForWrite(a.client, invoiceId);
    expect(finalRemote.ok).toBe(true);
    if (finalRemote.ok === false) return;
    const ids = finalRemote.comments.map((c) => c.id).sort();
    expect(ids).toEqual(["old-main", "old-reply", resA.commentId, resB.commentId].sort());
    expect(finalRemote.comments.filter((c) => c.content === "AIQA-窗口A")).toHaveLength(1);
    expect(finalRemote.comments.filter((c) => c.content === "AIQA-窗口B")).toHaveLength(1);
    expect(finalRemote.comments.some((c) => c.content === "AIQA-舊主則")).toBe(true);
  }, 60_000);

  it("B 原本沒有內部列時兩 client 競爭首次新增", async () => {
    const a = await loginPm();
    const b = await loginPm();
    const invoiceId = await createSyntheticInvoice(a.client, a.uid, "[AI驗收] TASK-001 1644 B 首次無列");
    const adapterA = createInvoiceInternalCommentsAdapter(a.client, { invoiceId, env: "test", uid: a.uid });
    const adapterB = createInvoiceInternalCommentsAdapter(b.client, { invoiceId, env: "test", uid: b.uid });

    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seen = 0;
    const wrapBarrier = (adapter: ReturnType<typeof createInvoiceInternalCommentsAdapter>) => ({
      ...adapter,
      fetchRemote: async () => {
        const snap = await adapter.fetchRemote();
        seen += 1;
        if (seen >= 2) release();
        await bothRead;
        return snap;
      },
    });
    const sessionA = createInternalCommentSubmitSession();
    const sessionB = createInternalCommentSubmitSession();
    const [resA, resB] = await Promise.all([
      sessionA.submit({
        input: { content: "AIQA-首次A", author: "PM（測試）", timestamp: "2026/09/28 19:12:00" },
        known: true,
        currentComments: [],
        persist: bindPersist(wrapBarrier(adapterA)),
      }),
      sessionB.submit({
        input: { content: "AIQA-首次B", author: "PM（測試）", timestamp: "2026/09/28 19:12:01" },
        known: true,
        currentComments: [],
        persist: bindPersist(wrapBarrier(adapterB)),
      }),
    ]);
    expect(resA.ok && resB.ok).toBe(true);
    expect(seen).toBeGreaterThanOrEqual(3);
    if (!resA.ok || !resB.ok) return;
    const finalRemote = await fetchInvoiceInternalCommentRowForWrite(a.client, invoiceId);
    expect(finalRemote.ok).toBe(true);
    if (finalRemote.ok === false) return;
    expect(finalRemote.comments.map((c) => c.id).sort()).toEqual([resA.commentId, resB.commentId].sort());
    expect(finalRemote.comments.filter((c) => c.content === "AIQA-首次A")).toHaveLength(1);
    expect(finalRemote.comments.filter((c) => c.content === "AIQA-首次B")).toHaveLength(1);
  }, 60_000);

  it("D 載入前讀取失敗不覆蓋舊則，恢復後沿用同一則送出", async () => {
    const { client, uid } = await loginPm();
    const invoiceId = await createSyntheticInvoice(client, uid, "[AI驗收] TASK-001 1644 D 讀取失敗");
    const adapter = createInvoiceInternalCommentsAdapter(client, { invoiceId, env: "test", uid });
    const old = comment("old-main", "AIQA-舊主則");
    const reply = comment("old-reply", "AIQA-舊回覆", "old-main");
    expect((await persistWith(adapter, [old, reply])).ok).toBe(true);

    let failRead = true;
    restoreFetch = installInternalCommentFetchInterceptor({
      failRead: () => failRead,
      dropWriteAck: () => false,
    });

    const firstLoad = await resolveInvoiceInternalComments(client, [emptyInvoice(invoiceId)], new Map());
    expect(firstLoad[0]?.internalCommentsKnown).toBe(false);
    expect(firstLoad[0]?.internalComments).toEqual([]);

    failRead = false;
    const untouched = await fetchInvoiceInternalCommentRowForWrite(client, invoiceId);
    expect(untouched.ok).toBe(true);
    if (untouched.ok === false) return;
    expect(untouched.comments.map((c) => c.id)).toEqual(["old-main", "old-reply"]);

    failRead = true;
    const session = createInternalCommentSubmitSession();
    const refused = await session.submit({
      input: { content: "AIQA-讀取失敗後送出", author: "PM（測試）", timestamp: "2026/09/28 19:13:00" },
      known: firstLoad[0]?.internalCommentsKnown,
      currentComments: firstLoad[0]?.internalComments ?? [],
      persist: bindPersist(adapter),
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refused).toBe(true);
    expect(session.pendingId()).toBe(refused.commentId);

    failRead = false;
    const stillOld = await fetchInvoiceInternalCommentRowForWrite(client, invoiceId);
    expect(stillOld.ok).toBe(true);
    if (stillOld.ok === false) return;
    expect(stillOld.comments.map((c) => c.id)).toEqual(["old-main", "old-reply"]);
    expect(stillOld.comments.some((c) => c.content === "AIQA-讀取失敗後送出")).toBe(false);

    const retried = await resolveInvoiceInternalComments(
      client,
      [emptyInvoice(invoiceId)],
      new Map([[invoiceId, firstLoad[0]!]]),
    );
    expect(retried[0]?.internalCommentsKnown).toBe(true);
    expect(retried[0]?.internalComments.map((c) => c.id)).toEqual(["old-main", "old-reply"]);

    const sent = await session.submit({
      input: { content: "AIQA-讀取失敗後送出", author: "PM（測試）", timestamp: "2026/09/28 19:13:00" },
      known: retried[0]?.internalCommentsKnown,
      currentComments: retried[0]?.internalComments ?? [],
      persist: bindPersist(adapter),
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.commentId).toBe(refused.commentId);

    const finalRemote = await fetchInvoiceInternalCommentRowForWrite(client, invoiceId);
    expect(finalRemote.ok).toBe(true);
    if (finalRemote.ok === false) return;
    expect(finalRemote.comments.map((c) => c.id)).toEqual(["old-main", "old-reply", refused.commentId]);
    expect(finalRemote.comments.filter((c) => c.content === "AIQA-讀取失敗後送出")).toHaveLength(1);
  }, 60_000);
});
