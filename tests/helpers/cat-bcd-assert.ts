import { expect, type FrameLocator } from "@playwright/test";
import {
  dismissBlockingModals,
  dismissCatGenericConfirm,
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

export async function dismissEditorObstructingPanels(frame: FrameLocator) {
  const notesPanel = frame.locator("#notesPanel");
  if ((await notesPanel.count()) > 0) {
    const collapsed = await notesPanel.evaluate((el) => el.classList.contains("collapsed"));
    if (!collapsed) {
      await frame.locator("#btnCollapseNotesPanel").click();
      await expect(notesPanel).toHaveClass(/collapsed/);
    }
  }

  const advVisible = await frame
    .locator("#sfAdvancedPanel:not(.hidden)")
    .isVisible()
    .catch(() => false);
  if (advVisible) {
    await frame.locator("#btnToggleAdvancedSF").click();
    await expect(frame.locator("#sfAdvancedPanel")).toHaveClass(/hidden/);
  }
}

export async function focusTargetCell(frame: FrameLocator, segId: string) {
  await dismissEditorObstructingPanels(frame);
  const textarea = frame.locator(
    `.grid-data-row[data-seg-id="${segId}"] .col-target .grid-textarea`,
  );
  await textarea.scrollIntoViewIfNeeded();
  await textarea.click();
}

/** 跳到 display 並聚焦譯文格（收合可能遮擋點擊的面板）。 */
export async function focusTargetAtDisplay(
  frame: FrameLocator,
  displayId: number,
): Promise<string | null> {
  const segId = await jumpToDisplayIndex(frame, displayId);
  if (!segId) return null;
  await focusTargetCell(frame, segId);
  return segId;
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
  await dismissEditorObstructingPanels(frame);
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
      const wf = row.getAttribute("data-wf-state") || "";
      if (wf !== "review_confirmed") continue;
      const displayId = parseInt(row.querySelector(".col-id")?.textContent?.trim() || "0", 10);
      const segId = row.getAttribute("data-seg-id");
      if (segId && Number.isFinite(displayId) && displayId > 0) {
        return { segId, displayId };
      }
    }
    return null;
  });
}

