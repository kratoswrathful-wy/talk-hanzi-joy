import { test, expect } from "@playwright/test";
import {
  LMS_WRITE_SKIP_REASON,
  PwTestContext,
  probeCanCreateCase,
  uniqueTitle,
  waitForTmsAgent,
} from "./helpers/ai-agent-eval";

const ctx = new PwTestContext();
let canWriteCases = false;
let lmsWriteProbeError = "";

test.describe("LMS tool.setField（W9 wave 2 C1）", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: "playwright/.auth/user.json" });
    const page = await context.newPage();
    try {
      await page.goto("/cases");
      const probe = await probeCanCreateCase(page);
      canWriteCases = probe.ok;
      lmsWriteProbeError = probe.error || "";
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/cases");
    await waitForTmsAgent(page);
  });

  test("寫入工具多行欄位後回讀 verified", async ({ page }) => {
    test.skip(!canWriteCases, `${LMS_WRITE_SKIP_REASON}${lmsWriteProbeError ? `（${lmsWriteProbeError}）` : ""}`);

    const title = uniqueTitle("tool-set-field");
    const r = await page.evaluate(async (caseTitle) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
            update: (id: string, p: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
            get: (id: string) => { ok: boolean; data?: { tools?: Array<{ fieldValues?: Record<string, string> }> } };
          };
          tool: {
            setField: (input: {
              caseId: string;
              toolLabel: string;
              fieldKey: string;
              value: string;
            }) => Promise<{
              ok: boolean;
              error?: string;
              data?: { verified?: boolean; readbackValue?: string; fieldId?: string };
            }>;
          };
        };
      }).__lmsAgent;

      const created = await agent.case.create({ title: caseTitle, status: "draft" });
      if (!created.ok || !created.data) return { ok: false, step: "create", error: created.error };

      const caseId = created.data.id;
      const seeded = await agent.case.update(caseId, {
        tools: [
          {
            id: "te-pw",
            tool: "memoQ",
            fields: [{ id: "fld-server", label: "伺服器", type: "text" }],
            fieldValues: {},
          },
        ],
      });
      if (!seeded.ok) return { ok: false, step: "seed-tools", error: seeded.error };

      const written = await agent.tool.setField({
        caseId,
        toolLabel: "memoQ",
        fieldKey: "伺服器",
        value: "pw-mq.example.com",
      });
      if (!written.ok || !written.data) {
        return { ok: false, step: "setField", error: written.error };
      }

      return {
        ok: written.data.verified === true,
        caseId,
        verified: written.data.verified,
        readbackValue: written.data.readbackValue,
        fieldId: written.data.fieldId,
      };
    }, title);

    expect(r.ok, JSON.stringify(r) + ctx.footnote()).toBe(true);
    if (r.caseId) ctx.caseId = r.caseId;
    expect(r.verified).toBe(true);
    expect(r.readbackValue).toBe("pw-mq.example.com");
    expect(typeof r.fieldId).toBe("string");
    expect((r.fieldId as string).length).toBeGreaterThan(0);
  });
});
