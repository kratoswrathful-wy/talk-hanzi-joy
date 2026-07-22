import { test, expect, type FrameLocator } from "@playwright/test";
import fs from "node:fs";
import { openOfflineCatWithFile } from "./helpers/cat-offline-open";
import { dismissBlockingModals } from "./helpers/cat-nav-assert";
import {
  installGridBodyMutationProbe,
  resetGridBodyMutationProbe,
  sampleProbeAfterMs,
  writeSyntheticMqxliff,
} from "./helpers/cat-h-flicker-probe";

const MID_SEG_COUNT = 300;

async function findUnconfirmedDisplayAndClick(frame: FrameLocator): Promise<string | null> {
  return frame.locator("body").evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".grid-data-row")) as HTMLElement[];
    for (const row of rows) {
      const wf = row.dataset.wfState || "";
      const st = row.dataset.status || "";
      if (wf === "unconfirmed" || st === "draft" || st === "unconfirmed" || !row.classList.contains("confirmed")) {
        const ta = row.querySelector(".col-target .grid-textarea") as HTMLElement | null;
        if (ta && ta.contentEditable !== "false") {
          ta.click();
          return row.dataset.segId || null;
        }
      }
    }
    return null;
  });
}

async function ensureFilterModeWithTerm(frame: FrameLocator, term: string) {
  const filterBtn = frame.locator("#sfModeFilter");
  if (await filterBtn.count()) {
    await filterBtn.click();
  }
  await frame.locator("#sfInput").fill(term);
  // 等篩選套用：至少一列可見
  await expect
    .poll(async () => {
      return frame.locator("body").evaluate(() => {
        const rows = Array.from(document.querySelectorAll(".grid-data-row")) as HTMLElement[];
        return rows.filter((r) => r.style.display !== "none").length;
      });
    }, { timeout: 15_000 })
    .toBeGreaterThan(0);
}

