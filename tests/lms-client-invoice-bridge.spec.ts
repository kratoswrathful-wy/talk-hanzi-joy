import { test, expect } from "@playwright/test";
import {
  LMS_WRITE_SKIP_REASON,
  PwTestContext,
  probeCanCreateClientInvoice,
  uniqueTitle,
  waitForTmsAgent,
} from "./helpers/ai-agent-eval";
import { expectListPageReady, expectOnlineTestMode, switchToTestPersona } from "./helpers/test-mode-persona";

/** 【快軌補測】測試環境固定 reconciled 費用 fixture 標記標題，跨測試執行重用、不重複建立。 */
const RECONCILED_FEE_FIXTURE_TITLE = "[FIXTURE] clientInvoice-addfees-reconciled";

/**
 * 確保測試環境存在一筆固定、已對帳完成（reconciled=true）且綁定某 client 的費用，
 * 供 addFees「加入成功」路徑測試使用。若已存在（以固定標題比對）則直接回傳，
 * 否則建立並以「重新整理後仍能查到」為持久化確認訊號（比照 C1 標準，不用固定 sleep）。
 */
async function ensureReconciledFeeFixture(
  page: import("@playwright/test").Page,
): Promise<{ id: string; client: string } | null> {
  await page.goto("/fees");
  await expectListPageReady(page, "費用管理");
  await waitForTmsAgent(page);

  const found = await page.evaluate((title) => {
    const agent = (window as unknown as {
      __lmsAgent: {
        options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
        fee: {
          list: (f: Record<string, unknown>) => {
            ok: boolean;
            data?: Array<{ id: string; title?: string; clientInfo?: { client?: string; reconciled?: boolean } }>;
          };
        };
      };
    }).__lmsAgent;
    const existing = agent.fee.list({ search: title, limit: 10 });
    const match = existing.ok
      ? existing.data?.find((f) => f.title === title && f.clientInfo?.reconciled && f.clientInfo?.client)
      : undefined;
    if (match?.clientInfo?.client) return { id: match.id, client: match.clientInfo.client };
    return null;
  }, RECONCILED_FEE_FIXTURE_TITLE);
  if (found) return found;

  // 【與 clientInvoice 同型競態，注意，非本次修復範疇】feeStore.createDraft()
  // 內部會 fire-and-forget INSERT 一筆空白草稿；若緊接著（同一 fee.create()
  // 呼叫內）就送出帶 title／clientInfo 的 UPDATE，UPDATE 常搶在 INSERT 落地
  // 前送達伺服器（0 筆受影響、無 error），INSERT 之後才真正落地卻只有空白
  // 欄位，UPDATE 內容就此遺失。這裡改用兩段式：先建立空白草稿並等網路靜止
  // 讓 INSERT confirm 落地，再用 fee.update() 補寫欄位，避開此競態，
  // 不需碰 fee-store 本體（留待未來 W10 同型修復排入待辦）。
  const draftId = await page.evaluate(() => {
    const agent = (window as unknown as { __lmsAgent: { fee: { create: (i: Record<string, unknown>) => { ok: boolean; data?: { id: string } } } } }).__lmsAgent;
    const d = agent.fee.create({});
    return d.ok ? d.data?.id ?? null : null;
  });
  if (!draftId) return null;
  await page.waitForLoadState("networkidle").catch(() => {});

  const patched = await page.evaluate(
    async ({ id, title }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          fee: {
            update: (id: string, patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
          };
        };
      }).__lmsAgent;
      const clientOpts = agent.options.get("client");
      const client = clientOpts.ok && clientOpts.data?.labels?.length ? clientOpts.data.labels[0] : "";
      if (!client) return { ok: false as const, error: "無 client 選項" };
      const u = await agent.fee.update(id, {
        title,
        status: "finalized",
        clientInfo: { client, reconciled: true },
      });
      return u.ok ? { ok: true as const, client } : { ok: false as const, error: u.error };
    },
    { id: draftId, title: RECONCILED_FEE_FIXTURE_TITLE },
  );
  if (!patched.ok) return null;

  // 同理：等 UPDATE 真正送達伺服器後才重新整理，避免 reload 取消該 fetch。
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.reload();
  await expectListPageReady(page, "費用管理");
  await waitForTmsAgent(page);
  const confirmed = await page.evaluate(
    ({ id, title }) => {
      const agent = (window as unknown as {
        __lmsAgent: { fee: { get: (i: string) => { ok: boolean; data?: { title?: string } } } };
      }).__lmsAgent;
      const got = agent.fee.get(id);
      return got.ok && got.data?.title === title;
    },
    { id: draftId, title: RECONCILED_FEE_FIXTURE_TITLE },
  );
  if (!confirmed) return null;
  return { id: draftId, client: patched.client };
}

const ctx = new PwTestContext();
let canWriteClientInvoice = false;
let writeProbeError = "";
let reconciledFeeFixture: { id: string; client: string } | null = null;

