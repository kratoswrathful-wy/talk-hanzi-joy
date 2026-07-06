import { test, expect } from "@playwright/test";
import { resolveCatFixture } from "./helpers/cat-fixtures";
import {
  applyRowRangeFilterGroup,
  clearSearchFilterNav,
  expectCenteredOnSeg,
  expectWeightedWordCountUiHidden,
  focusTargetAtDisplay,
  focusTargetCell,
  getRowWfState,
  resolveReviewConfirmedSegmentForTranslator,
} from "./helpers/cat-bcd-assert";
import {
  dismissBlockingModals,
  getCatNavigationState,
  jumpToDisplayIndex,
} from "./helpers/cat-nav-assert";
import { assertVirtEnabled, openOfflineCatWithFile } from "./helpers/cat-offline-open";
const SMALL_FIXTURE = resolveCatFixture("small");

test.describe("BCD 波次驗收（sync 後 UI）", () => {
  test.describe("BCD-B — 加權字數 UI 停用", () => {
    test("編輯器：加權切換按鈕隱藏", async ({ page }) => {
      const frame = await openOfflineCatWithFile(page, {
        fixturePath: SMALL_FIXTURE,
        projectName: `[PW] BCD-B ${Date.now()}`,
        importTimeoutMs: 120_000,
        editorTimeoutMs: 120_000,
      });
      await dismissBlockingModals(frame);
      await expectWeightedWordCountUiHidden(frame);
    });
  });

  test.describe("BCD-C — 小檔清除篩選後置中", () => {
    test("非 virtual grid：清除篩選後錨點句段置中", async ({ page }) => {
      test.setTimeout(180_000);
      const frame = await openOfflineCatWithFile(page, {
        fixturePath: SMALL_FIXTURE,
        projectName: `[PW] BCD-C ${Date.now()}`,
        importTimeoutMs: 120_000,
        editorTimeoutMs: 120_000,
      });
      await assertVirtEnabled(frame, false);
      await dismissBlockingModals(frame);

      const anchorDisplay = 18;
      const anchorSegId = await jumpToDisplayIndex(frame, anchorDisplay);
      expect(anchorSegId, `句段 #${anchorDisplay} 應存在`).toBeTruthy();

      await applyRowRangeFilterGroup(frame, `${anchorDisplay - 2}-${anchorDisplay + 2}`);
      const filteredCount = await frame.locator(".grid-data-row").count();
      expect(filteredCount).toBeGreaterThan(0);
      expect(filteredCount).toBeLessThan(40);

      await focusTargetAtDisplay(frame, anchorDisplay);
      const beforeClear = await getCatNavigationState(frame);
      expect(beforeClear.activeSegId).toBe(anchorSegId);

      await clearSearchFilterNav(frame);

      await expectCenteredOnSeg(frame, anchorSegId!);
      const afterClear = await getCatNavigationState(frame);
      expect(afterClear.centeredOk).toBe(true);
      expect(Math.abs(afterClear.rowCenterDeltaPx ?? 999)).toBeLessThanOrEqual(16);
    });
  });

  test.describe("BCD-D — noop 確認後仍跳轉", () => {
    test("譯者於審稿確認句段 Ctrl+Enter：狀態不變、焦點跳下一句", async ({ page }) => {
      test.setTimeout(300_000);
      const frame = await openOfflineCatWithFile(page, {
        fixturePath: SMALL_FIXTURE,
        projectName: `[PW] BCD-D ${Date.now()}`,
        importTimeoutMs: 120_000,
        editorTimeoutMs: 120_000,
      });
      await dismissBlockingModals(frame);

      const prepared = await resolveReviewConfirmedSegmentForTranslator(frame, 17);
      expect(prepared.segId).toBeTruthy();

      const wfBefore = await getRowWfState(frame, prepared.segId);
      expect(wfBefore).toBe("review_confirmed");

      await focusTargetCell(frame, prepared.segId);

      const beforeNav = await getCatNavigationState(frame);
      expect(beforeNav.activeSegId).toBe(prepared.segId);

      await frame.locator(".grid-textarea:focus").press("Control+Enter");

      await expect
        .poll(async () => {
          const nav = await getCatNavigationState(frame);
          return nav.activeSegId;
        }, { timeout: 10_000 })
        .not.toBe(prepared.segId);

      const wfAfter = await getRowWfState(frame, prepared.segId);
      expect(wfAfter).toBe("review_confirmed");

      const afterNav = await getCatNavigationState(frame);
      expect(afterNav.activeIsGridTextarea).toBe(true);
      expect(afterNav.activeInTargetCol).toBe(true);
    });
  });
});
