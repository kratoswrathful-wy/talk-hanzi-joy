import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor, restMutate } from "./helpers/save-reliability-iso";

/**
 * Q13：P0-C 已 revoke fees SELECT。authenticated 可 INSERT（return=minimal），
 * 不可 PATCH 原表（42501，不得因此 GRANT SELECT）。讀回走 fees_visible。
 * T1 改同一列必須被拒。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeQ13 = ENABLED ? test.describe : test.describe.skip;

function cred(role: "pm" | "t1") {
  const email = role === "pm" ? process.env.PLAYWRIGHT_ISO_PM_EMAIL : process.env.PLAYWRIGHT_ISO_T1_EMAIL;
  const password = role === "pm" ? process.env.PLAYWRIGHT_ISO_PM_PASSWORD : process.env.PLAYWRIGHT_ISO_T1_PASSWORD;
  expect(email, `缺少 ${role} email`).toBeTruthy();
  expect(password, `缺少 ${role} password`).toBeTruthy();
  return { email: email!, password: password! };
}

describeQ13("Q13 費用角色寫入", () => {
  test("PM 可建檔並讀 view；原表 PATCH 被 P0-C 拒絕；T1 不得改同一列", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const { token: pmToken } = await restFor(pm.page);
    const stamp = Date.now();
    const title = `ISO-Q13-FEE-${stamp}`;
    const feeId = crypto.randomUUID();
    const insert = await restMutate(pm.page.request, pmToken, "POST", "fees", {
      id: feeId,
      title,
      status: "draft",
      env: "test",
      assignee: "ISO-Q13-ASSIGNEE",
      client_info: { currency: "TWD", unitPrice: 1, client: "ISO" },
      task_items: [],
    }, { Prefer: "return=minimal" });
    expect(insert.ok, `PM INSERT fees ${insert.status}: ${insert.text}`).toBe(true);

    const visible = await restMutate(
      pm.page.request,
      pmToken,
      "GET",
      `fees_visible?select=id,title,client_info&id=eq.${feeId}`,
    );
    expect(visible.ok, visible.text).toBe(true);
    const pmRow = (JSON.parse(visible.text) as Array<{ id: string; title: string; client_info: unknown }>)[0];
    expect(pmRow?.title).toBe(title);
    expect(pmRow?.client_info).toBeTruthy();

    const newTitle = `${title}-UPDATED`;
    const update = await restMutate(
      pm.page.request,
      pmToken,
      "PATCH",
      `fees?id=eq.${feeId}`,
      { title: newTitle },
      { Prefer: "return=minimal" },
    );
    expect(update.ok, `P0-C 下 PM PATCH fees 應被拒，不得 GRANT SELECT：${update.status} ${update.text}`).toBe(false);
    expect(update.status).toBeGreaterThanOrEqual(400);
    expect(update.text).toMatch(/permission denied for table fees|42501/);

    const t1 = await loginAs(browser, cred("t1").email, cred("t1").password);
    const { token: t1Token } = await restFor(t1.page);
    const t1Patch = await restMutate(
      t1.page.request,
      t1Token,
      "PATCH",
      `fees?id=eq.${feeId}`,
      { title: `${title}-T1-SHOULD-FAIL` },
      { Prefer: "return=minimal" },
    );
    const denied = t1Patch.status >= 400 || /0$/.test(t1Patch.contentRange ?? "");
    expect(denied, `T1 PATCH status=${t1Patch.status} range=${t1Patch.contentRange} body=${t1Patch.text}`).toBe(true);

    const after = await restMutate(
      pm.page.request,
      pmToken,
      "GET",
      `fees_visible?select=id,title&id=eq.${feeId}`,
    );
    expect((JSON.parse(after.text) as Array<{ title: string }>)[0]?.title).toBe(title);

    const t1Read = await restMutate(
      t1.page.request,
      t1Token,
      "GET",
      `fees_visible?select=id,title,client_info&id=eq.${feeId}`,
    );
    if (t1Read.ok) {
      const t1Rows = JSON.parse(t1Read.text) as Array<{ client_info: unknown }>;
      if (t1Rows[0]) {
        expect(t1Rows[0].client_info, "T1 不得因本測取得營收內容").toBeNull();
      }
    }

    await t1.close();
    await pm.close();
  });
});
