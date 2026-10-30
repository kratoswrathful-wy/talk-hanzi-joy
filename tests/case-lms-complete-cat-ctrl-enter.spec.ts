import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { task002AccessToken, task002Rest } from "./helpers/task002-iso-api";

/**
 * TASK-002 2156：LMS 勾任務完成 → CAT 有效改字必須回退。
 * 走真頁面，不直寫終態。
 */
const ENABLED = process.env.PLAYWRIGHT_TASK002_LMS === "1";
const describeLms = ENABLED ? test.describe : test.describe.skip;

const CASE_ID = "f1ddf362-622b-46ea-886b-426c5ceb5533";
const FILE_ID = "c9272140-301c-4d15-bd16-a530c9125167";
const PROJECT_ID = "8c39e56e-a127-4b11-89dd-80594936d91d";
const T1_ROW_ID = "cr-1792931919430-0";
const T2_ROW_ID = "cr-1792931919430-1";
const T1_ASSIGN_ID = "6413b7af-a3ed-430b-8a7b-c215cd26c728";
const T2_ASSIGN_ID = "9689f8c3-1b0f-4b1b-9532-0cd6839e661b";
const LINE1 = "Done C source line 1";
const LINE3 = "Done C source line 3";

function credT1(): { email: string; password: string } {
  const email = process.env.PLAYWRIGHT_ISO_T1_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_T1_PASSWORD;
  expect(email, "缺少 PLAYWRIGHT_ISO_T1_EMAIL").toBeTruthy();
  expect(password, "缺少 PLAYWRIGHT_ISO_T1_PASSWORD").toBeTruthy();
  return { email: email!, password: password! };
}

function catFrame(page: Page): FrameLocator {
  return page.frameLocator(
    'iframe[title="CAT 團隊線上版"], iframe[title="CAT 個人離線版"], iframe[src*="/cat/"]',
  );
}

async function dismissWfSessionIfNeeded(frame: FrameLocator) {
  const confirm = frame.locator("#btnWfSessionConfirm");
  if (await confirm.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await frame.locator('input[name="wfSessionChoice"][value="translate"]').check();
    await confirm.click();
  }
}

type CaseRead = {
  status: string;
  revision: number;
  rows: Array<{ id: string; taskCompleted?: boolean; reviewTaskCompleted?: boolean; delivered?: boolean }>;
};

async function readCase(rest: ReturnType<typeof task002Rest>, caseId: string): Promise<CaseRead> {
  const rows = await rest.get<Array<{ status: string; revision: number; collab_rows?: CaseRead["rows"] }>>(
    `cases_visible?select=status,revision,collab_rows&id=eq.${caseId}`,
  );
  expect(rows[0], "讀不到案件").toBeTruthy();
  return {
    status: rows[0].status,
    revision: rows[0].revision,
    rows: Array.isArray(rows[0].collab_rows) ? rows[0].collab_rows : [],
  };
}

async function readAssignment(
  rest: ReturnType<typeof task002Rest>,
  assignmentId: string,
): Promise<string> {
  const rows = await rest.get<Array<{ workflow_status: string }>>(
    `cat_stage_assignments?select=workflow_status&id=eq.${assignmentId}`,
  );
  return rows[0]?.workflow_status ?? "missing";
}

function rowById(state: CaseRead, id: string) {
  return state.rows.find((row) => row.id === id);
}

async function line1Target(frame: FrameLocator) {
  return frame
    .locator(".grid-data-row")
    .filter({ hasText: LINE1 })
    .locator(".col-target .grid-textarea");
}

async function editLine1(page: Page, frame: FrameLocator, marker: string, mode: "ctrl-enter" | "tab") {
  const cell = await line1Target(frame);
  await expect(cell).toBeVisible({ timeout: 60_000 });
  await cell.click();
  await cell.press("End");
  await cell.type(marker);
  if (mode === "tab") await cell.press("Tab");
  else await page.keyboard.press("Control+Enter");
}

async function lineTarget(frame: FrameLocator, source: string) {
  return frame
    .locator(".grid-data-row")
    .filter({ hasText: source })
    .locator(".col-target .grid-textarea");
}