test.describe("工項 H：確認／F4 後 #gridBody 不持續重建", () => {
  test("中檔（~300 句，非 virt）確認未確認句後 childList 一次到位且可打字", async ({ page }) => {
    const fixturePath = writeSyntheticMqxliff(MID_SEG_COUNT, { confirmedEvery: 4 });
    try {
      const frame = await openOfflineCatWithFile(page, {
        fixturePath,
        projectName: `[PW] H-flicker mid ${Date.now()}`,
        importTimeoutMs: 120_000,
        editorTimeoutMs: 90_000,
      });
      await dismissBlockingModals(frame);
      await expect
        .poll(async () => frame.locator("body").evaluate(() => !!(window as unknown as { CatVirtGrid?: { isEnabled?: () => boolean } }).CatVirtGrid?.isEnabled?.()), { timeout: 5_000 })
        .toBe(false);

      await installGridBodyMutationProbe(frame);
      const clicked = await findUnconfirmedDisplayAndClick(frame);
      expect(clicked).toBeTruthy();

      await resetGridBodyMutationProbe(frame);
      await frame.locator(".grid-textarea:focus, .col-target .grid-textarea").first().press("Control+Enter");

      await expect
        .poll(async () => {
          const st = await frame.locator("body").evaluate(() => {
            const active = document.activeElement as HTMLElement | null;
            return !!(active && active.classList.contains("grid-textarea") && active.closest(".col-target"));
          });
          return st;
        }, { timeout: 15_000 })
        .toBe(true);

      const after = await sampleProbeAfterMs(frame, 450);
      // 允許首次導覽至多一次視窗重建；禁止持續重建（多輪 childList）
      expect(after.childListEvents, `childListEvents=${after.childListEvents} added=${after.addedRows} removed=${after.removedRows}`).toBeLessThanOrEqual(2);
      expect(after.lastActiveIsTarget).toBe(true);
      // 焦點不應乒乓（focusin/out 爆炸）
      expect(after.focusIn + after.focusOut).toBeLessThanOrEqual(6);

      await frame.locator("body").evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !active.classList.contains("grid-textarea")) throw new Error("not on target");
        active.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: "x" }));
        document.execCommand("insertText", false, "x");
      });
      await expect
        .poll(async () =>
          frame.locator("body").evaluate(() => {
            const active = document.activeElement as HTMLElement | null;
            return active?.textContent?.includes("x") || false;
          }),
        )
        .toBe(true);
    } finally {
      try {
        fs.unlinkSync(fixturePath);
      } catch {
        /* ignore */
      }
    }
  });

  test("中檔篩選視圖 F4 全部取代後 childList 不持續重建", async ({ page }) => {
    const fixturePath = writeSyntheticMqxliff(MID_SEG_COUNT, { confirmedEvery: 5 });
    try {
      const frame = await openOfflineCatWithFile(page, {
        fixturePath,
        projectName: `[PW] H-flicker F4 ${Date.now()}`,
        importTimeoutMs: 120_000,
        editorTimeoutMs: 90_000,
      });
      await dismissBlockingModals(frame);
      await ensureFilterModeWithTerm(frame, "token");
      await frame.locator("#sfReplaceInput").fill("TOK");

      await installGridBodyMutationProbe(frame);
      await resetGridBodyMutationProbe(frame);
      await frame.locator("#sfReplaceInput").press("F4");

      // 等取代完成：進度或 toast／譯文變更
      await expect
        .poll(async () => {
          return frame.locator("body").evaluate(() => {
            const rows = Array.from(document.querySelectorAll(".grid-data-row .grid-textarea"));
            return rows.some((el) => (el.textContent || "").includes("TOK"));
          });
        }, { timeout: 30_000 })
        .toBe(true);

      const after = await sampleProbeAfterMs(frame, 500);
      expect(
        after.childListEvents,
        `F4 childListEvents=${after.childListEvents} added=${after.addedRows} removed=${after.removedRows}`,
      ).toBeLessThanOrEqual(2);
    } finally {
      try {
        fs.unlinkSync(fixturePath);
      } catch {
        /* ignore */
      }
    }
  });

  test("大檔（virt，≥850 句）確認未確認句後不持續 replaceChildren", async ({ page }) => {
    const fixturePath = writeSyntheticMqxliff(850, { confirmedEvery: 4 });
    try {
      const frame = await openOfflineCatWithFile(page, {
        fixturePath,
        projectName: `[PW] H-flicker virt ${Date.now()}`,
        importTimeoutMs: 180_000,
        editorTimeoutMs: 120_000,
      });
      await dismissBlockingModals(frame);
      await expect
        .poll(async () => frame.locator("body").evaluate(() => !!(window as unknown as { CatVirtGrid?: { isEnabled?: () => boolean } }).CatVirtGrid?.isEnabled?.()), { timeout: 10_000 })
        .toBe(true);

      await installGridBodyMutationProbe(frame);
      const clicked = await findUnconfirmedDisplayAndClick(frame);
      expect(clicked).toBeTruthy();
      await resetGridBodyMutationProbe(frame);
      await frame.locator(".col-target .grid-textarea").first().press("Control+Enter");

      await expect
        .poll(async () => {
          return frame.locator("body").evaluate(() => {
            const active = document.activeElement as HTMLElement | null;
            return !!(active && active.classList.contains("grid-textarea") && active.closest(".col-target"));
          });
        }, { timeout: 20_000 })
        .toBe(true);

      const after = await sampleProbeAfterMs(frame, 500);
      // virt 跳遠句可能一次 rebuild；禁止數百 ms 內反覆多輪
      expect(after.childListEvents, `virt childListEvents=${after.childListEvents}`).toBeLessThanOrEqual(3);
      expect(after.lastActiveIsTarget).toBe(true);
    } finally {
      try {
        fs.unlinkSync(fixturePath);
      } catch {
        /* ignore */
      }
    }
  });
});
