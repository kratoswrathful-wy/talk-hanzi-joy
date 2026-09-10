import { test, expect, type Page, type Route } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { accessToken, restClient, readCaseState } from "./helpers/isolated-api";
import { createDraftViaRpc } from "./helpers/save-reliability-iso";

/**
 * TASK-001 儲存可靠性：隔離驗證（D1／D2／Q01／Q21）。
 * PLAYWRIGHT_SAVE_RELIABILITY_UI=1；建案用 RPC fixture，不依賴範本姓名過濾（B）。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeSave = ENABLED ? test.describe : test.describe.skip;

function credPm(): { email: string; password: string } {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

type RpcGate = { parked: Route[] };

function newGate(): RpcGate {
  return { parked: [] };
}

async function parkRpc(page: Page, name: string, gate: RpcGate) {
  await page.route(`**/rest/v1/rpc/${name}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    gate.parked.push(route);
  });
}

function expectedRevisions(gate: RpcGate): number[] {
  return gate.parked.map((route) => {
    try {
      const body = route.request().postDataJSON() as { p_expected_revision?: number };
      return Number(body.p_expected_revision);
    } catch {
      return Number.NaN;
    }
  });
}

async function fulfillParked(gate: RpcGate, body: unknown, status = 200) {
  const batch = gate.parked.splice(0, gate.parked.length);
  await Promise.all(
    batch.map((route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    ),
  );
}

describeSave("TASK-001 儲存可靠性隔離驗證", () => {
  test("D1 公布：請求未確認時不得顯示成功", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const title = `ISO-SAVE-D1-${Date.now()}`;
    const caseId = await createDraftViaRpc(page, title);
    const rest = restClient(page.request, await accessToken(page));
    const before = await readCaseState(rest, caseId);
    expect(before?.status).toBe("draft");

    const assignGate = newGate();
    await parkRpc(page, "pm_update_case_assignments", assignGate);

    await page.getByTestId("case-detail-publish").click();
    await expect.poll(() => assignGate.parked.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await expect(page.getByText("案件已公布")).toHaveCount(0);
    await expect(page.getByTestId("case-save-status")).toHaveAttribute("data-save-phase", "saving");

    const mid = await readCaseState(rest, caseId);
    expect(mid?.status).toBe("draft");

    await fulfillParked(assignGate, { ok: true, revision: (before?.revision ?? 0) + 1 });
    await expect(page.getByText("案件已公布").first()).toBeVisible({ timeout: 10_000 });

    await session.close();
  });

  test("D2 連改標題：後一筆使用前一筆已確認的 revision", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const stamp = Date.now();
    const caseId = await createDraftViaRpc(page, `ISO-SAVE-D2-${stamp}`);
    const rest = restClient(page.request, await accessToken(page));
    const before = await readCaseState(rest, caseId);
    expect(before).toBeTruthy();

    const generalGate = newGate();
    await parkRpc(page, "apply_case_update", generalGate);

    const titleInput = page.getByTestId("case-title-input");
    await titleInput.fill(`ISO-SAVE-D2-${stamp}-A`);
    await titleInput.blur();
    await titleInput.fill(`ISO-SAVE-D2-${stamp}-B`);
    await titleInput.blur();

    await expect.poll(() => generalGate.parked.length, { timeout: 15_000 }).toBe(1);
    const firstRevs = expectedRevisions(generalGate);
    expect(firstRevs[0]).toBe(before!.revision);

    const nextRev = (before!.revision ?? 0) + 1;
    await fulfillParked(generalGate, { ok: true, revision: nextRev });
    await expect.poll(() => generalGate.parked.length, { timeout: 15_000 }).toBe(1);
    const secondRevs = expectedRevisions(generalGate);
    expect(secondRevs[0]).toBe(nextRev);

    await fulfillParked(generalGate, { ok: true, revision: nextRev + 1 });
    await session.close();
  });

  test("Q01 清單／直連／離開返回／重整仍能開完整案件", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const title = `ISO-Q01-${Date.now()}`;
    const caseId = await createDraftViaRpc(page, title);
    await expect(page.getByTestId("case-title-input")).toHaveValue(title);

    await page.goto("/cases");
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible({ timeout: 60_000 });
    await page.goto(`/cases/${caseId}`);
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("case-title-input")).toHaveValue(title);

    await page.goto("/cases");
    await page.goto(`/cases/${caseId}`);
    await expect(page.getByTestId("case-title-input")).toHaveValue(title);
    await page.reload();
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("case-title-input")).toHaveValue(title);
    await session.close();
  });

  test("Q21 來源完整讀取失敗：分類提示且不建新案", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const title = `ISO-Q21-${Date.now()}`;
    const caseId = await createDraftViaRpc(page, title);
    let createCalls = 0;
    page.on("request", (req) => {
      if (req.url().includes("/rpc/admin_create_case") && req.method() === "POST") createCalls += 1;
    });

    await page.route("**/rest/v1/cases_visible*", async (route) => {
      const req = route.request();
      if (req.method() === "GET" && req.url().includes(`id=eq.${caseId}`) && req.url().includes("select=*")) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "iso q21 source read fail" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "複製本頁" }).click();
    await expect(page.getByText("來源案件完整資料讀取失敗，已取消複製。請重試後再複製。")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(new RegExp(`/cases/${caseId}`));
    expect(createCalls, "來源失敗不得呼叫建案").toBe(0);
    await session.close();
  });
});