async function waitTransConfirmed(
  rest: ReturnType<typeof task002Rest>,
  globalId: number,
) {
  await expect.poll(async () => {
    const rows = await rest.get<Array<{ wf_trans_confirmed_at: string | null }>>(
      `cat_segments?select=wf_trans_confirmed_at&file_id=eq.${FILE_ID}&global_id=eq.${globalId}`,
    );
    return rows[0]?.wf_trans_confirmed_at ? "yes" : "no";
  }, { timeout: 30_000 }).toBe("yes");
}

async function confirmLine(page: Page, frame: FrameLocator, source: string) {
  const cell = await lineTarget(frame, source);
  await expect(cell).toBeVisible({ timeout: 60_000 });
  await cell.click();
  await page.keyboard.press("Control+Enter");
}

async function tickLmsComplete(page: Page, rowId = T1_ROW_ID) {
  await page.goto(`/cases/${CASE_ID}`);
  const box = page.locator(`[data-collab-id="${rowId}"][data-collab-field="taskCompleted"]`);
  await expect(box).toBeVisible({ timeout: 60_000 });
  const checkbox = box.locator("button, [role='checkbox']").first();
  await expect(checkbox).toBeEnabled({ timeout: 20_000 });
  if ((await checkbox.getAttribute("data-state")) !== "checked") {
    await checkbox.click();
  }
  await expect(page.getByText("尚有未確認句段")).toHaveCount(0);
  await expect(checkbox).toHaveAttribute("data-state", "checked", { timeout: 20_000 });
}

async function ensureControlRowComplete(browser: import("@playwright/test").Browser, rest: ReturnType<typeof task002Rest>) {
  if (rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted) return;
  const email = process.env.PLAYWRIGHT_ISO_T2_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_T2_PASSWORD;
  expect(email, "缺少 PLAYWRIGHT_ISO_T2_EMAIL").toBeTruthy();
  expect(password, "缺少 PLAYWRIGHT_ISO_T2_PASSWORD").toBeTruthy();
  const control = await loginAs(browser, email!, password!);
  const frame = await openCat(control.page);
  await confirmLine(control.page, frame, LINE3);
  await waitTransConfirmed(rest, 3);
  await tickLmsComplete(control.page, T2_ROW_ID);
  await expect.poll(async () => {
    const lms = rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted === true;
    const cat = await readAssignment(rest, T2_ASSIGN_ID);
    return lms ? `ok:${cat}` : `lms-open:${cat}`;
  }, { timeout: 30_000 }).toMatch(/^ok:/);
  await control.close();
}

async function openCat(page: Page): Promise<FrameLocator> {
  await page.goto(`/cat/team/files/${FILE_ID}?p=${PROJECT_ID}`);
  const frame = catFrame(page);
  await dismissWfSessionIfNeeded(frame);
  await expect(frame.getByText(LINE1)).toBeVisible({ timeout: 90_000 });
  return frame;
}

