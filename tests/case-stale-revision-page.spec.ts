import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { readCaseState } from "./helpers/isolated-api";
import { plainTextFromCaseBodyContent } from "../src/lib/case-body-plain-text";
import { task002AccessToken, task002Rest } from "./helpers/task002-iso-api";

/**
 * TASK-002 F：真的後端拒絕舊版本＋真的案件頁。
 * 不是契約函式、也不是模擬 stale_revision。
 */
const ENABLED = process.env.PLAYWRIGHT_TASK002_CONFLICT === "1";
const describeConflict = ENABLED ? test.describe : test.describe.skip;

function credPm(): { email: string; password: string } {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PLAYWRIGHT_ISO_PM_EMAIL").toBeTruthy();
  expect(password, "缺少 PLAYWRIGHT_ISO_PM_PASSWORD").toBeTruthy();
  return { email: email!, password: password! };
}

function isoBodyBlocks(text: string) {
  return [
    {
      id: "iso-body-1",
      type: "paragraph",
      props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
      content: [{ type: "text", text, styles: {} }],
      children: [],
    },
  ];
}

describeConflict("TASK-002 儲存衝突頁面＋後端", () => {
  test("舊版本被拒、草稿仍在、後端新值不被蓋、放棄重載後可再存", async ({ browser }) => {
    test.setTimeout(180_000);
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const stamp = Date.now();
    const title = `[AI驗收] TASK-002-衝突-${stamp}`;
    const draftText = `DRAFT-KEEP-${stamp}`;
    const winnerNote = `B-WINNER-${stamp}`;
    const recoveredText = `AFTER-RELOAD-${stamp}`;

    const token = await task002AccessToken(page);
    const rest = task002Rest(page.request, token);
    const caseId = crypto.randomUUID();
    const created = await rest.rpc<{ ok?: boolean; error?: string }>("admin_create_case", {
      p_case_id: caseId,
      p_payload: { title, status: "draft" },
    });
    expect(created.ok, created.text).toBe(true);
    expect(created.data?.ok, created.text).toBe(true);

    await page.goto(`/cases/${caseId}`);
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    const before = await readCaseState(rest, caseId);
    expect(before, "建案後讀不到版本").toBeTruthy();
    const revisionA = before!.revision;

    const editor = page.getByTestId("case-body-editor").locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type(draftText);
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-save-phase", "pending");

    const raced = await rest.rpc<{ ok?: boolean; error?: string; revision?: number }>("apply_case_update", {
      p_case_id: caseId,
      p_expected_revision: revisionA,
      p_patch: { process_note: winnerNote },
    });
    expect(raced.ok, raced.text).toBe(true);
    expect(raced.data?.ok, raced.text).toBe(true);
    const revisionB = raced.data?.revision ?? revisionA + 1;
    expect(revisionB).toBeGreaterThan(revisionA);

    await page.getByRole("heading", { name: "案件說明" }).click();
    await expect.poll(async () => {
      return page.getByTestId("case-detail-completeness").getAttribute("data-save-phase");
    }, { timeout: 20_000 }).toBe("conflict");
    await expect(page.getByTestId("case-save-status")).toHaveText("版本衝突");
    await expect(page.getByTestId("case-save-status")).not.toHaveText("已儲存");
    await expect(page.getByTestId("case-body-editor")).toContainText(draftText);

    const mid = await rest.get<Array<{ revision: number; process_note?: string; body_content?: unknown }>>(
      `cases_visible?select=revision,process_note,body_content&id=eq.${caseId}`,
    );
    expect(mid[0]?.revision).toBe(revisionB);
    expect(mid[0]?.process_note).toBe(winnerNote);
    expect(plainTextFromCaseBodyContent(mid[0]?.body_content)).not.toContain(draftText);

    await page.getByTestId("case-detail-back-to-list").click();
    await expect(page.getByTestId("case-body-pending-leave")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "留在此頁" }).click();
    await expect(page.getByTestId("case-body-editor")).toContainText(draftText);

    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("case-body-editor")).not.toContainText(draftText);
    const afterReload = await readCaseState(rest, caseId);
    expect(afterReload?.revision).toBe(revisionB);

    const editor2 = page.getByTestId("case-body-editor").locator('[contenteditable="true"]').first();
    await editor2.click();
    await page.keyboard.type(recoveredText);
    await page.getByRole("heading", { name: "案件說明" }).click();
    await expect.poll(async () => {
      const phase = await page.getByTestId("case-detail-completeness").getAttribute("data-save-phase");
      return phase === "saved" || phase === "idle" ? "done" : phase;
    }, { timeout: 20_000 }).toBe("done");

    await page.goto(`/cases/${caseId}`);
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("case-body-editor")).toContainText(recoveredText);
    const finalRows = await rest.get<Array<{ revision: number; process_note?: string; body_content?: unknown }>>(
      `cases_visible?select=revision,process_note,body_content&id=eq.${caseId}`,
    );
    expect(finalRows[0]?.process_note).toBe(winnerNote);
    expect(plainTextFromCaseBodyContent(finalRows[0]?.body_content)).toContain(recoveredText);
    expect(finalRows[0]?.revision).toBeGreaterThan(revisionB);

    await session.close();
  });
});
