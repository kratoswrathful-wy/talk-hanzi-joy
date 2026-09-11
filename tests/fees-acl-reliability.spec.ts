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

  test("PM 經 apply_fee_update 改標題與費用 PO；任務列／客戶不被清空", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const { token, rest } = await restFor(pm.page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const insert = await restMutate(pm.page.request, token, "POST", "fees", {
      id: feeId,
      title: `ISO-FEE-RPC-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FEE-ASSIGNEE",
      client_info: {
        client: "ISO-CLIENT",
        clientPoNumber: "PO-OLD",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 3 }],
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 2 }],
    }, { Prefer: "return=minimal" });
    expect(insert.ok, insert.text).toBe(true);

    const before = await rest.get<Array<{ updated_at: string; client_info: Record<string, unknown> }>>(
      `fees_visible?select=id,updated_at,client_info&id=eq.${feeId}`,
    );
    expect(before[0]?.updated_at).toBeTruthy();

    const updated = await rest.rpc<{ ok?: boolean; error?: string; updated_at?: string }>("apply_fee_update", {
      p_fee_id: feeId,
      p_expected_updated_at: before[0].updated_at,
      p_patch: {
        title: `ISO-FEE-RPC-${stamp}-NEW`,
        client_info: { clientPoNumber: "PO-NEW" },
      },
    });
    expect(updated.ok, updated.text).toBe(true);
    expect(updated.data?.ok, updated.text).toBe(true);

    const after = await rest.get<Array<{ title: string; client_info: Record<string, unknown> }>>(
      `fees_visible?select=id,title,client_info&id=eq.${feeId}`,
    );
    expect(after[0]?.title).toBe(`ISO-FEE-RPC-${stamp}-NEW`);
    expect(after[0]?.client_info?.clientPoNumber).toBe("PO-NEW");
    expect(after[0]?.client_info?.client).toBe("ISO-CLIENT");
    expect(Array.isArray(after[0]?.client_info?.clientTaskItems)).toBe(true);
    expect((after[0]?.client_info?.clientTaskItems as unknown[]).length).toBe(1);

    const unknown = await rest.rpc<{ ok?: boolean; error?: string }>("apply_fee_update", {
      p_fee_id: feeId,
      p_expected_updated_at: updated.data?.updated_at,
      p_patch: { mystery: 1 },
    });
    expect(unknown.data?.ok, unknown.text).toBe(false);
    expect(unknown.data?.error, unknown.text).toBe("unknown_patch_key");

    await pm.close();
  });

  test("T1 不得走 apply_fee_update；草稿刪除成功、已開立刪除被拒", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const { token: pmToken, rest: pmRest } = await restFor(pm.page);
    const stamp = Date.now();
    const draftId = crypto.randomUUID();
    const finalizedId = crypto.randomUUID();
    const draftInsert = await restMutate(pm.page.request, pmToken, "POST", "fees", {
      id: draftId,
      title: `ISO-FEE-DEL-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FEE-ASSIGNEE",
    }, { Prefer: "return=minimal" });
    expect(draftInsert.ok, draftInsert.text).toBe(true);
    const finalizedInsert = await restMutate(pm.page.request, pmToken, "POST", "fees", {
      id: finalizedId,
      title: `ISO-FEE-FIN-${stamp}`,
      status: "finalized",
      env: "test",
      assignee: "ISO-FEE-ASSIGNEE",
    }, { Prefer: "return=minimal" });
    expect(finalizedInsert.ok, finalizedInsert.text).toBe(true);

    const t1 = await loginAs(browser, cred("t1").email, cred("t1").password);
    const { rest: t1Rest } = await restFor(t1.page);
    const rows = await pmRest.get<Array<{ id: string; updated_at: string }>>(
      `fees_visible?select=id,updated_at&id=in.(${draftId},${finalizedId})`,
    );
    const draftAt = rows.find((r) => r.id === draftId)?.updated_at;
    const finalizedAt = rows.find((r) => r.id === finalizedId)?.updated_at;
    expect(draftAt && finalizedAt).toBeTruthy();

    const t1Write = await t1Rest.rpc<{ ok?: boolean; error?: string }>("apply_fee_update", {
      p_fee_id: draftId,
      p_expected_updated_at: draftAt,
      p_patch: { title: "T1-SHOULD-FAIL" },
    });
    expect(t1Write.data?.ok ?? false, t1Write.text).toBe(false);

    const delFinal = await pmRest.rpc<{ ok?: boolean; error?: string }>("apply_fee_delete", {
      p_fee_id: finalizedId,
      p_expected_updated_at: finalizedAt,
    });
    expect(delFinal.data?.ok, delFinal.text).toBe(false);
    expect(delFinal.data?.error, delFinal.text).toBe("fee_not_deletable");
    const stillThere = await pmRest.get<Array<{ id: string }>>(
      `fees_visible?select=id&id=eq.${finalizedId}`,
    );
    expect(stillThere[0]?.id).toBe(finalizedId);

    const delDraft = await pmRest.rpc<{ ok?: boolean; error?: string; deleted?: boolean }>("apply_fee_delete", {
      p_fee_id: draftId,
      p_expected_updated_at: draftAt,
    });
    expect(delDraft.data?.ok, delDraft.text).toBe(true);
    const gone = await restMutate(
      pm.page.request,
      pmToken,
      "GET",
      `fees_visible?select=id&id=eq.${draftId}`,
    );
    expect(JSON.parse(gone.text) as unknown[]).toEqual([]);

    await t1.close();
    await pm.close();
  });
});
