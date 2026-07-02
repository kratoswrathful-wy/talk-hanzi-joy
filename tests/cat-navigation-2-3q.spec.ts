import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { resolveCatFixture } from "./helpers/cat-fixtures";
import {
  clickTargetTextareaAtDisplay,
  dismissHighMatchGuard,
  clickConfirmedTargetNearDisplay,
  dismissBlockingModals,
  findConfirmedTargetSegId,
  getCatNavSnapshot,
  getCatNavigationState,
  getVirtDebugState,
  jumpToDisplayIndex,
  pollScrollTopChanges,
  pollViewportStable,
  scrollToDisplayIndex,
} from "./helpers/cat-nav-assert";
import { attachCatConsoleCollector } from "./helpers/cat-nav-debug";
import { assertVirtEnabled, openOfflineCatWithFile } from "./helpers/cat-offline-open";

const SMALL_FIXTURE = resolveCatFixture("small");
const LARGE_FIXTURE = resolveCatFixture("large");

async function resetEditorView(frame: FrameLocator) {
  await dismissBlockingModals(frame);
  const clearBtn = frame.locator("#btnSfClearNav");
  if (await clearBtn.isVisible().catch(() => false)) {
    await clearBtn.click();
  }
  await frame.locator("#editorGrid").evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await frame.locator(".grid-data-row .col-target .grid-textarea").first().click();
}

