import { expect, type FrameLocator } from "@playwright/test";
import {
  dismissBlockingModals,
  getCatNavigationState,
  jumpToDisplayIndex,
} from "./cat-nav-assert";

/** BCD-B：加權字數相關按鈕應隱藏且不可見。 */
export async function expectWeightedWordCountUiHidden(frame: FrameLocator) {
  const ids = [
    "btnToggleEditorWordMode",
    "btnToggleFileProgressMode",
    "btnToggleViewProgressMode",
    "btnProjectWordCount",
    "btnViewsToolbarWordCount",
  ] as const;

  for (const id of ids) {
    const el = frame.locator(`#${id}`);
    if ((await el.count()) === 0) continue;
    await expect(el).toHaveClass(/hidden/);
    await expect(el).toBeHidden();
  }

  const editorWc = frame.locator("#btnEditorWordCount");
  if (await editorWc.count()) {
    await expect(editorWc).toBeHidden();
  }
}

/** 進階篩選：句段編號範圍，並加入篩選群組。 */
export async function applyRowRangeFilterGroup(
  frame: FrameLocator,
  rangeExpr: string,
  opts?: { exclude?: boolean },
) {
  await dismissBlockingModals(frame);
  const filterBtn = frame.locator("#sfModeFilter");
  if (!(await filterBtn.evaluate((el) => el.classList.contains("active")))) {
    await filterBtn.click();
  }
  await frame.locator("#btnToggleAdvancedSF").click();
  await frame.locator("#sfAdvancedPanel:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });
  await frame.locator("#sfRowRangeEnabled").check({ force: true });
  if (opts?.exclude) {
    await frame.locator("#sfRowRangeExclude").check({ force: true });
  } else {
    await frame.locator("#sfRowRangeExclude").uncheck({ force: true });
  }
  await frame.locator("#sfRowRangeExpr").fill(rangeExpr);
  await frame.locator("#btnAddFilterGroup").click();
  await expect
    .poll(async () => frame.locator("#sfFilterCountBadge").isVisible().catch(() => false), {
      timeout: 15_000,
    })
    .toBe(true);
}

export async function clearSearchFilterNav(frame: FrameLocator) {
  await frame.locator("#btnSfClearNav").click();
}

export async function getVisibleGridRowCount(frame: FrameLocator): Promise<number> {
  return frame.locator(".grid-data-row").count();
}

export async function getRowWfState(
  frame: FrameLocator,
  segId: string,
): Promise<string | null> {
  return frame
    .locator(`.grid-data-row[data-seg-id="${segId}"]`)
    .getAttribute("data-wf-state");
}

export async function findReviewConfirmedRow(
  frame: FrameLocator,
): Promise<{ segId: string; displayId: number } | null> {
  return frame.locator("body").evaluate(() => {
    for (const row of document.querySelectorAll(".grid-data-row")) {
      const wf = (row as HTMLElement).dataset.wfState;
      if (wf !== "review_confirmed") continue;
      const displayId = parseInt(row.querySelector(".col-id")?.textContent?.trim() || "0", 10);
      const segId = (row as HTMLElement).dataset.segId;
      if (segId && Number.isFinite(displayId) && displayId > 0) {
        return { segId, displayId };
      }
    }
    return null;
  });
}

/** 離開編輯器後以指定 memoQ 身分重開檔案。 */
export async function reopenEditorAsMqRole(frame: FrameLocator, roleValue: string) {
  await dismissBlockingModals(frame);
  await frame.locator("#btnExitEditor").click();
  await frame.locator("#viewProjectDetail").waitFor({ state: "visible", timeout: 30_000 });
  await frame.locator(".edit-file-btn").first().click();

  const modal = frame.locator("#mqRoleModal:not(.hidden)");
  await modal.waitFor({ state: "visible", timeout: 60_000 });
  await frame.locator(`input[name="mqRoleChoice"][value="${roleValue}"]`).check({ force: true });
  await frame.locator("#btnMqRoleConfirm").click();
  await modal.waitFor({ state: "hidden", timeout: 15_000 });

  await frame.locator("#editorGrid").waitFor({ state: "visible", timeout: 120_000 });
  await frame.locator(".grid-data-row").first().waitFor({ state: "visible", timeout: 60_000 });
  await dismissBlockingModals(frame);
}

/**
 * 建立一筆「審稿確認」句段：T 翻譯確認 → R1 審稿確認 → 切回 T。
 * 回傳可供 BCD-D noop 測試的 displayId／segId。
 */
export async function prepareReviewConfirmedSegmentForTranslator(
  frame: FrameLocator,
  displayId = 20,
): Promise<{ segId: string; displayId: number }> {
  const segId = await jumpToDisplayIndex(frame, displayId);
  if (!segId) throw new Error(`無法跳到句段 #${displayId}`);

  await frame.locator(`.grid-data-row[data-seg-id="${segId}"] .col-target .grid-textarea`).click();
  await frame.locator(".grid-textarea:focus").press("Control+Enter");
  await frame
    .locator(`.grid-data-row[data-seg-id="${segId}"]`)
    .waitFor({ state: "visible", timeout: 10_000 });

  const wf = await getRowWfState(frame, segId);
  if (wf !== "trans_confirmed") {
    await expect
      .poll(async () => getRowWfState(frame, segId), { timeout: 8_000 })
      .toBe("trans_confirmed");
  }

  await reopenEditorAsMqRole(frame, "R1");
  await jumpToDisplayIndex(frame, displayId);
  await frame.locator(`.grid-data-row[data-seg-id="${segId}"] .col-target .grid-textarea`).click();
  await frame.locator(".grid-textarea:focus").press("Control+Enter");
  await expect
    .poll(async () => getRowWfState(frame, segId), { timeout: 8_000 })
    .toBe("review_confirmed");

  await reopenEditorAsMqRole(frame, "T_ALLOW_R1");
  await jumpToDisplayIndex(frame, displayId);

  return { segId, displayId };
}

export async function expectCenteredOnSeg(frame: FrameLocator, segId: string, timeoutMs = 15_000) {
  await expect
    .poll(async () => {
      const nav = await getCatNavigationState(frame);
      return nav.activeSegId === segId && nav.centeredOk;
    }, { timeout: timeoutMs })
    .toBe(true);
}
