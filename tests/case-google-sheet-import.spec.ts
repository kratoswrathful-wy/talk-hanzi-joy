import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { task002AccessToken, task002Rest } from "./helpers/task002-iso-api";

/**
 * TASK-002 D-GS：真 CAT「從 Google Sheet 匯入作業檔」入口，
 * 兩筆內容與既有譯者／審稿人員承接。不走本機 xlsx／CSV。
 */
const ENABLED = process.env.PLAYWRIGHT_TASK002_DGS === "1";
const describeDgs = ENABLED ? test.describe : test.describe.skip;

const GS_COPY_URL =
  "https://docs.google.com/spreadsheets/d/1Mxq-naTkRVRvENuatF3bpmysJ93cF3D0m7QQ2fcUVqw/edit?gid=0#gid=0";
const T1_ID = "10000000-0000-4000-8000-000000000003";
const T2_ID = "10000000-0000-4000-8000-000000000004";
const T1_LABEL = "譯者一（測試）";
const T2_LABEL = "譯者二（測試）";

function credPm(): { email: string; password: string } {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PLAYWRIGHT_ISO_PM_EMAIL").toBeTruthy();
  expect(password, "缺少 PLAYWRIGHT_ISO_PM_PASSWORD").toBeTruthy();
  return { email: email!, password: password! };
}

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