describeLms("TASK-002 LMS 完成後 CAT 改字回退", () => {
  test("LMS 勾完成後 Ctrl+Enter 改字兩輪，對照列不動", async ({ browser }) => {
    test.setTimeout(240_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    const reopenHits: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("reopen_own_cat_complete_on_edit")) {
        reopenHits.push(new Date().toISOString());
      }
    });

    await ensureControlRowComplete(browser, rest);
    const start = await readCase(rest, CASE_ID);
    expect(rowById(start, T2_ROW_ID)?.taskCompleted, "譯者二對照列應先完成").toBe(true);
    if (rowById(start, T1_ROW_ID)?.taskCompleted) {
      const frame = await openCat(page);
      await editLine1(page, frame, `PRE-${Date.now().toString().slice(-4)}`, "ctrl-enter");
      await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
        timeout: 30_000,
      }).toBe(true);
    } else {
      const frame = await openCat(page);
      await confirmLine(page, frame, LINE1);
      await waitTransConfirmed(rest, 1);
    }

    await tickLmsComplete(page);
    await expect.poll(async () => {
      const lms = rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true;
      const cat = await readAssignment(rest, T1_ASSIGN_ID);
      return lms && cat === "completed" ? "ready" : `lms=${lms};cat=${cat}`;
    }, { timeout: 30_000 }).toBe("ready");
    const afterComplete1 = await readCase(rest, CASE_ID);
    expect(rowById(afterComplete1, T2_ROW_ID)?.taskCompleted).toBe(true);
    const hits0 = reopenHits.length;

    const frame1 = await openCat(page);
    const cell = await line1Target(frame1);
    await cell.click();
    await page.keyboard.press("Control+Enter");
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true, {
      timeout: 12_000,
    }).toBe(true);
    expect(reopenHits.length, "只確認未改字不得回退").toBe(hits0);

    const mark1 = `L1-${Date.now().toString().slice(-6)}`;
    await editLine1(page, frame1, mark1, "ctrl-enter");
    await expect.poll(async () => {
      const lms = rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false;
      const cat = await readAssignment(rest, T1_ASSIGN_ID);
      return lms && cat === "in_progress" ? "open" : `lms=${lms};cat=${cat}`;
    }, { timeout: 30_000 }).toBe("open");
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    expect(reopenHits.length, "第一輪改字應送回退").toBeGreaterThan(hits0);
    const hits1 = reopenHits.length;
    await waitTransConfirmed(rest, 1);

    await tickLmsComplete(page);
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true, {
      timeout: 30_000,
    }).toBe(true);
    const hitsAfterLms2 = reopenHits.length;

    const frame2 = await openCat(page);
    const mark2 = `L2-${Date.now().toString().slice(-6)}`;
    await editLine1(page, frame2, mark2, "ctrl-enter");
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    expect(reopenHits.length, "第二輪改字必須再送回退").toBeGreaterThan(hitsAfterLms2);
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    expect(hits1).toBeGreaterThan(hits0);
    await session.close();
  });

  test("已開 CAT 時 LMS 再勾完成，下一輪 Ctrl+Enter 仍回退", async ({ browser }) => {
    test.setTimeout(180_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const catPage = session.page;
    const rest = task002Rest(catPage.request, await task002AccessToken(catPage));
    if (rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted) {
      const opened = await openCat(catPage);
      await editLine1(catPage, opened, `OPEN-${Date.now().toString().slice(-4)}`, "ctrl-enter");
      await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
        timeout: 30_000,
      }).toBe(true);
    }
    const frame = await openCat(catPage);
    await confirmLine(catPage, frame, LINE1);
    await waitTransConfirmed(rest, 1);
    const lmsPage = await catPage.context().newPage();
    await lmsPage.goto(`/cases/${CASE_ID}`);
    const box = lmsPage.locator(`[data-collab-id="${T1_ROW_ID}"][data-collab-field="taskCompleted"]`);
    await expect(box).toBeVisible({ timeout: 60_000 });
    const checkbox = box.locator("button, [role='checkbox']").first();
    if ((await checkbox.getAttribute("data-state")) !== "checked") await checkbox.click();
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true, {
      timeout: 30_000,
    }).toBe(true);
    await expect(frame.getByText(LINE1)).toBeVisible({ timeout: 30_000 });
    await editLine1(catPage, frame, `LIVE-${Date.now().toString().slice(-6)}`, "ctrl-enter");
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    await lmsPage.close();
    await session.close();
  });

  test("LMS 勾完成後 Tab 保存也回退", async ({ browser }) => {
    test.setTimeout(180_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    if (!rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted) {
      const prep = await openCat(page);
      await confirmLine(page, prep, LINE1);
      await waitTransConfirmed(rest, 1);
      await tickLmsComplete(page);
      await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true, {
        timeout: 30_000,
      }).toBe(true);
    }
    const frame = await openCat(page);
    await editLine1(page, frame, `TAB-${Date.now().toString().slice(-6)}`, "tab");
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    await session.close();
  });

  test("CAT 任務完成後 Ctrl+Enter 改字回退", async ({ browser }) => {
    test.setTimeout(180_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    const frame = await openCat(page);
    if (!rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted) {
      await confirmLine(page, frame, LINE1);
      await waitTransConfirmed(rest, 1);
      const main = frame.locator("#btnWfTaskCompleteMain");
      await expect(main).toBeEnabled({ timeout: 20_000 });
      await main.click();
      await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true, {
        timeout: 30_000,
      }).toBe(true);
    }
    await editLine1(page, frame, `CAT-${Date.now().toString().slice(-6)}`, "ctrl-enter");
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    await session.close();
  });
});
