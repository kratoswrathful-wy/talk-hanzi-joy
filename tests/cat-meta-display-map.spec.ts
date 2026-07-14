import { test, expect } from "@playwright/test";
import { resolveCatFixture } from "./helpers/cat-fixtures";
import { openOfflineCatWithFile } from "./helpers/cat-offline-open";

const SMALL_FIXTURE = resolveCatFixture("small");

test.describe("CAT 欄位對應視窗（meta_display_config）", () => {
  test("可程式化開啟對應視窗並套用設定", async ({ page }) => {
    test.setTimeout(300_000);
    const frame = await openOfflineCatWithFile(page, {
      fixturePath: SMALL_FIXTURE,
      projectName: `[PW] meta-map ${Date.now()}`,
    });

    await expect
      .poll(async () => frame.locator(".grid-data-row").count(), { timeout: 60_000 })
      .toBeGreaterThan(0);

    const opened = await frame.locator("body").evaluate(async () => {
      const w = window as unknown as {
        MetaDisplayMapUi?: {
          open: (o: { fileId: string | number; segments?: unknown[] }) => Promise<void>;
        };
        CatRevTrackApi?: {
          getCurrentFileId?: () => string | number | null;
          getSegments?: () => unknown[];
        };
        MetaItemsCollector?: { summarizeMetaItemKinds?: (s: unknown[], n: number) => unknown[] };
      };
      const ui = w.MetaDisplayMapUi;
      const track = w.CatRevTrackApi;
      if (!ui || typeof ui.open !== "function") return { ok: false as const, reason: "no-MetaDisplayMapUi" };
      const fileId = track?.getCurrentFileId?.() ?? null;
      if (fileId == null) return { ok: false as const, reason: "no-fileId" };
      const segments = typeof track?.getSegments === "function" ? track.getSegments() : [];
      const metaCount = (segments || []).filter(
        (s) => Array.isArray((s as { metaItems?: unknown[] }).metaItems) && (s as { metaItems: unknown[] }).metaItems.length,
      ).length;
      await ui.open({ fileId, segments: segments || [] });
      return {
        ok: true as const,
        fileId: String(fileId),
        segCount: (segments || []).length,
        metaCount,
        collector: !!w.MetaItemsCollector,
      };
    });
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    expect(opened.metaCount, JSON.stringify(opened)).toBeGreaterThan(0);

    await frame.locator("#metaDisplayMapModal:not(.hidden)").waitFor({ state: "visible", timeout: 30_000 });
    const kindCount = await frame.locator(".meta-map-kind-row").count();
    expect(kindCount).toBeGreaterThan(0);

    const rows = frame.locator(".meta-map-kind-row");
    await rows.nth(0).locator('input[value="key"]').check();
    if (kindCount > 1) {
      await rows.nth(1).locator('input[value="extra"]').check();
    }

    await frame.locator("#btnMetaDisplayMapSave").click();
    await frame.locator("#metaDisplayMapModal.hidden").waitFor({ state: "attached", timeout: 30_000 });

    await expect
      .poll(
        async () =>
          frame.locator("body").evaluate(() => {
            const row = document.querySelector(".grid-data-row");
            if (!row) return false;
            const key0 = (row.querySelector(".col-key-0")?.textContent || "").trim();
            const hasChip = !!row.querySelector(".meta-extra-chip");
            const hasExtra = !!row.querySelector(".col-extra");
            return !!(key0 || hasChip || hasExtra);
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
  });
});
