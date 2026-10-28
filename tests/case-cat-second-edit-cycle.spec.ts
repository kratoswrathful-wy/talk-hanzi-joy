import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { task002AccessToken, task002Rest } from "./helpers/task002-iso-api";

/**
 * TASK-002 C：譯者完成 → 改字回退 → 再完成 → 再改字，第二輪不得被去重吃掉。
 * 走真 CAT 頁與隔離後端，不直寫終態。
 */
const ENABLED = process.env.PLAYWRIGHT_TASK002_CYCLE === "1";
const describeCycle = ENABLED ? test.describe : test.describe.skip;

const CASE_ID = "f1ddf362-622b-46ea-886b-426c5ceb5533";
const FILE_ID = "c9272140-301c-4d15-bd16-a530c9125167";
const PROJECT_ID = "8c39e56e-a127-4b11-89dd-80594936d91d";
const T2_ASSIGN_ID = "9689f8c3-1b0f-4b1b-9532-0cd6839e661b";
const T2_ROW_ID = "cr-1792931919430-1";
const T1_ROW_ID = "cr-1792931919430-0";

function credT2(): { email: string; password: string } {
  const email = process.env.PLAYWRIGHT_ISO_T2_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_T2_PASSWORD;
  expect(email, "缺少 PLAYWRIGHT_ISO_T2_EMAIL").toBeTruthy();
  expect(password, "缺少 PLAYWRIGHT_ISO_T2_PASSWORD").toBeTruthy();
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

async function line3Target(frame: FrameLocator) {
  return frame
    .locator(".grid-data-row")
    .filter({ hasText: "Done C source line 3" })
    .locator(".col-target .grid-textarea");
}

async function editLine3(frame: FrameLocator, marker: string) {
  const cell = await line3Target(frame);
  await expect(cell).toBeVisible({ timeout: 60_000 });
  await cell.click();
  await cell.press("End");
  await cell.type(marker);
  await cell.press("Tab");
}

async function confirmLine3AndComplete(page: Page, frame: FrameLocator) {
  const cell = await line3Target(frame);
  await cell.click();
  await page.keyboard.press("Control+Enter");
  const main = frame.locator("#btnWfTaskCompleteMain");
  await expect(main).toBeEnabled({ timeout: 20_000 });
  await main.click();
}

describeCycle("TASK-002 CAT 第二次改字回退", () => {
  test("完成後改字、再完成、再改字，對照列不動", async ({ browser }) => {
    test.setTimeout(180_000);
    const { email, password } = credT2();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    const startAssign = await readAssignment(rest, T2_ASSIGN_ID);
    const startCase = await readCase(rest, CASE_ID);
    expect(rowById(startCase, T1_ROW_ID)?.taskCompleted, "譯者一 1-2 應維持未完成").toBe(false);
    const reopenHits: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("reopen_own_cat_complete_on_edit")) {
        reopenHits.push(new Date().toISOString());
      }
    });

    await page.goto(`/cat/team/files/${FILE_ID}?p=${PROJECT_ID}`);
    await page.evaluate(() => {
      (window as unknown as { __task002WfMsgs?: string[] }).__task002WfMsgs = [];
      window.addEventListener("message", (event) => {
        const type = event.data && typeof event.data === "object" ? String(event.data.type || "") : "";
        if (type.startsWith("CAT_WF_")) {
          (window as unknown as { __task002WfMsgs?: string[] }).__task002WfMsgs?.push(type);
        }
      });
    });
    const frame = catFrame(page);
    await dismissWfSessionIfNeeded(frame);
    await expect(frame.getByText("Done C source line 3")).toBeVisible({ timeout: 90_000 });
    if (startAssign !== "completed") {
      await confirmLine3AndComplete(page, frame);
      await expect.poll(async () => readAssignment(rest, T2_ASSIGN_ID), { timeout: 30_000 }).toBe("completed");
    }
    const before = await readCase(rest, CASE_ID);
    expect(rowById(before, T2_ROW_ID)?.taskCompleted, "譯者二 3- 應先是完成").toBe(true);
    const startRev = before.revision;

    const firstMark = `R1-${Date.now().toString().slice(-6)}`;
    await editLine3(frame, firstMark);
    await expect.poll(async () => readAssignment(rest, T2_ASSIGN_ID), { timeout: 30_000 }).toBe("in_progress");
    await expect.poll(async () => {
      const lms = rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted === false;
      const msgs = await page.evaluate(() =>
        (window as unknown as { __task002WfMsgs?: string[] }).__task002WfMsgs ?? [],
      );
      return lms ? "lms-open" : `lms-still-complete msgs=${msgs.join(",")}`;
    }, { timeout: 20_000 }).toBe("lms-open");
    const afterFirst = await readCase(rest, CASE_ID);
    expect(rowById(afterFirst, T2_ROW_ID)?.taskCompleted).toBe(false);
    expect(rowById(afterFirst, T1_ROW_ID)?.taskCompleted).toBe(false);
    expect(afterFirst.status).toBe("dispatched");
    expect(afterFirst.revision).toBeGreaterThan(startRev);
    const afterFirstHits = reopenHits.length;
    expect(afterFirstHits, "第一次改字應送出回退").toBeGreaterThan(0);

    await editLine3(frame, "+");
    await expect.poll(async () => {
      const extra = reopenHits.length - afterFirstHits;
      const status = await readAssignment(rest, T2_ASSIGN_ID);
      return extra <= 1 && status === "in_progress" ? "stable" : `extra=${extra};status=${status}`;
    }, { timeout: 8_000 }).toBe("stable");
    expect(rowById(await readCase(rest, CASE_ID), T1_ROW_ID)?.taskCompleted).toBe(false);

    const line3 = frame
      .locator(".grid-data-row")
      .filter({ hasText: "Done C source line 3" })
      .locator(".col-target .grid-textarea");
    await line3.click();
    await page.keyboard.press("Control+Enter");
    await expect(frame.locator("#btnWfTaskCompleteMain")).toBeVisible({ timeout: 20_000 });
    await frame.locator("#btnWfTaskCompleteMain").click();
    await expect.poll(async () => readAssignment(rest, T2_ASSIGN_ID), { timeout: 30_000 }).toBe("completed");
    await expect.poll(async () => {
      return rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted === true ? "lms-complete" : "lms-still-open";
    }, { timeout: 20_000 }).toBe("lms-complete");
    const afterComplete = await readCase(rest, CASE_ID);
    expect(rowById(afterComplete, T2_ROW_ID)?.taskCompleted).toBe(true);
    expect(rowById(afterComplete, T1_ROW_ID)?.taskCompleted).toBe(false);
    const completeHits = reopenHits.length;

    const secondMark = `R2-${Date.now().toString().slice(-6)}`;
    await editLine3(frame, secondMark);
    await expect.poll(async () => readAssignment(rest, T2_ASSIGN_ID), { timeout: 30_000 }).toBe("in_progress");
    await expect.poll(async () => {
      return rowById(await readCase(rest, CASE_ID), T2_ROW_ID)?.taskCompleted === false ? "lms-open" : "lms-still-complete";
    }, { timeout: 20_000 }).toBe("lms-open");
    const afterSecond = await readCase(rest, CASE_ID);
    expect(rowById(afterSecond, T2_ROW_ID)?.taskCompleted).toBe(false);
    expect(rowById(afterSecond, T1_ROW_ID)?.taskCompleted).toBe(false);
    expect(afterSecond.status).toBe("dispatched");
    expect(reopenHits.length, "第二次改字必須再送回退").toBeGreaterThan(completeHits);
    expect(afterSecond.revision).toBeGreaterThan(afterComplete.revision);

    await session.close();
  });
});
