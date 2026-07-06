import { test, expect } from "@playwright/test";
import { resolveCatFixture } from "./helpers/cat-fixtures";
import { openOfflineCatWithFile } from "./helpers/cat-offline-open";

/**
 * CAT 彈窗狀態 bridge 回歸：__catAgent.modals.getMqRoleState /
 * getPrepConfirmState（比照 getProgress 唯讀模式）。
 */
const SMALL_FIXTURE = resolveCatFixture("small");

test.describe("CAT 彈窗狀態 bridge（modals）", () => {
  test("閒置時兩 API 皆 ok 且 visible=false", async ({ page }) => {
    test.setTimeout(240_000);
    const frame = await openOfflineCatWithFile(page, {
      fixturePath: SMALL_FIXTURE,
      projectName: `[PW] modals-idle ${Date.now()}`,
    });

    const result = await frame.locator("body").evaluate(() => {
      const agent = (window as unknown as {
        __catAgent: {
          modals: {
            getMqRoleState: () => { ok: boolean; error?: string; data?: { visible?: boolean } };
            getPrepConfirmState: () => { ok: boolean; error?: string; data?: { visible?: boolean } };
          };
        };
      }).__catAgent;
      return {
        mq: agent.modals.getMqRoleState(),
        prep: agent.modals.getPrepConfirmState(),
      };
    });

    expect(result.mq.ok, result.mq.error).toBe(true);
    expect(result.mq.data?.visible).toBe(false);
    expect(result.prep.ok, result.prep.error).toBe(true);
    expect(result.prep.data?.visible).toBe(false);
  });

  test("模擬準備完成確認彈窗 DOM 時 getPrepConfirmState 讀到標題", async ({ page }) => {
    test.setTimeout(240_000);
    const frame = await openOfflineCatWithFile(page, {
      fixturePath: SMALL_FIXTURE,
      projectName: `[PW] modals-prep ${Date.now()}`,
    });

    await frame.locator("body").evaluate(() => {
      const modal = document.getElementById("catGenericConfirmModal");
      const titleEl = document.getElementById("catGenericConfirmTitle");
      const msgEl = document.getElementById("catGenericConfirmMsg");
      if (modal) modal.classList.remove("hidden");
      if (titleEl) {
        titleEl.textContent = "準備完成";
        titleEl.classList.remove("hidden");
      }
      if (msgEl) msgEl.textContent = "仍要標記準備完成嗎？";
    });

    const prep = await frame.locator("body").evaluate(() => {
      const agent = (window as unknown as {
        __catAgent: {
          modals: {
            getPrepConfirmState: () => {
              ok: boolean;
              data?: {
                visible?: boolean;
                title?: string;
                isPrepCompleteConfirm?: boolean;
              };
            };
          };
        };
      }).__catAgent;
      return agent.modals.getPrepConfirmState();
    });

    expect(prep.ok).toBe(true);
    expect(prep.data?.visible).toBe(true);
    expect(prep.data?.title).toBe("準備完成");
    expect(prep.data?.isPrepCompleteConfirm).toBe(true);
  });
});
