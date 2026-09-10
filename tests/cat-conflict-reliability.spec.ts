import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor } from "./helpers/save-reliability-iso";

/**
 * Q18：兩名合成帳號都必須能寫同一句。第二人成功後資料應為第二人譯文。
 * 無權限 → 失敗（無法判定覆寫風險），不得標通過。
 * 誤覆寫決策見 src/lib/cat-segment-conflict-retry.ts；本檔不把 RPC 盲着重送當產品通過。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeQ18 = ENABLED ? test.describe : test.describe.skip;

function cred(role: "pm" | "t1" | "t2") {
  const map = {
    pm: [process.env.PLAYWRIGHT_ISO_PM_EMAIL, process.env.PLAYWRIGHT_ISO_PM_PASSWORD],
    t1: [process.env.PLAYWRIGHT_ISO_T1_EMAIL, process.env.PLAYWRIGHT_ISO_T1_PASSWORD],
    t2: [process.env.PLAYWRIGHT_ISO_T2_EMAIL, process.env.PLAYWRIGHT_ISO_T2_PASSWORD],
  } as const;
  const [email, password] = map[role];
  expect(email, `缺少 ${role} email`).toBeTruthy();
  expect(password, `缺少 ${role} password`).toBeTruthy();
  return { email: email!, password: password! };
}

function catFrame(page: Page) {
  return page.frameLocator(
    'iframe[title="CAT 團隊線上版"], iframe[title="CAT 個人離線版"], iframe[src*="/cat/"]',
  );
}

async function seedOneSegment(page: Page): Promise<string> {
  const frame = catFrame(page);
  await page.goto("/cat");
  await expect(frame.locator("#statTBs")).toBeVisible({ timeout: 90_000 });
  const stamp = Date.now();
  return frame.locator("body").evaluate(async (_el, { name, src, tgt }) => {
    const DB = new Function(
      'try { return typeof DBService !== "undefined" ? DBService : null; } catch { return null; }',
    )() as {
      createProject: (n: string, s: string[], t: string[]) => Promise<string>;
      createFile: (
        projectId: string,
        fileName: string,
        buf: ArrayBuffer,
        src: string,
        tgt: string,
        osrc: string,
        otgt: string,
      ) => Promise<string>;
      addSegments: (rows: Record<string, unknown>[]) => Promise<number>;
    } | null;
    if (!DB) throw new Error("DBService missing");
    const projectId = await DB.createProject(name, ["en-US"], ["zh-TW"]);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file original="iso-q18.txt" source-language="en-US" target-language="zh-TW" datatype="plaintext"><body><trans-unit id="1"><source>${src}</source><target>${tgt}</target></trans-unit></body></file></xliff>`;
    const bytes = new TextEncoder().encode(xml);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const fileId = await DB.createFile(projectId, "iso-q18.xliff", buf, "en-US", "zh-TW", "en-US", "zh-TW");
    await DB.addSegments([{
      fileId,
      sheetName: "Sheet1",
      rowIdx: 0,
      sourceText: src,
      targetText: tgt,
      xliffTuId: "1",
      globalId: 1,
      status: "",
    }]);
    return fileId;
  }, { name: `ISO-Q18-${stamp}`, src: `ISO-Q18-SRC-${stamp}`, tgt: `ISO-Q18-SEED-${stamp}` });
}

describeQ18("Q18 CAT 雙人衝突", () => {
  test("兩人皆有寫入權時，後寫入且帶正確 revision 的譯文應留下", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const fileId = await seedOneSegment(pm.page);
    const { rest: pmRest } = await restFor(pm.page);
    const segs = await pmRest.get<Array<{ id: string; segment_revision: number }>>(
      `cat_segments?select=id,segment_revision&file_id=eq.${fileId}&limit=5`,
    );
    expect(segs.length, "種子句段未進隔離庫").toBeGreaterThanOrEqual(1);
    const segmentId = segs[0].id;

    const t1 = await loginAs(browser, cred("t1").email, cred("t1").password);
    const t2 = await loginAs(browser, cred("t2").email, cred("t2").password);
    const { rest: t1Rest } = await restFor(t1.page);
    const { rest: t2Rest } = await restFor(t2.page);

    const firstText = `ISO-Q18-A-${Date.now()}`;
    const t1First = await t1Rest.rpc("apply_cat_segment_target_update", {
      p_segment_id: segmentId,
      p_new_target_text: firstText,
      p_expected_segment_revision: segs[0].segment_revision ?? 0,
    });
    expect(t1First.ok, `無法判定覆寫：T1 不能寫入 ${t1First.status} ${t1First.text}`).toBe(true);

    const afterT1 = await pmRest.get<Array<{ target_text: string; segment_revision: number }>>(
      `cat_segments?select=target_text,segment_revision&id=eq.${segmentId}`,
    );
    const secondText = `ISO-Q18-B-${Date.now()}`;
    const t2Write = await t2Rest.rpc("apply_cat_segment_target_update", {
      p_segment_id: segmentId,
      p_new_target_text: secondText,
      p_expected_segment_revision: afterT1[0]?.segment_revision ?? 0,
    });
    expect(t2Write.ok, `無法判定覆寫：T2 不能寫入 ${t2Write.status} ${t2Write.text}`).toBe(true);

    const afterT2 = await pmRest.get<Array<{ target_text: string }>>(
      `cat_segments?select=target_text&id=eq.${segmentId}`,
    );
    expect(afterT2[0]?.target_text).toBe(secondText);

    await t1.close();
    await t2.close();
    await pm.close();
  });
});
