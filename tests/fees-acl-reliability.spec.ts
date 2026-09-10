import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor, restMutate } from "./helpers/save-reliability-iso";

/**
 * Q13：真正 authenticated PM 更新合成費用；member 負向不得改他人列。
 * UPDATE 本身不加 select；讀回用另一次 GET fees_visible。
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
  test("PM 可 UPDATE 原表且獨立讀回確認；T1 改同一列被拒或零列", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const { token: pmToken } = await restFor(pm.page);
    const stamp = Date.now();
    const title = `ISO-Q13-FEE-${stamp}`;
    const insert = await restMutate(pm.page.request, pmToken, "POST", "fees", {
      title,
      status: "draft",
      env: "test",
      assignee: "ISO-Q13-ASSIGNEE",
      client_info: { currency: "TWD", unitPrice: 1, client: "ISO" },
      task_items: [],
    }, { Prefer: "return=representation" });
    expect(insert.ok, `PM INSERT fees ${insert.status}: ${insert.text}`).toBe(true);
    const feeId = (JSON.parse(insert.text) as { id: string }[])[0]?.id;
    expect(feeId).toBeTruthy();

    const newTitle = `${title}-UPDATED`;
    const update = await restMutate(
      pm.page.request,
      pmToken,
      "PATCH",
      `fees?id=eq.${feeId}`,
      { title: newTitle },
      { Prefer: "return=minimal" },
    );
    expect(update.ok, `PM UPDATE ${update.status}: ${update.text}`).toBe(true);
    expect(update.status, "UPDATE 不得為了計列數而變成 select 失敗").toBeLessThan(400);
    expect(update.text === "" || update.text === "[]").toBe(true);

    const visible = await restMutate(
      pm.page.request,
      pmToken,
      "GET",
      `fees_visible?select=id,title,client_info&id=eq.${feeId}`,
    );
    expect(visible.ok, visible.text).toBe(true);
    const pmRow = (JSON.parse(visible.text) as Array<{ id: string; title: string; client_info: unknown }>)[0];
    expect(pmRow?.title).toBe(newTitle);
    expect(pmRow?.client_info).toBeTruthy();

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
    expect((JSON.parse(after.text) as Array<{ title: string }>)[0]?.title).toBe(newTitle);

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
