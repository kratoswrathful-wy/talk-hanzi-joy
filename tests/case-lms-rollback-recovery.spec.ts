import { expect, test, type FrameLocator, type Page, type Route } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { task002AccessToken, task002Rest } from "./helpers/task002-iso-api";

/**
 * TASK-002 2251：受控失敗恢復、已交件／只重開審稿回歸、回退請求次數。
 * 走真頁面與隔離後端；攔截只在測試程式，測完移除。
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
const T1_REVIEW_ASSIGN_ID = "acb9efb1-ff96-49ef-ab32-0684ce468602";
const LINE1 = "Done C source line 1";
const LINE3 = "Done C source line 3";

function credT1() {
  const email = process.env.PLAYWRIGHT_ISO_T1_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_T1_PASSWORD;
  expect(email, "缺少 PLAYWRIGHT_ISO_T1_EMAIL").toBeTruthy();
  expect(password, "缺少 PLAYWRIGHT_ISO_T1_PASSWORD").toBeTruthy();
  return { email: email!, password: password! };
}

function credPm() {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PLAYWRIGHT_ISO_PM_EMAIL").toBeTruthy();
  expect(password, "缺少 PLAYWRIGHT_ISO_PM_PASSWORD").toBeTruthy();
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

async function readAssignment(rest: ReturnType<typeof task002Rest>, assignmentId: string) {
  const rows = await rest.get<Array<{ workflow_status: string }>>(
    `cat_stage_assignments?select=workflow_status&id=eq.${assignmentId}`,
  );
  return rows[0]?.workflow_status ?? "missing";
}

async function readLine1Target(rest: ReturnType<typeof task002Rest>) {
  const rows = await rest.get<Array<{ target_text: string | null }>>(
    `cat_segments?select=target_text&file_id=eq.${FILE_ID}&global_id=eq.1`,
  );
  return rows[0]?.target_text ?? "";
}

function rowById(state: CaseRead, id: string) {
  return state.rows.find((row) => row.id === id);
}

async function lineTarget(frame: FrameLocator, source: string) {
  return frame.locator(".grid-data-row").filter({ hasText: source }).locator(".col-target .grid-textarea");
}

async function waitTransConfirmed(rest: ReturnType<typeof task002Rest>, globalId: number) {
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

async function editLine1(page: Page, frame: FrameLocator, marker: string) {
  const cell = await lineTarget(frame, LINE1);
  await expect(cell).toBeVisible({ timeout: 60_000 });
  await cell.click();
  await cell.press("End");
  await cell.type(marker);
  await page.keyboard.press("Control+Enter");
}

async function tickField(
  page: Page,
  rest: ReturnType<typeof task002Rest>,
  rowId: string,
  field: "taskCompleted" | "reviewTaskCompleted" | "delivered",
) {
  await page.goto(`/cases/${CASE_ID}`);
  const box = page.locator(`[data-collab-id="${rowId}"][data-collab-field="${field}"]`);
  await expect(box).toBeVisible({ timeout: 60_000 });
  const checkbox = box.locator("button, [role='checkbox']").first();
  await expect(checkbox).toBeEnabled({ timeout: 20_000 });
  if ((await checkbox.getAttribute("data-state")) !== "checked") {
    await checkbox.click();
  }
  await expect.poll(async () => rowById(await readCase(rest, CASE_ID), rowId)?.[field] === true, {
    timeout: 30_000,
  }).toBe(true);
}

async function openCat(page: Page): Promise<FrameLocator> {
  await page.goto(`/cat/team/files/${FILE_ID}?p=${PROJECT_ID}`);
  const frame = catFrame(page);
  await dismissWfSessionIfNeeded(frame);
  await expect(frame.getByText(LINE1)).toBeVisible({ timeout: 90_000 });
  return frame;
}

async function ensureT1ReadyToComplete(page: Page, rest: ReturnType<typeof task002Rest>) {
  if (rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted) {
    const frame = await openCat(page);
    await editLine1(page, frame, `PRE-${Date.now().toString().slice(-4)}`);
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
  } else {
    const frame = await openCat(page);
    await confirmLine(page, frame, LINE1);
    await waitTransConfirmed(rest, 1);
  }
}

async function failOnce(page: Page, pattern: string, when?: (route: Route) => boolean) {
  let left = 1;
  await page.route(pattern, async (route) => {
    if (left > 0 && (!when || when(route))) {
      left -= 1;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "task002_injected_fail", code: "P0001" }),
      });
      return;
    }
    await route.continue();
  });
}

describeLms("TASK-002 回退失敗恢復與定向回歸", () => {
  test("4.1 譯文保存失敗不丟字、不假成功，恢復後寫入", async ({ browser }) => {
    test.setTimeout(240_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    await ensureT1ReadyToComplete(page, rest);
    await tickField(page, rest, T1_ROW_ID, "taskCompleted");
    const beforeText = await readLine1Target(rest);
    await failOnce(page, "**/rest/v1/rpc/apply_cat_segment_target_update*");
    const frame = await openCat(page);
    const mark = `SV-${Date.now().toString().slice(-6)}`;
    await editLine1(page, frame, mark);
    await expect(frame.getByText(/確認失敗/)).toBeVisible({ timeout: 20_000 });
    const cell = await lineTarget(frame, LINE1);
    await expect(cell).toContainText(mark);
    expect(await readLine1Target(rest), "失敗時後端不得當成已寫入").toBe(beforeText);
    await page.unroute("**/rest/v1/rpc/apply_cat_segment_target_update*");
    await cell.click();
    await page.keyboard.press("Control+Enter");
    await expect.poll(async () => (await readLine1Target(rest)).includes(mark), { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => {
      const lms = rowById(await readCase(rest, CASE_ID), T1_ROW_ID);
      const cat = await readAssignment(rest, T1_ASSIGN_ID);
      return !lms?.taskCompleted && cat === "in_progress" ? "open" : `lms=${lms?.taskCompleted};cat=${cat}`;
    }, { timeout: 30_000 }).toBe("open");
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    await session.close();
  });

  test("4.2 回退失敗有提示且不改字再確認可恢復", async ({ browser }) => {
    test.setTimeout(240_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    await ensureT1ReadyToComplete(page, rest);
    await tickField(page, rest, T1_ROW_ID, "taskCompleted");
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true, {
      timeout: 30_000,
    }).toBe(true);
    await failOnce(page, "**/rest/v1/rpc/reopen_own_cat_complete_on_edit*");
    const frame = await openCat(page);
    const mark = `RB-${Date.now().toString().slice(-6)}`;
    await editLine1(page, frame, mark);
    await expect(frame.getByText("無法取消完成狀態")).toBeVisible({ timeout: 20_000 });
    expect((await readLine1Target(rest)).includes(mark), "譯文應已保存").toBe(true);
    expect(rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted, "回退失敗不得假裝已取消").toBe(true);
    await page.unroute("**/rest/v1/rpc/reopen_own_cat_complete_on_edit*");
    const cell = await lineTarget(frame, LINE1);
    await cell.click();
    await page.keyboard.press("Control+Enter");
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    expect((await readLine1Target(rest)).includes(mark)).toBe(true);
    await session.close();
  });

  test("4.3 LMS 完成後 CAT 同步失敗會取消勾選", async ({ browser }) => {
    test.setTimeout(240_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    await ensureT1ReadyToComplete(page, rest);
    await failOnce(page, "**/rest/v1/rpc/cat_update_stage_assignment_workflow_status*", (route) => {
      const raw = route.request().postData() || "";
      return raw.includes("completed");
    });
    await page.goto(`/cases/${CASE_ID}`);
    const box = page.locator(`[data-collab-id="${T1_ROW_ID}"][data-collab-field="taskCompleted"]`);
    await expect(box).toBeVisible({ timeout: 60_000 });
    const checkbox = box.locator("button, [role='checkbox']").first();
    await checkbox.click();
    await expect(page.getByText("無法同步翻譯畫面，任務完成已取消，請稍後再試", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.unroute("**/rest/v1/rpc/cat_update_stage_assignment_workflow_status*");
    await expect.poll(async () => {
      const lms = rowById(await readCase(rest, CASE_ID), T1_ROW_ID);
      const cat = await readAssignment(rest, T1_ASSIGN_ID);
      return !lms?.taskCompleted && cat !== "completed" ? "reverted" : `lms=${lms?.taskCompleted};cat=${cat}`;
    }, { timeout: 30_000 }).toBe("reverted");
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    await tickField(page, rest, T1_ROW_ID, "taskCompleted");
    await expect.poll(async () => {
      const lms = rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === true;
      const cat = await readAssignment(rest, T1_ASSIGN_ID);
      return lms && cat === "completed" ? "ready" : `lms=${lms};cat=${cat}`;
    }, { timeout: 30_000 }).toBe("ready");
    const frame = await openCat(page);
    await editLine1(page, frame, `SY-${Date.now().toString().slice(-6)}`);
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    await session.close();
  });

  test("第 6 節兩輪回退有送、續打不重送、沒改字不增加", async ({ browser }) => {
    test.setTimeout(240_000);
    const { email, password } = credT1();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    const counts = { save: 0, reopen: 0, complete: 0, catStatus: 0 };
    const steps: Array<Record<string, unknown>> = [];
    const snap = async (label: string) => {
      const state = await readCase(rest, CASE_ID);
      const row = rowById(state, T1_ROW_ID);
      steps.push({
        label,
        ...counts,
        revision: state.revision,
        t1: {
          taskCompleted: !!row?.taskCompleted,
          reviewTaskCompleted: !!row?.reviewTaskCompleted,
          delivered: !!row?.delivered,
        },
        t2TaskCompleted: !!rowById(state, T2_ROW_ID)?.taskCompleted,
        cat: await readAssignment(rest, T1_ASSIGN_ID),
      });
    };
    page.on("request", (req) => {
      if (req.method() !== "POST") return;
      const url = req.url();
      if (url.includes("apply_cat_segment_target_update")) counts.save += 1;
      if (url.includes("reopen_own_cat_complete_on_edit")) counts.reopen += 1;
      if (url.includes("complete_case_collab_row")) counts.complete += 1;
      if (url.includes("cat_update_stage_assignment_workflow_status")) counts.catStatus += 1;
    });
    await ensureT1ReadyToComplete(page, rest);
    await snap("ready");
    const rev0 = (await readCase(rest, CASE_ID)).revision;
    await tickField(page, rest, T1_ROW_ID, "taskCompleted");
    const afterComplete1 = await readCase(rest, CASE_ID);
    expect(afterComplete1.revision).toBeGreaterThan(rev0);
    await snap("complete-1");
    const reopen0 = counts.reopen;
    const frame = await openCat(page);
    await editLine1(page, frame, `C1-${Date.now().toString().slice(-5)}`);
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    await snap("edit-1");
    const afterEdit1 = counts.reopen;
    expect(afterEdit1, "第一輪有效改字必須送回退").toBeGreaterThan(reopen0);
    const extra1 = `e1-${Date.now().toString().slice(-4)}`;
    const extra2 = `e2-${Date.now().toString().slice(-4)}`;
    const cell = await lineTarget(frame, LINE1);
    await cell.click();
    await cell.press("End");
    await cell.type(extra1);
    await page.keyboard.press("Control+Enter");
    await expect.poll(async () => (await readLine1Target(rest)).includes(extra1), { timeout: 30_000 }).toBe(true);
    await cell.click();
    await cell.press("End");
    await cell.type(extra2);
    await page.keyboard.press("Control+Enter");
    await expect.poll(async () => (await readLine1Target(rest)).includes(extra2), { timeout: 30_000 }).toBe(true);
    expect(counts.reopen, "已回退後續打不得重寫完成狀態").toBe(afterEdit1);
    await snap("extra-edits");
    await cell.click();
    await page.keyboard.press("Control+Enter");
    expect(counts.reopen, "沒改字確認不得增加回退").toBe(afterEdit1);
    await snap("no-edit-confirm");
    await tickField(page, rest, T1_ROW_ID, "taskCompleted");
    await snap("complete-2");
    const reopenBefore2 = counts.reopen;
    const frame2 = await openCat(page);
    await editLine1(page, frame2, `C2-${Date.now().toString().slice(-5)}`);
    await expect.poll(async () => rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted === false, {
      timeout: 30_000,
    }).toBe(true);
    expect(counts.reopen, "第二輪再完成後必須再送回退").toBeGreaterThan(reopenBefore2);
    expect(counts.complete, "LMS 完成請求應有兩輪").toBeGreaterThanOrEqual(2);
    expect(rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    await snap("edit-2");
    console.log(`TASK002_COUNTS ${JSON.stringify({ counts, steps })}`);
    await session.close();
  });

  test("第 5 節已交件改字、只重開審稿、再審稿不自動交件", async ({ browser }) => {
    test.setTimeout(300_000);
    const t1 = credT1();
    const pm = credPm();
    const t1Session = await loginAs(browser, t1.email, t1.password);
    const restT1 = task002Rest(t1Session.page.request, await task002AccessToken(t1Session.page));
    await ensureT1ReadyToComplete(t1Session.page, restT1);
    await tickField(t1Session.page, restT1, T1_ROW_ID, "taskCompleted");
    await t1Session.close();

    const pmSession = await loginAs(browser, pm.email, pm.password);
    const rest = task002Rest(pmSession.page.request, await task002AccessToken(pmSession.page));
    await tickField(pmSession.page, rest, T1_ROW_ID, "reviewTaskCompleted");
    await tickField(pmSession.page, rest, T1_ROW_ID, "delivered");
    const delivered = await readCase(rest, CASE_ID);
    expect(rowById(delivered, T1_ROW_ID)?.delivered).toBe(true);
    expect(rowById(delivered, T2_ROW_ID)?.taskCompleted).toBe(true);
    expect(rowById(delivered, T2_ROW_ID)?.delivered).not.toBe(true);
    await pmSession.close();

    const t1b = await loginAs(browser, t1.email, t1.password);
    const rest2 = task002Rest(t1b.page.request, await task002AccessToken(t1b.page));
    const frame = await openCat(t1b.page);
    await editLine1(t1b.page, frame, `DL-${Date.now().toString().slice(-5)}`);
    await expect.poll(async () => {
      const state = await readCase(rest2, CASE_ID);
      const row = rowById(state, T1_ROW_ID);
      const cat = await readAssignment(rest2, T1_ASSIGN_ID);
      return !row?.taskCompleted && !row?.reviewTaskCompleted && !row?.delivered
        && cat === "in_progress" && (state.status === "dispatched" || state.status === "task_completed")
        ? "open" : JSON.stringify({ row, cat, status: state.status });
    }, { timeout: 40_000 }).toBe("open");
    expect(rowById(await readCase(rest2, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    await confirmLine(t1b.page, frame, LINE1);
    await waitTransConfirmed(rest2, 1);
    await tickField(t1b.page, rest2, T1_ROW_ID, "taskCompleted");
    await t1b.close();

    const pm2 = await loginAs(browser, pm.email, pm.password);
    const restPm = task002Rest(pm2.page.request, await task002AccessToken(pm2.page));
    await tickField(pm2.page, restPm, T1_ROW_ID, "reviewTaskCompleted");
    await tickField(pm2.page, restPm, T1_ROW_ID, "delivered");
    const catPage = pm2.page;
    const framePm = await openCat(catPage);
    const adjustBtn = framePm.locator("#btnWfAdjustStatus");
    await expect(adjustBtn).toBeVisible({ timeout: 30_000 });
    if ((await adjustBtn.getAttribute("data-mode")) === "prep-completed") {
      await adjustBtn.click();
      const confirmModal = framePm.locator("#catGenericConfirmModal");
      await expect(confirmModal).not.toHaveClass(/hidden/, { timeout: 30_000 });
      await framePm.locator("#btnCatGenericConfirmOk").click();
      await expect(confirmModal).toHaveClass(/hidden/, { timeout: 10_000 });
      await expect(adjustBtn).toHaveAttribute("data-mode", "adjust", { timeout: 30_000 });
    }
    await adjustBtn.click();
    await expect(framePm.locator("#wfAdjustStatusModal")).not.toHaveClass(/hidden/, { timeout: 20_000 });
    const reviewSelect = framePm.locator(
      `#wfAdjustStatusList select.wf-adjust-row-status[data-stage-kind='review'][data-assignment-id='${T1_REVIEW_ASSIGN_ID}']`,
    );
    await expect(reviewSelect).toBeVisible({ timeout: 20_000 });
    await reviewSelect.selectOption("in_progress");
    await framePm.locator("#btnWfAdjustStatusConfirm").click();
    await expect.poll(async () => {
      const state = await readCase(restPm, CASE_ID);
      const row = rowById(state, T1_ROW_ID);
      const review = await readAssignment(restPm, T1_REVIEW_ASSIGN_ID);
      return row?.taskCompleted && !row.reviewTaskCompleted && !row.delivered && review === "in_progress"
        ? "review-open" : JSON.stringify({ row, review, status: state.status });
    }, { timeout: 40_000 }).toBe("review-open");
    expect(rowById(await readCase(restPm, CASE_ID), T2_ROW_ID)?.taskCompleted).toBe(true);
    expect((await readCase(restPm, CASE_ID)).status).not.toBe("delivered");
    await tickField(pm2.page, restPm, T1_ROW_ID, "reviewTaskCompleted");
    const again = await readCase(restPm, CASE_ID);
    expect(rowById(again, T1_ROW_ID)?.reviewTaskCompleted).toBe(true);
    expect(rowById(again, T1_ROW_ID)?.delivered).toBe(false);
    expect(rowById(again, T1_ROW_ID)?.taskCompleted).toBe(true);
    expect(rowById(again, T2_ROW_ID)?.taskCompleted).toBe(true);
    await pm2.close();
  });
});