test.describe("LMS clientInvoice bridge（慢軌 High）", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: "playwright/.auth/user.json" });
    const page = await context.newPage();
    try {
      await page.goto("/client-invoices");
      const probe = await probeCanCreateClientInvoice(page);
      canWriteClientInvoice = probe.ok;
      writeProbeError = probe.error || "";
      if (canWriteClientInvoice) {
        reconciledFeeFixture = await ensureReconciledFeeFixture(page);
      }
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/client-invoices");
    await expectListPageReady(page, "客戶請款");
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

  test("addFees 回傳 added／skipped 結構（含加入成功路徑，用固定 reconciled 費用 fixture）", async ({ page }) => {
    test.skip(!canWriteClientInvoice, LMS_WRITE_SKIP_REASON);
    test.skip(!reconciledFeeFixture, "無法建立／確認固定 reconciled 費用 fixture（見 ensureReconciledFeeFixture）");

    const fixture = reconciledFeeFixture!;

    // 【自我修復，獨立一步】fixture 費用「固定」是指本身（title/reconciled）
    // 可重用，而非永久綁死某張請款單；若上次執行殘留連結（前次測試中斷未清），
    // 這裡先解除，確保本次仍走得到「加入成功」路徑，不因 linked_to_other_invoice
    // 被跳過而誤判。獨立成一步＋等網路靜止，是因為 client-invoice-store 目前對
    // client_invoices／client_invoice_fees 的 realtime 變更一律觸發整表
    // loadInvoices()（無 in-flight 樂觀寫入保護，同 W1 store 工廠待辦事項），
    // 若與下面的 create() 同批執行，removeFee 觸發的背景 reload 可能搶在
    // create() 的 INSERT 真正落地前執行，把剛建立的請款單從本地 store 覆蓋掉。
    const stale = await page.evaluate(async (fixtureFeeId) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          clientInvoice: {
            list: (f: Record<string, unknown>) => { ok: boolean; data?: Array<{ id: string; feeIds?: string[] }> };
            removeFee: (invoiceId: string, feeId: string) => Promise<{ ok: boolean; error?: string }>;
          };
        };
      }).__lmsAgent;
      const prior = agent.clientInvoice.list({});
      const staleInv = prior.ok ? prior.data?.find((inv) => inv.feeIds?.includes(fixtureFeeId)) : undefined;
      if (!staleInv) return null;
      const removed = await agent.clientInvoice.removeFee(staleInv.id, fixtureFeeId);
      return removed.ok;
    }, fixture.id);
    if (stale !== null) {
      await page.waitForLoadState("networkidle").catch(() => {});
    }

    const created = await page.evaluate((fixtureClient) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          clientInvoice: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; data?: { invoice: { id: string } }; error?: string }>;
          };
        };
      }).__lmsAgent;
      return agent.clientInvoice.create({ client: fixtureClient, title: `[PW] cinv-addfees ${Date.now()}` });
    }, fixture.client);
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const invoiceId = created.data!.invoice.id;
    ctx.clientInvoiceId = invoiceId;

    // 【與前面自我修復同理，注意】client_invoices INSERT 也會觸發同一顆
    // realtime 全表 reload；在其可能觸發的背景 loadInvoices() 落地前就送
    // addFees 的第二筆寫入，同樣有被稍舊的重載結果蓋掉本地 feeIds 的風險。
    await page.waitForLoadState("networkidle").catch(() => {});

    const r = await page.evaluate(
      async ({ id, fixtureFeeId }) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            clientInvoice: {
              addFees: (
                invoiceId: string,
                ids: string[],
              ) => Promise<{
                ok: boolean;
                data?: { added: string[]; skipped: Array<{ feeId: string; reason: string }>; verified?: boolean };
                error?: string;
              }>;
            };
          };
        }).__lmsAgent;
        const feeIds = [fixtureFeeId, "00000000-0000-0000-0000-000000000099"];
        const added = await agent.clientInvoice.addFees(id, feeIds);
        if (!added.ok || !added.data) return { ok: false, error: added.error };
        return { ok: true, added: added.data.added, skipped: added.data.skipped, verified: added.data.verified };
      },
      { id: invoiceId, fixtureFeeId: fixture.id },
    );

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.added, JSON.stringify(r)).toEqual([fixture.id]);
    expect(Array.isArray(r.skipped)).toBe(true);
    expect(r.skipped?.some((s: { reason: string }) => s.reason === "not_found")).toBe(true);

    // 【地面真相確認，不信任立即回傳的 verified】client-invoice-store 目前對
    // client_invoices／client_invoice_fees 的 realtime 變更會整表 reload，且無
    // in-flight 樂觀寫入保護（同 W1 store 工廠待辦事項，非本次修復範疇）；
    // addFees 剛回傳的 verified 有時會被稍舊的背景重載覆蓋成假陰性。真正驗收
    // 標準改用「等網路靜止＋重新整理」後再讀，比照 C1 持久化標準。
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.reload();
    await expectListPageReady(page, "客戶請款");
    await waitForTmsAgent(page);
    const persisted = await page.evaluate(
      ({ id, fixtureFeeId }) => {
        const agent = (window as unknown as {
          __lmsAgent: { clientInvoice: { get: (i: string) => { ok: boolean; data?: { feeIds: string[] } } } };
        }).__lmsAgent;
        const got = agent.clientInvoice.get(id);
        return got.ok && (got.data?.feeIds ?? []).includes(fixtureFeeId);
      },
      { id: invoiceId, fixtureFeeId: fixture.id },
    );
    expect(persisted).toBe(true);
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
