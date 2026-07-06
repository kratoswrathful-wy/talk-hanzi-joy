import { test, expect } from "@playwright/test";
import { resolveCatFixture } from "./helpers/cat-fixtures";
import { openOfflineCatWithFile } from "./helpers/cat-offline-open";
import {
  LMS_WRITE_SKIP_REASON,
  PwTestContext,
  probeCanCreateCase,
  probeCanCreateClientInvoice,
  PW_UPLOAD_BASE64,
  PW_UPLOAD_FILE_NAME,
  uniqueTitle,
  waitForCatIframeUserId,
  waitForTmsAgent,
} from "./helpers/ai-agent-eval";

const ctx = new PwTestContext();
const SMALL_FIXTURE = resolveCatFixture("small");

let canWriteCases = false;
let canWriteClientInvoices = false;
let lmsWriteProbeError = "";

test.describe("AI Bridge Phase 2 (Playwright)", () => {
  test.describe("LMS — P2-L1～L8", () => {
    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext({ storageState: "playwright/.auth/user.json" });
      const page = await context.newPage();
      try {
        await page.goto("/cases");
        const caseProbe = await probeCanCreateCase(page);
        canWriteCases = caseProbe.ok;
        const ciProbe = await probeCanCreateClientInvoice(page);
        canWriteClientInvoices = ciProbe.ok;
        lmsWriteProbeError = caseProbe.error || ciProbe.error || "";
      } finally {
        await context.close();
      }
    });

    test.beforeEach(async ({ page }) => {
      await page.goto("/cases");
      await waitForTmsAgent(page);
    });

    test("P2-L1 — __tmsAgent 存在且別名正確", async ({ page }) => {
      const r = await page.evaluate(() => ({
        has: !!(window as unknown as { __tmsAgent?: unknown }).__tmsAgent,
        alias:
          (window as unknown as { __lmsAgent?: unknown; __tmsAgent?: { lms: unknown } }).__lmsAgent ===
          (window as unknown as { __tmsAgent?: { lms: unknown } }).__tmsAgent?.lms,
      }));
      expect(r, ctx.footnote()).toEqual({ has: true, alias: true });
    });

    test("P2-L2 — describe() 回傳 ok", async ({ page }) => {
      const r = await page.evaluate(() =>
        (window as unknown as { __lmsAgent: { describe: () => { ok: boolean; error?: string } } }).__lmsAgent.describe(),
      );
      expect(r.ok, `${r.error ?? ""}${ctx.footnote()}`).toBe(true);
    });

    test("P2-L3 — upload.fromBytes 小檔", async ({ page }) => {
      const r = await page.evaluate(
        async ({ fileName, base64 }) => {
          const agent = (window as unknown as {
            __lmsAgent: {
              upload: {
                fromBytes: (i: { fileName: string; contentType: string; base64: string }) => Promise<{
                  ok: boolean;
                  error?: string;
                  data?: { url: string };
                }>;
              };
            };
          }).__lmsAgent;
          return agent.upload.fromBytes({ fileName, contentType: "text/plain", base64 });
        },
        { fileName: PW_UPLOAD_FILE_NAME, base64: PW_UPLOAD_BASE64 },
      );
      expect(r.ok, `${r.error ?? ""}${ctx.footnote()}`).toBe(true);
      expect(r.data?.url).toBeTruthy();
    });

    test("P2-L4 — case.create + workingFiles", async ({ page }) => {
      test.skip(!canWriteCases, `${LMS_WRITE_SKIP_REASON}${lmsWriteProbeError ? `（${lmsWriteProbeError}）` : ""}`);
      const title = uniqueTitle("case-upload");
      const r = await page.evaluate(
        async ({ caseTitle, fileName, base64 }) => {
          const agent = (window as unknown as {
            __lmsAgent: {
              upload: {
                fromBytes: (i: { fileName: string; contentType: string; base64: string }) => Promise<{
                  ok: boolean;
                  error?: string;
                  data?: { name: string; url: string };
                }>;
              };
              case: {
                create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
                update: (id: string, p: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
                get: (id: string) => { ok: boolean; data?: { workingFiles?: Array<{ url?: string }> } };
              };
            };
          }).__lmsAgent;
          const up = await agent.upload.fromBytes({ fileName, contentType: "text/plain", base64 });
          if (!up.ok || !up.data) return { ok: false, step: "upload", error: up.error };
          const created = await agent.case.create({ title: caseTitle, status: "draft" });
          if (!created.ok || !created.data) return { ok: false, step: "create", error: created.error };
          const updated = await agent.case.update(created.data.id, {
            workingFiles: [{ name: up.data.name, url: up.data.url }],
          });
          if (!updated.ok) return { ok: false, step: "update", error: updated.error };
          const got = agent.case.get(created.data.id);
          const files = got.ok ? got.data?.workingFiles ?? [] : [];
          const hasFile = files.some((f) => f.url === up.data!.url);
          return { ok: hasFile, caseId: created.data.id };
        },
        { caseTitle: title, fileName: PW_UPLOAD_FILE_NAME, base64: PW_UPLOAD_BASE64 },
      );
      expect(r.ok, JSON.stringify(r) + ctx.footnote()).toBe(true);
      if (r.caseId) ctx.caseId = r.caseId;
    });

    test("P2-L5 — case.generateFees", async ({ page }) => {
      test.skip(!canWriteCases, `${LMS_WRITE_SKIP_REASON}${lmsWriteProbeError ? `（${lmsWriteProbeError}）` : ""}`);
      const title = uniqueTitle("case-fees");
      const r = await page.evaluate(async (caseTitle) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            case: {
              create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
              generateFees: (id: string) => Promise<{
                ok: boolean;
                error?: string;
                data?: { fees?: Array<{ id: string }> };
              }>;
            };
          };
        }).__lmsAgent;
        const created = await agent.case.create({
          title: caseTitle,
          status: "draft",
          workGroups: [{ workType: "翻譯", billingUnit: "字", unitCount: 100 }],
        });
        if (!created.ok || !created.data) return { ok: false, error: created.error ?? "create failed" };
        const gen = await agent.case.generateFees(created.data.id);
        return {
          ok: gen.ok && Array.isArray(gen.data?.fees) && (gen.data?.fees?.length ?? 0) >= 1,
          caseId: created.data.id,
          fees: gen.data?.fees,
          error: gen.error,
        };
      }, title);
      expect(r.ok, `${r.error ?? ""} ${JSON.stringify(r)}${ctx.footnote()}`).toBe(true);
      if (r.caseId) ctx.caseId = r.caseId;
      if (r.fees?.[0]?.id) ctx.feeId = r.fees[0].id;
    });

    test("P2-L6 — invoice.create + get", async ({ page }) => {
      test.skip(!canWriteCases, `${LMS_WRITE_SKIP_REASON}${lmsWriteProbeError ? `（${lmsWriteProbeError}）` : ""}`);
      const title = uniqueTitle("invoice");
      const r = await page.evaluate(async (invTitle) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
            invoice: {
              create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
              get: (id: string) => { ok: boolean; error?: string; data?: { id: string } };
            };
          };
        }).__lmsAgent;
        const assigneeOpts = agent.options.get("assignee");
        const translator =
          assigneeOpts.ok && assigneeOpts.data?.labels?.length ? assigneeOpts.data.labels[0] : "";
        const created = await agent.invoice.create({ translator, title: invTitle });
        if (!created.ok || !created.data) return { ok: false, error: created.error ?? "create failed" };
        const got = agent.invoice.get(created.data.id);
        return {
          ok: got.ok && got.data?.id === created.data.id,
          invoiceId: created.data.id,
          error: got.error,
        };
      }, title);
      expect(r.ok, `${r.error ?? ""}${ctx.footnote()}`).toBe(true);
      if (r.invoiceId) ctx.invoiceId = r.invoiceId;
    });

    test("P2-L7 — clientInvoice.create + get", async ({ page }) => {
      test.skip(!canWriteClientInvoices, `${LMS_WRITE_SKIP_REASON}${lmsWriteProbeError ? `（${lmsWriteProbeError}）` : ""}`);
      const title = uniqueTitle("client-invoice");
      const r = await page.evaluate(async (invTitle) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
            clientInvoice: {
              create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
              get: (id: string) => { ok: boolean; error?: string; data?: { id: string } };
            };
          };
        }).__lmsAgent;
        const clientOpts = agent.options.get("client");
        const client = clientOpts.ok && clientOpts.data?.labels?.length ? clientOpts.data.labels[0] : "";
        if (!client) return { ok: false, error: "無可用 client 選項" };
        const created = await agent.clientInvoice.create({ client, title: invTitle });
        if (!created.ok || !created.data) return { ok: false, error: created.error ?? "create failed" };
        const got = agent.clientInvoice.get(created.data.id);
        return {
          ok: got.ok && got.data?.id === created.data.id,
          clientInvoiceId: created.data.id,
          error: got.error,
        };
      }, title);
      expect(r.ok, `${r.error ?? ""}${ctx.footnote()}`).toBe(true);
      if (r.clientInvoiceId) ctx.clientInvoiceId = r.clientInvoiceId;
    });

    test("P2-L8 — fee.update finalized 應成功", async ({ page }) => {
      test.skip(!canWriteCases, `${LMS_WRITE_SKIP_REASON}${lmsWriteProbeError ? `（${lmsWriteProbeError}）` : ""}`);
      const title = uniqueTitle("fee-finalize");
      const r = await page.evaluate(async (feeTitle) => {
        const agent = (window as unknown as {
          __lmsAgent: {
            fee: {
              create: (i: Record<string, unknown>) => { ok: boolean; error?: string; data?: { id: string } };
              update: (id: string, p: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
              get: (id: string) => { ok: boolean; data?: { status?: string } };
            };
          };
        }).__lmsAgent;
        const created = agent.fee.create({ title: feeTitle, status: "draft" });
        if (!created.ok || !created.data) return { ok: false, error: created.error ?? "create failed" };
        const updated = await agent.fee.update(created.data.id, { status: "finalized" });
        const got = agent.fee.get(created.data.id);
        return {
          ok: updated.ok && got.ok && got.data?.status === "finalized",
          feeId: created.data.id,
          updateError: updated.error,
          status: got.ok ? got.data?.status : undefined,
        };
      }, title);
      expect(r.ok, `${r.updateError ?? ""} status=${r.status}${ctx.footnote()}`).toBe(true);
      if (r.feeId) ctx.feeId = r.feeId;
    });
  });

  test.describe("CAT 離線 — P2-C1～C5", () => {
    const catProjectName = uniqueTitle("cat-batch");

    test("P2-C1～C5", async ({ page }) => {
      test.setTimeout(360_000);
      test.setTimeout(300_000);
      ctx.projectName = catProjectName;

      const frame = await openOfflineCatWithFile(page, {
        fixturePath: SMALL_FIXTURE,
        projectName: catProjectName,
        importTimeoutMs: 180_000,
        editorTimeoutMs: 180_000,
      });

      const hasAgent = await frame.locator("body").evaluate(
        () => !!(window as unknown as { __catAgent?: unknown }).__catAgent,
      );
      expect(hasAgent, ctx.footnote()).toBe(true);

      const desc = await frame.locator("body").evaluate(() => {
        const agent = (window as unknown as {
          __catAgent: { describe: () => { ok: boolean; data?: { segmentCount?: number } } };
        }).__catAgent;
        return agent.describe();
      });
      expect(desc.ok, ctx.footnote()).toBe(true);
      await expect
        .poll(async () => {
          const d = await frame.locator("body").evaluate(() => {
            const agent = (window as unknown as {
              __catAgent: { describe: () => { data?: { segmentCount?: number } } };
            }).__catAgent;
            return agent.describe().data?.segmentCount ?? 0;
          });
          const rows = await frame.locator(".grid-data-row").count();
          return Math.max(d, rows);
        }, { timeout: 120_000 })
        .toBeGreaterThan(0);

      await waitForCatIframeUserId(frame);

      const setTm = await frame.locator("body").evaluate(async () => {
        const agent = (window as unknown as {
          __catAgent: {
            aiBatch: {
              setSettings: (p: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
              getSettings: () => Promise<{
                ok: boolean;
                error?: string;
                data?: { batchRefOptions?: { tm?: boolean } };
              }>;
            };
          };
        }).__catAgent;
        const set = await agent.aiBatch.setSettings({ batchRefOptions: { tm: false } });
        if (!set.ok) return { ok: false, error: set.error };
        const get = await agent.aiBatch.getSettings();
        return {
          ok: get.ok && get.data?.batchRefOptions?.tm === false,
          tm: get.data?.batchRefOptions?.tm,
          error: get.error,
        };
      });
      expect(setTm.ok, `${setTm.error ?? ""} tm=${setTm.tm}${ctx.footnote()}`).toBe(true);

      const cancelBtn = frame.locator("#btnCancelAiBatch");
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
      }

      // P2-C4：關閉再開 AI 批次 Modal，prefs 仍一致（同編輯器工作階段）
      const afterModalReopen = await frame.locator("body").evaluate(async () => {
        const agent = (window as unknown as {
          __catAgent: {
            aiBatch: {
              openModal: () => { ok: boolean };
              getSettings: () => Promise<{
                ok: boolean;
                data?: { batchRefOptions?: { tm?: boolean } };
              }>;
            };
          };
        }).__catAgent;
        agent.aiBatch.openModal();
        const get = await agent.aiBatch.getSettings();
        return {
          ok: get.ok && get.data?.batchRefOptions?.tm === false,
          tm: get.data?.batchRefOptions?.tm,
        };
      });
      expect(afterModalReopen.ok, `tm=${afterModalReopen.tm}${ctx.footnote()}`).toBe(true);

      await waitForTmsAgent(page);
      const invoke = await page.evaluate(async () => {
        const tms = (window as unknown as {
          __tmsAgent: {
            cat: {
              invoke: (
                m: string,
                a?: unknown[],
              ) => Promise<{ ok: boolean; error?: string; data?: { batchRefOptions?: unknown } }>;
            };
          };
        }).__tmsAgent;
        const r = await tms.cat.invoke("aiBatch.getSettings");
        return { ok: r.ok, hasBatchRef: !!r.data?.batchRefOptions, error: r.error };
      });
      expect(invoke.ok, `${invoke.error ?? ""}${ctx.footnote()}`).toBe(true);
      expect(invoke.hasBatchRef, ctx.footnote()).toBe(true);
    });
  });
});