async function dismissNoteSharingModal(frame: FrameLocator) {
  const modal = frame.locator("#noteSharingModal:not(.hidden)");
  if (await modal.isVisible().catch(() => false)) {
    await frame.locator("#btnNoteSharingConfirm").click();
    await modal.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

async function findSegmentWithTargetForConfirm(
  frame: FrameLocator,
  nearDisplayId?: number,
): Promise<{ segId: string; displayId: number } | null> {
  return frame.locator("body").evaluate((_, near) => {
    type Candidate = { segId: string; displayId: number; dist: number };
    const candidates: Candidate[] = [];
    for (const row of document.querySelectorAll(".grid-data-row")) {
      const wf = row.getAttribute("data-wf-state") || "";
      if (wf === "review_confirmed") continue;
      const displayId = parseInt(row.querySelector(".col-id")?.textContent?.trim() || "0", 10);
      const segId = row.getAttribute("data-seg-id");
      const target = row.querySelector(".col-target .grid-textarea")?.textContent?.trim();
      if (!segId || !Number.isFinite(displayId) || displayId <= 0 || !target) continue;
      candidates.push({
        segId,
        displayId,
        dist: near ? Math.abs(displayId - near) : displayId,
      });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0] ?? null;
  }, nearDisplayId);
}

async function getCurrentMqRole(frame: FrameLocator): Promise<string | null> {
  return frame.locator("body").evaluate(() => {
    const icon = document.getElementById("mqRoleIcon");
    if (!icon || icon.style.display === "none") return null;
    const title = icon.getAttribute("title") || "";
    if (/R2/.test(title) || icon.innerHTML.includes("✓✓")) return "R2";
    if (/R1/.test(title) || icon.innerHTML.includes("✓+")) return "R1";
    if (/T_DENY/.test(title)) return "T_DENY_R1";
    return "T_ALLOW_R1";
  });
}

type WfStageLite = { id: unknown; stageKind?: string; status?: string };

/** 離線 CAT：prep active 時離開編輯器會被擋，但 wf toolbar 不顯示「準備完成」按鈕。 */
async function completeOfflinePrepStageIfActive(frame: FrameLocator): Promise<boolean> {
  return frame.locator("body").evaluate(async () => {
    const w = window as unknown as {
      _currentFileWorkflowStages?: WfStageLite[];
    };
    const stages = [...(w._currentFileWorkflowStages || [])];
    const idx = stages.findIndex((s) => s.stageKind === "prep" && s.status === "active");
    if (idx < 0) return false;
    const prep = stages[idx];
    const prepId = prep.id;

    const persist = async (): Promise<boolean> => {
      try {
        const db = new Function(
          'try { return typeof DBService !== "undefined" ? DBService : null; } catch { return null; }',
        )() as {
          updateFileWorkflowStageStatus?: (
            id: unknown,
            status: string,
          ) => Promise<Record<string, unknown>>;
        } | null;
        if (db?.updateFileWorkflowStageStatus) {
          const updated = await db.updateFileWorkflowStageStatus(prepId, "completed");
          stages[idx] = { ...stages[idx], ...updated, status: "completed" };
          w._currentFileWorkflowStages = stages;
          return true;
        }
      } catch {
        /* fall through to in-memory patch */
      }
      stages[idx] = { ...stages[idx], status: "completed" };
      w._currentFileWorkflowStages = stages;
      return true;
    };

    return persist();
  });
}

async function ensureCatFilePrepMarkedReady(frame: FrameLocator) {
  const prepBtn = frame.locator('#btnWfAdjustStatus[data-mode="prep-completed"]');
  if (await prepBtn.isVisible().catch(() => false)) {
    await prepBtn.click();
    const confirm = frame.locator("#catGenericConfirmModal:not(.hidden)");
    if (await confirm.isVisible().catch(() => false)) {
      await frame.locator("#btnCatGenericConfirmOk").click();
      await confirm.waitFor({ state: "hidden", timeout: 15_000 });
    }
    return;
  }
  await completeOfflinePrepStageIfActive(frame);
}

/** 離開編輯器後以指定 memoQ 身分重開檔案。 */
export async function reopenEditorAsMqRole(frame: FrameLocator, roleValue: string) {
  const current = await getCurrentMqRole(frame);
  if (current === roleValue) return;

  await dismissBlockingModals(frame);
  await dismissEditorObstructingPanels(frame);
  await ensureCatFilePrepMarkedReady(frame);

  await expect
    .poll(
      async () => {
        if (await frame.locator("#viewProjectDetail").isVisible().catch(() => false)) {
          return true;
        }
        await dismissCatGenericConfirm(frame, true);
        await dismissNoteSharingModal(frame);
        await dismissBlockingModals(frame);
        await ensureCatFilePrepMarkedReady(frame);
        const prepBlock = frame.locator("#catGenericConfirmModal:not(.hidden)");
        if (await prepBlock.isVisible().catch(() => false)) {
          const title = await frame.locator("#catGenericConfirmTitle").textContent();
          if (title?.includes("檔案準備")) {
            await completeOfflinePrepStageIfActive(frame);
            await frame.locator("#btnCatGenericConfirmCancel").click();
            await prepBlock.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
            await ensureCatFilePrepMarkedReady(frame);
          }
        }
        const exitBtn = frame.locator("#btnExitEditor");
        if (await exitBtn.isVisible().catch(() => false)) {
          await exitBtn.click({ force: true });
        }
        return frame.locator("#viewProjectDetail").isVisible().catch(() => false);
      },
      { timeout: 90_000 },
    )
    .toBe(true);
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

export async function findRowByWfState(
  frame: FrameLocator,
  wfState: string,
): Promise<{ segId: string; displayId: number } | null> {
  return frame.locator("body").evaluate((_, state) => {
    for (const row of document.querySelectorAll(".grid-data-row")) {
      if (row.getAttribute("data-wf-state") !== state) continue;
      const displayId = parseInt(row.querySelector(".col-id")?.textContent?.trim() || "0", 10);
      const segId = row.getAttribute("data-seg-id");
      if (segId && Number.isFinite(displayId) && displayId > 0) {
        return { segId, displayId };
      }
    }
    return null;
  }, wfState);
}

/**
 * 取得可供 BCD-D noop 測試的「審稿確認」句段。
 * 若檔案已有 review_confirmed 則直接使用；否則以有譯文句段執行 T → R1 建立（Test_Small 常用 #17）。
 */
export async function resolveReviewConfirmedSegmentForTranslator(
  frame: FrameLocator,
  preferredDisplayId = 17,
): Promise<{ segId: string; displayId: number }> {
  await ensureCatFilePrepMarkedReady(frame);

  const existing = await findReviewConfirmedRow(frame);
  if (existing) {
    const role = await getCurrentMqRole(frame);
    if (role !== null && role !== "T_ALLOW_R1") {
      await reopenEditorAsMqRole(frame, "T_ALLOW_R1");
    }
    await jumpToDisplayIndex(frame, existing.displayId);
    await dismissEditorObstructingPanels(frame);
    await expect
      .poll(async () => getRowWfState(frame, existing.segId), { timeout: 10_000 })
      .toBe("review_confirmed");
    return existing;
  }

  const candidate =
    (await findSegmentWithTargetForConfirm(frame, preferredDisplayId)) ??
    (await findSegmentWithTargetForConfirm(frame));
  if (!candidate) {
    throw new Error("找不到可建立審稿確認狀態的句段（需有譯文）");
  }

  await jumpToDisplayIndex(frame, candidate.displayId);
  await focusTargetCell(frame, candidate.segId);
  await frame.locator(".grid-textarea:focus").press("Control+Enter");

  const wfAfterT = await getRowWfState(frame, candidate.segId);
  if (wfAfterT !== "trans_confirmed" && wfAfterT !== "review_confirmed") {
    await expect
      .poll(async () => getRowWfState(frame, candidate.segId), { timeout: 8_000 })
      .toBe("trans_confirmed");
  }

  if ((await getRowWfState(frame, candidate.segId)) !== "review_confirmed") {
    await reopenEditorAsMqRole(frame, "R1");
    await jumpToDisplayIndex(frame, candidate.displayId);
    await focusTargetCell(frame, candidate.segId);
    await frame.locator(".grid-textarea:focus").press("Control+Enter");
    await expect
      .poll(async () => getRowWfState(frame, candidate.segId), { timeout: 8_000 })
      .toBe("review_confirmed");
  }

  await reopenEditorAsMqRole(frame, "T_ALLOW_R1");
  await jumpToDisplayIndex(frame, candidate.displayId);
  await dismissEditorObstructingPanels(frame);
  return candidate;
}

/** @deprecated 請改用 resolveReviewConfirmedSegmentForTranslator */
export async function prepareReviewConfirmedSegmentForTranslator(
  frame: FrameLocator,
  displayId = 20,
): Promise<{ segId: string; displayId: number }> {
  return resolveReviewConfirmedSegmentForTranslator(frame, displayId);
}

export async function expectCenteredOnSeg(frame: FrameLocator, segId: string, timeoutMs = 15_000) {
  await expect
    .poll(async () => {
      const nav = await getCatNavigationState(frame);
      return nav.activeSegId === segId && nav.centeredOk;
    }, { timeout: timeoutMs })
    .toBe(true);
}