async function pickAssignee(page: Page, trigger: ReturnType<Page["locator"]>, label: string) {
  await trigger.click();
  const option = page.getByTestId(`assignee-option-${label}`).last();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

type CaseRead = {
  status: string;
  revision: number;
  rows: Array<{
    id: string;
    segment?: string;
    translatorUserId?: string | null;
    reviewerUserId?: string | null;
    linkedCatFileId?: string | null;
  }>;
};

async function readCase(rest: ReturnType<typeof task002Rest>, caseId: string): Promise<CaseRead> {
  const rows = await rest.get<
    Array<{ status: string; revision: number; collab_rows?: CaseRead["rows"] }>
  >(`cases_visible?select=status,revision,collab_rows&id=eq.${caseId}`);
  expect(rows[0], "讀不到案件").toBeTruthy();
  return {
    status: rows[0].status,
    revision: rows[0].revision,
    rows: Array.isArray(rows[0].collab_rows) ? rows[0].collab_rows : [],
  };
}

describeDgs("TASK-002 Google Sheet 匯入承接", () => {
  test("產品入口匯入兩筆，譯者與審稿自動帶入，重開一致", async ({ browser }) => {
    test.setTimeout(240_000);
    const pm = credPm();
    const session = await loginAs(browser, pm.email, pm.password);
    const page = session.page;
    const rest = task002Rest(page.request, await task002AccessToken(page));
    const stamp = Date.now();
    const title = `[AI驗收] TASK-002-D-GS-${stamp}`;
    const rowId = `cr-dgs-${stamp}`;
    const caseId = crypto.randomUUID();

    const created = await rest.rpc<{ ok?: boolean; error?: string }>("admin_create_case", {
      p_case_id: caseId,
      p_payload: {
        title,
        status: "draft",
        multi_collab: true,
        collab_rows: [
          {
            id: rowId,
            segment: title,
            translator: "",
            translatorUserId: null,
            reviewer: "",
            reviewerUserId: null,
            unitCount: 2,
            accepted: false,
            translationDeadline: null,
            reviewDeadline: null,
            taskCompleted: false,
            delivered: false,
            lineRange: null,
          },
        ],
      },
    });
    expect(created.ok, created.text).toBe(true);
    expect(created.data?.ok, created.text).toBe(true);

    await page.goto(`/cases/${caseId}`);
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });

    const collabRow = page.locator(`div.grid[data-collab-id="${rowId}"]`);
    await expect(collabRow).toBeVisible({ timeout: 15_000 });
    await pickAssignee(page, collabRow.locator('[role="button"]').first(), T1_LABEL);
    const reviewerCell = collabRow.locator('[data-collab-field="reviewer"]');
    if (!(await reviewerCell.isVisible())) {
      await page.locator("button").filter({ has: page.locator("svg") }).last().click().catch(() => undefined);
    }
    await reviewerCell.scrollIntoViewIfNeeded();
    await pickAssignee(page, reviewerCell.locator('[role="button"]'), T2_LABEL);

    const publish = page.getByTestId("case-detail-publish");
    await publish.scrollIntoViewIfNeeded();
    await expect(publish).toBeVisible({ timeout: 15_000 });
    await publish.click();
    await expect(page.getByText("案件已公布", { exact: true })).toBeVisible({ timeout: 20_000 });
    const finalize = page.getByTestId("case-detail-finalize");
    await expect(finalize).toBeVisible({ timeout: 15_000 });
    await finalize.click();
    await expect(page.getByText("已確定指派", { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("case-detail-back-to-list").click();
    await page.goto(`/cases/${caseId}`);
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    const beforeImport = await readCase(rest, caseId);
    expect(beforeImport.status).toBe("dispatched");
    expect(beforeImport.rows[0]?.translatorUserId).toBe(T1_ID);
    expect(beforeImport.rows[0]?.reviewerUserId).toBe(T2_ID);
    expect(beforeImport.rows[0]?.linkedCatFileId || null).toBeFalsy();

    await page.goto("/cat/team/projects");
    const frame = catFrame(page);
    await expect(frame.locator("#btnCreateProjectModal")).toBeVisible({ timeout: 60_000 });
    await frame.locator("#btnCreateProjectModal").click();
    await expect(frame.locator("#namingModalInput")).toBeVisible({ timeout: 15_000 });
    await frame.locator("#namingModalInput").fill(`DGS-proj-${stamp}`);
    await frame.locator("#btnNamingModalConfirm").click();
    const skip = frame.locator("#btnProjectWelcomeSkip");
    if (await skip.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await skip.click();
    }
    await expect(frame.locator("#btnAddFileModal")).toBeVisible({ timeout: 30_000 });
    await frame.locator("#btnAddFileModal").click();
    await expect(frame.locator("#gsImportUrlInput")).toBeVisible({ timeout: 15_000 });
    await frame.locator("#gsImportUrlInput").fill(GS_COPY_URL);
    await frame.locator("#btnGsImportStart").click();

    await expect(frame.locator("#casePickerKeywordInput")).toBeVisible({ timeout: 15_000 });
    await frame.locator("#casePickerKeywordInput").fill(title);
    await frame.locator("#btnCasePickerSearch").click();
    await expect(frame.locator(".case-picker-result-btn").first()).toBeVisible({ timeout: 20_000 });
    await frame.locator(".case-picker-result-btn").filter({ hasText: title }).first().click();
    await frame.locator("#btnCasePickerConfirm").click();

    const langConfirm = frame.locator("#btnFileLangConfirm");
    await expect(langConfirm).toBeVisible({ timeout: 20_000 });
    await langConfirm.click();

    await expect(frame.locator("#gsConfigSourceCol")).toBeVisible({ timeout: 30_000 });
    await expect(frame.locator("#gsConfigSourceCol")).toHaveValue("A");
    await expect(frame.locator("#gsConfigTargetCol")).toHaveValue("B");
    await expect(frame.locator("#gsConfigRows")).toHaveValue("2-");
    await frame.locator("#btnGsWizFinish").click();
    await expect(frame.getByText(title).first()).toBeVisible({ timeout: 60_000 });

    await expect.poll(async () => {
      const rows = await rest.get<Array<{ id: string }>>(
        `cat_files?select=id&related_lms_case_id=eq.${caseId}`,
      );
      return rows.length;
    }, { timeout: 30_000 }).toBe(1);
    const linked = await rest.get<Array<{ id: string; name: string; project_id: string; related_lms_case_id: string; file_format?: string }>>(
      `cat_files?select=id,name,project_id,related_lms_case_id,file_format&related_lms_case_id=eq.${caseId}`,
    );
    expect(linked.length, "應恰有一個連結檔").toBe(1);
    expect(linked[0].related_lms_case_id).toBe(caseId);
    const fileId = linked[0].id;
    const projectId = linked[0].project_id;

    const segs = await rest.get<Array<{ global_id: number; source_text: string; target_text: string }>>(
      `cat_segments?select=global_id,source_text,target_text&file_id=eq.${fileId}&order=global_id`,
    );
    expect(segs.map((s) => s.source_text)).toEqual(["Hello", "World"]);
    expect(segs.map((s) => s.target_text)).toEqual(["你好", "世界"]);
    expect(segs.some((s) => s.source_text === "原文" || s.target_text === "譯文")).toBe(false);

    const afterImport = await readCase(rest, caseId);
    expect(afterImport.rows[0]?.translatorUserId).toBe(T1_ID);
    expect(afterImport.rows[0]?.reviewerUserId).toBe(T2_ID);
    expect(afterImport.rows[0]?.linkedCatFileId).toBe(fileId);

    const stages = await rest.get<Array<{ id: string; stage_kind: string }>>(
      `cat_file_workflow_stages?select=id,stage_kind&file_id=eq.${fileId}`,
    );
    const assigns = await rest.get<Array<{ assignee_user_id: string; file_workflow_stage_id: string; workflow_status: string }>>(
      `cat_stage_assignments?select=assignee_user_id,file_workflow_stage_id,workflow_status&file_id=eq.${fileId}`,
    );
    const kindByStage = Object.fromEntries(stages.map((s) => [s.id, s.stage_kind]));
    const people = assigns.map((a) => ({ user: a.assignee_user_id, kind: kindByStage[a.file_workflow_stage_id] }));
    expect(people.some((p) => p.user === T1_ID && p.kind === "translate")).toBe(true);
    expect(people.some((p) => p.user === T2_ID && (p.kind === "review" || p.kind === "review1"))).toBe(true);

    await page.goto(`/cat/team/files/${fileId}?p=${projectId}`);
    await expect(frame.getByText("Hello")).toBeVisible({ timeout: 90_000 });
    await expect(frame.getByText("你好")).toBeVisible();
    await expect(frame.getByText("World")).toBeVisible();
    await expect(frame.getByText("世界")).toBeVisible();

    await session.close();

    const t1 = credT1();
    const t1Session = await loginAs(browser, t1.email, t1.password);
    await t1Session.page.goto(`/cat/team/files/${fileId}?p=${projectId}`);
    const t1Frame = catFrame(t1Session.page);
    const confirm = t1Frame.locator("#btnWfSessionConfirm");
    if (await confirm.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await t1Frame.locator('input[name="wfSessionChoice"][value="translate"]').check();
      await confirm.click();
    }
    await expect(t1Frame.getByText("Hello")).toBeVisible({ timeout: 90_000 });
    await expect(t1Frame.getByText("World")).toBeVisible();
    await t1Session.close();
  });
});
