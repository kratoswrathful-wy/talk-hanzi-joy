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

function todayYYMMDD(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

test.describe("複製案件後標題刷新（W9 wave 2 C3）", () => {
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

  test("複製後導覽的新頁面標題／其他欄位皆即時刷新，無 state bleed", async ({ page }) => {
    test.skip(!canWriteCases, `${LMS_WRITE_SKIP_REASON}${lmsWriteProbeError ? `（${lmsWriteProbeError}）` : ""}`);

    // 加上非數字字尾，避免結尾 6+ 位數字被 parseCaseTitleForDuplicate 誤判為既有日期戳而走「重新編號」分支
    const sourceTitle = `${uniqueTitle("c3-copy-src")}-t`;
    // clientPoNumber 依產品規格屬「複製時清空」欄位（case-store.ts clearDuplicateFields），
    // 刻意帶入以便同時驗證：不刷新（title bug）與過度刷新（清空欄位被誤帶過去）兩種回歸皆可測出。
    const clientPoNumber = `PO-${Date.now()}`;

    await page.goto("/cases");
    await waitForTmsAgent(page);

    // 建立來源案件，含客戶 PO# 欄位以便全頁抽查「應被清空」的欄位沒有錯誤帶入新案件
    const created = await page.evaluate(
      async ({ title, po }) => {
        const agent = (
          window as unknown as {
            __lmsAgent: {
              case: {
                create: (
                  i: Record<string, unknown>,
                ) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
              };
            };
          }
        ).__lmsAgent;
        return agent.case.create({ title, status: "draft", clientPoNumber: po });
      },
      { title: sourceTitle, po: clientPoNumber },
    );
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const sourceId = created.data!.id;
    ctx.caseId = sourceId;

    await page.goto(`/cases/${sourceId}`);
    await page.waitForURL(`**/cases/${sourceId}`);
    await expect(page.getByTestId("case-title-input")).toHaveValue(sourceTitle);

    // 點擊「複製本頁」（uiButtonId=cases_copy），走真實 UI 入口，不作弊、不注入自訂元素
    await page.getByRole("button", { name: "複製本頁" }).click();

    // 導覽到新案件頁（key={id} 全頁 remount）
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    });

    const newUrl = new URL(page.url());
    const newIdMatch = newUrl.pathname.match(/^\/cases\/([^/]+)/);
    expect(newIdMatch).toBeTruthy();
    const newId = newIdMatch![1];
    expect(newId).not.toBe(sourceId);

    const expectedNewTitle = `${sourceTitle.trim()} ${todayYYMMDD()}`;

    // 整頁抽查 1：標題須即時對應新案件內容，不殘留來源案件畫面（state bleed 本題）
    await expect(page.getByTestId("case-title-input")).toHaveValue(expectedNewTitle, { timeout: 15_000 });
    // 整頁抽查 2：客戶 PO# 依規格複製時應清空——防止「為修標題而過度刷新」把其他欄位誤帶過去的回歸
    await expect(page.getByTestId("case-client-po-input")).toHaveValue("");

    // bridge 對照：URL 上的 id 與畫面實際渲染中的案件 id 必須一致（B2／C3 診斷 API）
    const idCheck = await page.evaluate(() => {
      const agent = (
        window as unknown as {
          __lmsAgent: {
            case: {
              getCurrentId: () => {
                ok: boolean;
                data?: { urlCaseId: string | null; renderedCaseId: string | null; matches: boolean };
              };
            };
          };
        }
      ).__lmsAgent;
      return agent.case.getCurrentId();
    });
    expect(idCheck.ok).toBe(true);
    expect(idCheck.data?.urlCaseId).toBe(newId);
    expect(idCheck.data?.renderedCaseId).toBe(newId);
    expect(idCheck.data?.matches).toBe(true);

    // 反向確認：畫面已不殘留來源案件的標題文字
    await expect(page.getByTestId("case-title-input")).not.toHaveValue(sourceTitle);
  });
});
