import type { FrameLocator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { catFrame, enableCatNavDebug } from "./cat-frame";
import { dismissBlockingModals } from "./cat-nav-assert";

export type OpenOfflineCatOptions = {
  fixturePath: string;
  projectName?: string;
  importTimeoutMs?: number;
  editorTimeoutMs?: number;
};

async function dismissProjectWelcome(frame: FrameLocator) {
  const skip = frame.locator("#btnProjectWelcomeSkip");
  try {
    await skip.waitFor({ state: "visible", timeout: 20_000 });
    await skip.click();
    await frame.locator("#projectWelcomeModal.hidden").waitFor({ state: "attached", timeout: 10_000 });
  } catch {
    // 歡迎視窗未出現或已關閉
  }
}

async function selectFileLangIfPresent(frame: FrameLocator, srcCode: string, tgtCode: string) {
  const modal = frame.locator("#fileLangModal:not(.hidden)");
  if (!(await modal.isVisible().catch(() => false))) return;

  const pick = async (radioName: string, searchId: string, code: string) => {
    const exact = frame.locator(`input[name="${radioName}"][value="${code}"]`);
    if (await exact.count()) {
      await exact.first().check({ force: true });
      return;
    }
    const search = frame.locator(`#${searchId}`);
    if (await search.count()) {
      await search.fill(code);
    }
    const fallback = frame.locator(`input[name="${radioName}"]`).first();
    await fallback.check({ force: true });
  };

  await pick("fileLangSrc", "fileLangSrcSearch", srcCode);
  await pick("fileLangTgt", "fileLangTgtSearch", tgtCode);
  await frame.locator("#btnFileLangConfirm").click();
  await modal.waitFor({ state: "hidden", timeout: 10_000 });
}

async function dismissLangMismatchDialog(frame: FrameLocator) {
  const dlg = frame.locator("#batchImportLangMismatchDialog");
  if (await dlg.isVisible().catch(() => false)) {
    await dlg.locator('button[type="submit"]').click();
    await dlg.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

async function confirmFileLangModal(frame: FrameLocator) {
  await frame.locator("#fileLangModal:not(.hidden)").waitFor({ state: "visible", timeout: 30_000 });
  await selectFileLangIfPresent(frame, "en-us", "zh-tw");
}

async function confirmBatchMqModal(frame: FrameLocator) {
  const ok = frame.locator("#btnBatchMqOk");
  if (await ok.isVisible().catch(() => false)) {
    await ok.click();
  }
}

async function confirmImportConfirmedModal(frame: FrameLocator) {
  const modal = frame.locator("#importConfirmedModal:not(.hidden)");
  if (await modal.isVisible().catch(() => false)) {
    await frame.locator("#btnImportConfirmedConfirm").click();
    await modal.waitFor({ state: "hidden", timeout: 120_000 });
  }
}

async function dismissImportConfirmedModal(frame: FrameLocator) {
  await confirmImportConfirmedModal(frame);
}

async function confirmMqRoleOnOpen(frame: FrameLocator, timeoutMs = 120_000) {
  const modal = frame.locator("#mqRoleModal:not(.hidden)");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await modal.isVisible().catch(() => false)) {
      await frame.locator("#btnMqRoleConfirm").click();
      await frame
        .locator("#mqRoleModal.hidden")
        .waitFor({ state: "attached", timeout: 15_000 })
        .catch(() => {});
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function waitForEditorSegments(frame: FrameLocator, timeoutMs: number) {
  await confirmMqRoleOnOpen(frame, Math.min(timeoutMs, 120_000));
  await frame.locator("#editorGrid").waitFor({ state: "visible", timeout: timeoutMs });

  await expect
    .poll(
      async () => {
        await confirmMqRoleOnOpen(frame, 5_000);
        await dismissBlockingModals(frame);
        await dismissImportConfirmedModal(frame);
        const rowCount = await frame.locator(".grid-data-row").count();
        if (rowCount > 0) return true;
        const segSummary = await frame.locator("#statusBarSegSummary").textContent().catch(() => "");
        const total = parseInt((segSummary || "0").split("/")[0]?.trim() || "0", 10);
        return total > 0;
      },
      { timeout: timeoutMs },
    )
    .toBe(true);

  await frame.locator(".grid-data-row").first().waitFor({ state: "visible", timeout: 60_000 });
}

async function createProjectIfNeeded(frame: FrameLocator, projectName: string) {
  await frame.locator('[data-view="viewProjects"]').click();
  await frame.locator("#viewProjects").waitFor({ state: "visible", timeout: 15_000 });

  const existing = frame.locator(".resource-name", { hasText: projectName });
  if (await existing.count()) {
    await existing.first().click();
    await dismissProjectWelcome(frame);
    return;
  }

  await frame.locator("#btnCreateProjectModal").click();
  await frame.locator("#namingModal:not(.hidden)").waitFor({ state: "visible" });
  await frame.locator("#namingModalInput").fill(projectName);
  await frame.locator("#btnNamingModalConfirm").click();
  await dismissProjectWelcome(frame);
  await frame.locator("#viewProjectDetail").waitFor({ state: "visible", timeout: 15_000 });
}

async function importFixture(frame: FrameLocator, fixturePath: string, timeoutMs: number) {
  await dismissProjectWelcome(frame);
  await frame.locator("#btnAddFileModal").click();
  await frame.locator("#wizardOverlay:not(.hidden)").waitFor({ state: "visible", timeout: 15_000 });
  await frame.locator("#sourceFileInput").setInputFiles(fixturePath);

  await confirmFileLangModal(frame);
  await confirmBatchMqModal(frame);
  await confirmImportConfirmedModal(frame);

  const progress = frame.locator("#wizardStepBatchProgress:not(.hidden)");
  await progress.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});

  await expect
    .poll(
      async () => {
        await dismissLangMismatchDialog(frame);
        await dismissImportConfirmedModal(frame);
        const wizardHidden = await frame
          .locator("#wizardOverlay")
          .evaluate((el) => el.classList.contains("hidden"));
        const fileReady = (await frame.locator(".edit-file-btn").count()) > 0;
        return wizardHidden || fileReady;
      },
      { timeout: timeoutMs },
    )
    .toBe(true);

  await dismissLangMismatchDialog(frame);

  await frame.locator(".edit-file-btn").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function openImportedFileInEditor(frame: FrameLocator, editorTimeoutMs: number) {
  await frame.locator(".edit-file-btn").first().click();
  await waitForEditorSegments(frame, editorTimeoutMs);
}

export async function openOfflineCatWithFile(
  page: Page,
  opts: OpenOfflineCatOptions,
): Promise<FrameLocator> {
  const {
    fixturePath,
    projectName = `[PW] CAT Nav ${Date.now()}`,
    importTimeoutMs = 180_000,
    editorTimeoutMs = 180_000,
  } = opts;

  await page.goto("/cat/offline/projects");
  const frame = catFrame(page);
  await frame.locator("body").waitFor({ state: "attached", timeout: 30_000 });
  await enableCatNavDebug(frame);

  await createProjectIfNeeded(frame, projectName);
  await importFixture(frame, fixturePath, importTimeoutMs);
  await openImportedFileInEditor(frame, editorTimeoutMs);
  await dismissBlockingModals(frame);

  return frame;
}

export async function assertVirtEnabled(frame: FrameLocator, expected: boolean) {
  const enabled = await frame.locator("body").evaluate(() => {
    const g = (window as unknown as { CatVirtGrid?: { isEnabled?: () => boolean } }).CatVirtGrid;
    return !!g?.isEnabled?.();
  });
  if (enabled !== expected) {
    throw new Error(`CatVirtGrid.isEnabled() 預期 ${expected}，實際 ${enabled}`);
  }
}