test.describe("Phase 2.3q CAT navigation (Playwright)", () => {
  test.describe("Test D — 小檔冒煙", () => {
    test("Ctrl+Enter 置中導覽；virt 關閉", async ({ page }) => {
      attachCatConsoleCollector(page);
      const frame = await openOfflineCatWithFile(page, {
        fixturePath: SMALL_FIXTURE,
        projectName: `[PW] Nav Small ${Date.now()}`,
        importTimeoutMs: 60_000,
        editorTimeoutMs: 60_000,
      });
      await assertVirtEnabled(frame, false);

      await frame.locator(".grid-data-row .col-target .grid-textarea").first().click();
      const before = await getCatNavigationState(frame);
      expect(before.activeSegId).toBeTruthy();

      await frame.locator(".grid-textarea:focus").press("Control+Enter");

      await expect
        .poll(async () => getCatNavigationState(frame), { timeout: 8_000 })
        .toMatchObject({
          activeIsGridTextarea: true,
          activeInTargetCol: true,
          centeredOk: true,
        });
    });
  });

  test.describe("Test A–I — 大檔", () => {
    test.describe.configure({ mode: "serial" });
    let sharedPage: Page;
    let sharedFrame: FrameLocator;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(900_000);
      const context = await browser.newContext({
        storageState: "playwright/.auth/user.json",
      });
      sharedPage = await context.newPage();
      attachCatConsoleCollector(sharedPage);
      sharedFrame = await openOfflineCatWithFile(sharedPage, {
        fixturePath: LARGE_FIXTURE,
        projectName: `[PW] Nav Big ${Date.now()}`,
        importTimeoutMs: 600_000,
        editorTimeoutMs: 600_000,
      });
      await assertVirtEnabled(sharedFrame, true);
    });

    test.afterAll(async () => {
      await sharedPage?.context().close();
    });

    test.beforeEach(async () => {
      test.setTimeout(180_000);
      await resetEditorView(sharedFrame);
    });

    test("Test A — Ctrl+Enter ×3 置中", async () => {
      await scrollToDisplayIndex(sharedFrame, 20);
      await sharedFrame.locator(".grid-data-row .col-target .grid-textarea").first().click();
      for (let i = 0; i < 3; i++) {
        await sharedFrame.locator(".grid-textarea:focus").press("Control+Enter");
        await expect
          .poll(async () => getCatNavigationState(sharedFrame), { timeout: 30_000 })
          .toMatchObject({
            activeIsGridTextarea: true,
            activeInTargetCol: true,
            centeredOk: true,
          });
      }
    });

    test("Test B — 清除篩選回到編輯句", async () => {
      const row = sharedFrame.locator(".grid-data-row").nth(2);
      await row.locator(".col-target .grid-textarea").click();
      const edited = await getCatNavigationState(sharedFrame);
      expect(edited.activeSegId).toBeTruthy();

      await sharedFrame.locator("#sfModeFilter").click();
      await sharedFrame.locator("#sfInput").fill("zzz_unlikely_term_pw");
      await sharedFrame.locator("#btnSfClearNav").click();

      await expect
        .poll(async () => getCatNavigationState(sharedFrame), { timeout: 20_000 })
        .toMatchObject({
          activeSegId: edited.activeSegId,
          activeIsGridTextarea: true,
          centeredOk: true,
          fakeCaretVisible: false,
        });
    });

    test("Test C — 手動取消 stale nav", async () => {
      await sharedFrame.locator(".col-target .grid-textarea").first().click();
      await sharedFrame.locator(".grid-textarea:focus").press("Control+Enter");

      const other = sharedFrame.locator(".grid-data-row .col-target .grid-textarea").nth(1);
      await other.click({ force: true });
      const clickedSegId = await other.evaluate((el) => {
        const row = el.closest(".grid-data-row") as HTMLElement | null;
        return row?.dataset?.segId ?? null;
      });
      expect(clickedSegId).toBeTruthy();

      await expect
        .poll(async () => getCatNavigationState(sharedFrame), { timeout: 8_000 })
        .toMatchObject({ activeSegId: clickedSegId, activeIsGridTextarea: true });

      await expect
        .poll(async () => getVirtDebugState(sharedFrame), { timeout: 5_000 })
        .toMatchObject({ navAnchorLock: false });

      await expect
        .poll(async () => getCatNavigationState(sharedFrame), { timeout: 2_000 })
        .toMatchObject({ activeSegId: clickedSegId });
    });

    test("Test G — F8 已確認句 viewport 不甩窗", async () => {
      const remoteSegId = await jumpToDisplayIndex(sharedFrame, 3100);
      expect(remoteSegId).toBeTruthy();
      await sharedFrame
        .locator(`.grid-data-row[data-seg-id="${remoteSegId}"] .col-target .grid-textarea`)
        .click();
      await sharedFrame.locator(".grid-textarea:focus").press("End");
      await sharedFrame.locator(".grid-textarea:focus").press(" ");
      await dismissHighMatchGuard(sharedFrame, true);
      await dismissBlockingModals(sharedFrame);

      const f8SegId = await clickConfirmedTargetNearDisplay(sharedFrame, 17, 10);
      expect(f8SegId, "找不到前段已確認句段").toBeTruthy();
      expect((await getCatNavSnapshot(sharedFrame)).activeSegId).toBe(f8SegId);

      await sharedFrame.locator(".grid-textarea:focus").press("F8");

      await expect
        .poll(async () => getCatNavigationState(sharedFrame), { timeout: 5_000 })
        .toMatchObject({
          activeSegId: f8SegId,
          activeIsGridTextarea: true,
          activeInTargetCol: true,
        });

      const stable = await pollViewportStable(sharedFrame, 3000, 100);
      expect(stable.stable, `viewport 不穩定 changeCount=${stable.changeCount}`).toBe(true);

      const after = await getCatNavSnapshot(sharedFrame);
      expect(after.activeSegId).toBe(f8SegId);
      if (after.firstVisibleDisplayId != null) {
        expect(after.firstVisibleDisplayId).toBeLessThan(200);
      }
    });

    test("Test H — F8 後無來回拉扯", async () => {
      const remoteSegId = await jumpToDisplayIndex(sharedFrame, 3050);
      expect(remoteSegId).toBeTruthy();
      await sharedFrame
        .locator(`.grid-data-row[data-seg-id="${remoteSegId}"] .col-target .grid-textarea`)
        .click();
      await sharedFrame.locator(".grid-textarea:focus").press("End");

      const f8SegId = await clickConfirmedTargetNearDisplay(sharedFrame, 18, 10);
      expect(f8SegId).toBeTruthy();

      await sharedFrame.locator(".grid-textarea:focus").press("F8");

      const scrollChanges = await pollScrollTopChanges(sharedFrame, 3000, 100);
      expect(scrollChanges.changeCount, scrollChanges.scrollTops.join(",")).toBeLessThanOrEqual(2);

      const after = await getCatNavSnapshot(sharedFrame);
      expect(after.activeSegId).toBe(f8SegId);
      expect(after.virt?.navAnchorLock).toBe(false);
    });

    test("Test I — 手動點譯文格 viewport 穩定", async () => {
      await sharedFrame.locator(".col-target .grid-textarea").first().click();
      await sharedFrame.locator(".grid-textarea:focus").press("Control+Enter");
      await sharedFrame.locator("#editorGrid").evaluate((el) => {
        el.scrollTop += 400;
        el.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      const target = sharedFrame.locator(".grid-data-row .col-target .grid-textarea").nth(3);
      const clickedSegId = await target.evaluate((el) => {
        const row = el.closest(".grid-data-row") as HTMLElement | null;
        return row?.dataset?.segId ?? null;
      });
      await target.click();

      const stable = await pollViewportStable(sharedFrame, 2000, 100);
      expect(stable.stable).toBe(true);

      const after = await getCatNavSnapshot(sharedFrame);
      expect(after.activeSegId).toBe(clickedSegId);
      expect(after.fakeOffScreenTipVisible).toBe(false);

      await expect
        .poll(async () => getCatNavigationState(sharedFrame), { timeout: 2_000 })
        .toMatchObject({ activeSegId: clickedSegId });
    });

    test("Test E — Ctrl+F 聚焦 sfInput", async () => {
      await sharedFrame.locator(".col-target .grid-textarea").first().click();
      await sharedFrame.locator("body").press("Control+f");
      await expect(sharedFrame.locator("#sfInput")).toBeFocused();
      await sharedFrame.locator("#sfInput").fill("pw");
      await expect(sharedFrame.locator("#sfInput")).toBeFocused();
    });
  });
});
