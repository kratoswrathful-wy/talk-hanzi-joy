import { test, expect, type Page } from "@playwright/test";
import { expectSignedInAs, loginAs } from "./helpers/login-as";

/**
 * 身分載入：session 成功後分開 roles／profile。
 * 只在隔離 Supabase：PLAYWRIGHT_AUTH_IDENTITY_UI=1
 */
const ENABLED = process.env.PLAYWRIGHT_AUTH_IDENTITY_UI === "1";
const describeIdentity = ENABLED ? test.describe : test.describe.skip;

function cred(role: "pm" | "exec" | "t1"): { email: string; password: string } {
  const map = {
    pm: [process.env.PLAYWRIGHT_ISO_PM_EMAIL, process.env.PLAYWRIGHT_ISO_PM_PASSWORD],
    exec: [process.env.PLAYWRIGHT_ISO_EXEC_EMAIL, process.env.PLAYWRIGHT_ISO_EXEC_PASSWORD],
    t1: [process.env.PLAYWRIGHT_ISO_T1_EMAIL, process.env.PLAYWRIGHT_ISO_T1_PASSWORD],
  } as const;
  const [email, password] = map[role];
  expect(email, `缺少 ${role} email`).toBeTruthy();
  expect(password, `缺少 ${role} password`).toBeTruthy();
  return { email: email!, password: password! };
}

function restFail(page: Page, table: "user_roles" | "profiles", mode: "http" | "lost" | "empty") {
  const needle = `/rest/v1/${table}`;
  return page.route(`**${needle}*`, async (route) => {
    if (mode === "lost") {
      await route.abort("failed");
      return;
    }
    if (mode === "empty") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
        headers: { "content-range": "*/0" },
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: `${table}_injected_fail` }),
    });
  });
}

describeIdentity("auth identity load (isolated)", () => {
  test("T1 正常登入：PM 角色與個人資料正確，可見新增案件", async ({ browser }) => {
    const { email, password } = cred("pm");
    const session = await loginAs(browser, email, password);
    await expectSignedInAs(session.page, email);
    await expect(session.page.getByTestId("auth-identity-error")).toHaveCount(0);
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toBeVisible();
    await expect(session.page.getByTestId("create-case-button").first()).toBeVisible();
    await session.close();
  });

  test("T2 member 權限不因修補擴大：譯者登入看得到案件、沒有新增案件", async ({ browser }) => {
    const { email, password } = cred("t1");
    const session = await loginAs(browser, email, password);
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toBeVisible();
    await expect(session.page.getByTestId("create-case-button")).toHaveCount(0);
    await session.close();
  });

  test("T3 roles HTTP 失敗：角色畫面、案件不出現；解除後重試可進入", async ({ browser }) => {
    const { email, password } = cred("pm");
    const session = await loginAs(browser, email, password);
    await restFail(session.page, "user_roles", "http");
    await session.page.reload();
    const err = session.page.getByTestId("auth-identity-error");
    await expect(err).toBeVisible();
    await expect(err).toHaveAttribute("data-identity-source", "roles");
    await expect(session.page.getByText("角色資料載入失敗").first()).toBeVisible();
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toHaveCount(0);
    await expect(session.page.getByTestId("create-case-button")).toHaveCount(0);

    await session.page.unroute(`**/rest/v1/user_roles*`);
    await session.page.getByTestId("auth-identity-retry-button").click();
    await expect(err).toHaveCount(0);
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toBeVisible();
    await expect(session.page.getByTestId("create-case-button").first()).toBeVisible();
    await session.close();
  });

  test("T4 profile 失敗與 roles 失敗分開；合法空 roles 不是失敗", async ({ browser }) => {
    const { email, password } = cred("exec");
    const session = await loginAs(browser, email, password);

    await restFail(session.page, "profiles", "http");
    await session.page.reload();
    const err = session.page.getByTestId("auth-identity-error");
    await expect(err).toBeVisible();
    await expect(err).toHaveAttribute("data-identity-source", "profile");
    await expect(session.page.getByText("個人資料載入失敗").first()).toBeVisible();
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toHaveCount(0);
    await session.page.unroute(`**/rest/v1/profiles*`);
    await session.page.getByTestId("auth-identity-retry-button").click();
    await expect(err).toHaveCount(0);
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toBeVisible();

    await restFail(session.page, "user_roles", "empty");
    await session.page.reload();
    await expect(session.page.getByTestId("auth-identity-error")).toHaveCount(0);
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toBeVisible();
    await expect(session.page.getByTestId("create-case-button")).toHaveCount(0);
    await session.close();
  });

  test("T5 持續失敗：提示保留、權限不開、重試有界", async ({ browser }) => {
    const { email, password } = cred("pm");
    const session = await loginAs(browser, email, password);
    let rolesHits = 0;
    await session.page.route("**/rest/v1/user_roles*", async (route) => {
      rolesHits += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "roles_injected_fail" }),
      });
    });
    await session.page.reload();
    await expect(session.page.getByTestId("auth-identity-error")).toBeVisible();
    const afterReload = rolesHits;
    const btn = session.page.getByTestId("auth-identity-retry-button");
    for (let i = 0; i < 8; i += 1) {
      if (await btn.isDisabled()) break;
      await btn.click();
      await expect(session.page.getByTestId("auth-identity-error")).toBeVisible();
    }
    await expect(btn).toBeDisabled();
    await expect(session.page.getByText("已達重試上限").first()).toBeVisible();
    await expect(session.page.getByTestId("auth-identity-relogin-button")).toBeVisible();
    await expect(session.page.getByText("請按「登出」後再登入").first()).toBeVisible();
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toHaveCount(0);
    expect(rolesHits).toBeLessThanOrEqual(afterReload + 5);
    await session.close();
  });

  test("T6 回應遺失與 HTTP 失敗不混稱合法空結果", async ({ browser }) => {
    const { email, password } = cred("pm");
    const session = await loginAs(browser, email, password);
    await restFail(session.page, "user_roles", "lost");
    await session.page.reload();
    await expect(session.page.getByTestId("auth-identity-error")).toBeVisible();
    await expect(session.page.getByTestId("auth-identity-error")).toHaveAttribute(
      "data-identity-source",
      "roles",
    );
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toHaveCount(0);
    await session.close();
  });
});
