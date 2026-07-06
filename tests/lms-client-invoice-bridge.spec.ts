import { test, expect } from "@playwright/test";
import {
  LMS_WRITE_SKIP_REASON,
  PwTestContext,
  probeCanCreateClientInvoice,
  uniqueTitle,
  waitForTmsAgent,
} from "./helpers/ai-agent-eval";
import { expectListPageReady, expectOnlineTestMode, switchToTestPersona } from "./helpers/test-mode-persona";

const ctx = new PwTestContext();
let canWriteClientInvoice = false;
let writeProbeError = "";

test.describe("LMS clientInvoice bridge（慢軌 High）", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: "playwright/.auth/user.json" });
    const page = await context.newPage();
    try {
      await page.goto("/client-invoices");
      const probe = await probeCanCreateClientInvoice(page);
      canWriteClientInvoice = probe.ok;
      writeProbeError = probe.error || "";
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/client-invoices");
    await waitForTmsAgent(page);
  });

  test("create → setChannel → setExpectedDate 回讀 verified，重載後仍在", async ({ page }) => {
    test.skip(!canWriteClientInvoice, `${LMS_WRITE_SKIP_REASON}${writeProbeError ? `（${writeProbeError}）` : ""}`);

    const title = uniqueTitle("cinv-bridge");
    const r = await page.evaluate(async (invoiceTitle) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] }; allowed?: string[] } };
          clientInvoice: {
            create: (i: { client: string; title: string }) => Promise<{
              ok: boolean;
              error?: string;
              data?: { invoice: { id: string }; verified?: boolean };
            }>;
            setChannel: (
              id: string,
              ch: string,
            ) => Promise<{ ok: boolean; data?: { verified?: boolean; invoice?: { billingChannel?: string } } }>;
            setExpectedDate: (
              id: string,
              d: string,
            ) => Promise<{ ok: boolean; data?: { verified?: boolean; invoice?: { expectedCollectionDate?: string } } }>;
            get: (id: string) => { ok: boolean; data?: { title?: string; billingChannel?: string; expectedCollectionDate?: string } };
          };
        };
      }).__lmsAgent;

      const clientOpts = agent.options.get("client");
      const client = clientOpts.ok && clientOpts.data?.labels?.length ? clientOpts.data.labels[0] : "";
      if (!client) return { ok: false, step: "client", error: "無 client 選項" };

      const created = await agent.clientInvoice.create({ client, title: invoiceTitle });
      if (!created.ok || !created.data?.invoice?.id) {
        return { ok: false, step: "create", error: created.error };
      }
      const id = created.data.invoice.id;

      const channels = agent.options.get("billingChannel");
      const channel =
        channels.ok && channels.data?.labels?.length ? channels.data.labels[0] : "";
      if (!channel) return { ok: false, step: "channel", error: "無 billingChannel 選項", id };

      const ch = await agent.clientInvoice.setChannel(id, channel);
      if (!ch.ok || !ch.data?.verified) return { ok: false, step: "setChannel", error: "setChannel 失敗", id };

      const dt = await agent.clientInvoice.setExpectedDate(id, "2026-08-01");
      if (!dt.ok || !dt.data?.verified) return { ok: false, step: "setExpectedDate", error: "setExpectedDate 失敗", id };

      const got = agent.clientInvoice.get(id);
      return {
        ok: true,
        id,
        title: got.data?.title,
        channel: got.data?.billingChannel,
        expectedDate: got.data?.expectedCollectionDate,
        createVerified: created.data.verified,
      };
    }, title);

    expect(r.ok, JSON.stringify(r) + ctx.footnote()).toBe(true);
    if (!r.id) return;
    ctx.clientInvoiceId = r.id;
    expect(r.createVerified).toBe(true);
    expect(r.title).toBe(title);
    expect(r.channel).toBeTruthy();
    expect(r.expectedDate).toBe("2026-08-01");

    // 【C1 持久化標準】重新整理後須真正等待 clientInvoiceStore 完成重新載入
    // （非僅等 __tmsAgent 掛載），否則會在 store 尚未 loadInvoices() 完成時
    // 讀到空快取而誤判為「未持久化」。
    await page.reload();
    await expectListPageReady(page, "客戶請款");
    await waitForTmsAgent(page);
    const afterReload = await page.evaluate((id) => {
      const inv = (window as unknown as {
        __lmsAgent: { clientInvoice: { get: (i: string) => { ok: boolean; data?: { title?: string } } } };
      }).__lmsAgent.clientInvoice.get(id);
      return inv.ok ? inv.data?.title : null;
    }, r.id);
    expect(afterReload).toBe(title);
  });

  test("adjustAmount set_target 無費用時可新增調整列", async ({ page }) => {
    test.skip(!canWriteClientInvoice, LMS_WRITE_SKIP_REASON);

    const r = await page.evaluate(async () => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          clientInvoice: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; data?: { invoice: { id: string } }; error?: string }>;
            adjustAmount: (
              id: string,
              input: { mode: string; currency: string; targetAmount: number },
            ) => Promise<{
              ok: boolean;
              error?: string;
              data?: { verified?: boolean; line?: { operation: string; amount: number } | null };
            }>;
          };
        };
      }).__lmsAgent;

      const clientOpts = agent.options.get("client");
      const client = clientOpts.ok && clientOpts.data?.labels?.length ? clientOpts.data.labels[0] : "";
      const created = await agent.clientInvoice.create({
        client,
        title: `[PW] cinv-adj ${Date.now()}`,
      });
      if (!created.ok || !created.data) return { ok: false, error: created.error };

      const adj = await agent.clientInvoice.adjustAmount(created.data.invoice.id, {
        mode: "set_target",
        currency: "TWD",
        targetAmount: 500,
      });
      if (!adj.ok || !adj.data?.verified) return { ok: false, error: adj.error };
      return { ok: true, line: adj.data.line, id: created.data.invoice.id };
    });

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.line?.operation).toBe("add");
    // 幣別換算涉及浮點運算，容許極小誤差（非本次回讀驗證修正的範疇）。
    expect(r.line?.amount ?? 0).toBeCloseTo(500, 6);
    if (r.id) ctx.clientInvoiceId = r.id;
  });

  test("addFees 回傳 added／skipped 結構", async ({ page }) => {
    test.skip(!canWriteClientInvoice, LMS_WRITE_SKIP_REASON);

    const r = await page.evaluate(async () => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          fee: { list: (f: Record<string, unknown>) => { ok: boolean; data?: Array<{ id: string; clientInfo?: { client?: string; reconciled?: boolean } }> } };
          clientInvoice: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; data?: { invoice: { id: string; client: string } }; error?: string }>;
            addFees: (
              id: string,
              ids: string[],
            ) => Promise<{
              ok: boolean;
              data?: { added: string[]; skipped: Array<{ feeId: string; reason: string }>; verified?: boolean };
              error?: string;
            }>;
          };
        };
      }).__lmsAgent;

      const clientOpts = agent.options.get("client");
      const client = clientOpts.ok && clientOpts.data?.labels?.length ? clientOpts.data.labels[0] : "";
      const created = await agent.clientInvoice.create({ client, title: `[PW] cinv-addfees ${Date.now()}` });
      if (!created.ok || !created.data) return { ok: false, error: created.error };

      const inv = created.data.invoice;
      const fees = agent.fee.list({});
      const eligible =
        fees.ok && fees.data
          ? fees.data.filter(
              (f) => f.clientInfo?.reconciled && f.clientInfo?.client === inv.client,
            )
          : [];
      const feeIds = [
        ...(eligible[0] ? [eligible[0].id] : []),
        "00000000-0000-0000-0000-000000000099",
      ];
      if (feeIds.length < 2) return { ok: true, skipped: true, reason: "無可用 reconciled 費用 fixture" };

      const added = await agent.clientInvoice.addFees(inv.id, feeIds);
      if (!added.ok || !added.data) return { ok: false, error: added.error };
      return {
        ok: added.data.verified === true,
        added: added.data.added,
        skipped: added.data.skipped,
        id: inv.id,
      };
    });

    if (r.skipped) {
      test.skip(true, r.reason as string);
      return;
    }
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(Array.isArray(r.added)).toBe(true);
    expect(Array.isArray(r.skipped)).toBe(true);
    expect(r.skipped?.some((s: { reason: string }) => s.reason === "not_found")).toBe(true);
    if (r.id) ctx.clientInvoiceId = r.id;
  });

  test("非法 billingChannel 回 ok:false 與 allowed", async ({ page }) => {
    test.skip(!canWriteClientInvoice, LMS_WRITE_SKIP_REASON);

    const r = await page.evaluate(async () => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          clientInvoice: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; data?: { invoice: { id: string } } }>;
            setChannel: (id: string, ch: string) => Promise<{ ok: boolean; allowed?: string[]; error?: string }>;
          };
        };
      }).__lmsAgent;
      const client = agent.options.get("client").data?.labels?.[0] || "";
      const created = await agent.clientInvoice.create({ client, title: `[PW] cinv-badch ${Date.now()}` });
      if (!created.ok || !created.data) return { ok: false };
      return agent.clientInvoice.setChannel(created.data.invoice.id, "__INVALID_CHANNEL__");
    });

    expect(r.ok).toBe(false);
    expect(Array.isArray(r.allowed)).toBe(true);
    expect((r.allowed as string[]).length).toBeGreaterThan(0);
  });

  test("譯者身分呼叫 create 須被拒", async ({ page }) => {
    await expectOnlineTestMode(page);
    await switchToTestPersona(page, "譯者一");

    const r = await page.evaluate(async () => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          clientInvoice: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
          };
        };
      }).__lmsAgent;
      const client = agent.options.get("client").data?.labels?.[0] || "ECI";
      return agent.clientInvoice.create({ client, title: `[PW] cinv-deny ${Date.now()}` });
    });

    expect(r.ok).toBe(false);
    expect(r.error || "").toMatch(/PM|譯者/);
  });
});
