import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login-as";

/**
 * 第 4 項 CAT 定向驗收：隔離庫 + 合成檔，不用正式案件或真實譯文。
 * PLAYWRIGHT_BACKEND_ERRORS_UI=1
 */
const ENABLED = process.env.PLAYWRIGHT_BACKEND_ERRORS_UI === "1";
const describeBackend = ENABLED ? test.describe : test.describe.skip;

function credPm(): { email: string; password: string } {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

function catFrame(page: Page): FrameLocator {
  return page.frameLocator(
    'iframe[title="CAT 團隊線上版"], iframe[title="CAT 個人離線版"], iframe[src*="/cat/"]',
  );
}

function syntheticXliff(opts: {
  original: string;
  units: Array<{ id: string; source: string; target: string }>;
}): string {
  const tus = opts.units
    .map(
      (u) => `      <trans-unit id="${u.id}">
        <source>${u.source}</source>
        <target>${u.target}</target>
      </trans-unit>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file original="${opts.original}" source-language="en-US" target-language="zh-TW" datatype="plaintext">
    <body>
${tus}
    </body>
  </file>
</xliff>
`;
}

async function dismissWfSessionIfNeeded(frame: FrameLocator) {
  const confirm = frame.locator("#btnWfSessionConfirm");
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  }
}

async function waitCatReady(page: Page) {
  const frame = catFrame(page);
  const stat = frame.locator("#statTBs");
  await expect(stat).toBeVisible({ timeout: 90_000 });
  await expect(stat).toHaveAttribute("data-load-state", /^(ready|empty|error)$/, { timeout: 60_000 });
  await expect.poll(async () => {
    return frame.locator("body").evaluate(() => {
      // db.js 為 const DBService，不在 window；與 tests/helpers/cat-bcd-assert.ts 相同取法。
      const DB = new Function(
        'try { return typeof DBService !== "undefined" ? DBService : null; } catch { return null; }',
      )() as { getProjects?: () => Promise<unknown> } | null;
      if (!DB || typeof DB.getProjects !== "function") return "no-db";
      return "has-db";
    });
  }, { timeout: 30_000 }).toBe("has-db");
  await expect.poll(async () => {
    return frame.locator("body").evaluate(async () => {
      const DB = new Function(
        'try { return typeof DBService !== "undefined" ? DBService : null; } catch { return null; }',
      )() as { getProjects?: () => Promise<unknown> } | null;
      if (!DB || typeof DB.getProjects !== "function") return "no-db";
      try {
        const rows = await DB.getProjects();
        return Array.isArray(rows) ? "ok" : "not-array";
      } catch (e) {
        return String(e);
      }
    });
  }, { timeout: 60_000 }).toBe("ok");
}

type SeededCat = {
  projectId: string;
  fileA: string;
  fileB: string;
  unitsA: Array<{ id: string; source: string; target: string }>;
};

async function seedSyntheticCat(page: Page): Promise<SeededCat> {
  const frame = catFrame(page);
  const stamp = Date.now();
  const unitsA = [
    { id: "1", source: `ISO-SRC-A1-${stamp}`, target: `ISO-TGT-A1-${stamp}` },
    { id: "2", source: `ISO-SRC-A2-${stamp}`, target: `ISO-TGT-A2-${stamp}` },
  ];
  const unitsB = [
    { id: "1", source: `ISO-SRC-B1-${stamp}`, target: `ISO-TGT-B1-${stamp}` },
    { id: "2", source: `ISO-SRC-B2-${stamp}`, target: `ISO-TGT-B2-${stamp}` },
  ];
  const xliffA = syntheticXliff({ original: "iso-a.txt", units: unitsA });
  const xliffB = syntheticXliff({ original: "iso-b.txt", units: unitsB });
  const seeded = await frame.locator("body").evaluate(
    async (_el, { xmlA, xmlB, name, unitsA, unitsB }) => {
      const DB = new Function(
        'try { return typeof DBService !== "undefined" ? DBService : null; } catch { return null; }',
      )() as {
        createProject: (n: string, s: string[], t: string[]) => Promise<string>;
        createFile: (
          projectId: string,
          fileName: string,
          buf: ArrayBuffer,
          src: string,
          tgt: string,
          osrc: string,
          otgt: string,
        ) => Promise<string>;
        addSegments: (rows: Record<string, unknown>[]) => Promise<number>;
      } | null;
      if (!DB) throw new Error("DBService missing");
      const projectId = await DB.createProject(name, ["en-US"], ["zh-TW"]);
      const toBuf = (xml: string) => {
        const bytes = new TextEncoder().encode(xml);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      };
      const fileA = await DB.createFile(projectId, "iso-a.xliff", toBuf(xmlA), "en-US", "zh-TW", "en-US", "zh-TW");
      const fileB = await DB.createFile(projectId, "iso-b.xliff", toBuf(xmlB), "en-US", "zh-TW", "en-US", "zh-TW");
      const segsFor = (fileId: string, units: Array<{ id: string; source: string; target: string }>) =>
        units.map((u, i) => ({
          fileId,
          sheetName: "Sheet1",
          rowIdx: i,
          sourceText: u.source,
          targetText: u.target,
          xliffTuId: u.id,
          globalId: i + 1,
          status: "",
        }));
      await DB.addSegments(segsFor(fileA, unitsA));
      await DB.addSegments(segsFor(fileB, unitsB));
      return { projectId, fileA, fileB };
    },
    { xmlA: xliffA, xmlB: xliffB, name: `ISO-BE-CAT-${stamp}`, unitsA, unitsB },
  );
  return { ...seeded, unitsA };
}

describeBackend("CAT backend-errors isolated", () => {
  test("T5 getTBs 失敗顯示載入失敗，不得當成 0 筆", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    await session.page.route("**/rest/v1/cat_tbs*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "tb_list_injected_fail" }),
      });
    });
    await session.page.goto("/cat/team");
    const frame = catFrame(session.page);
    const stat = frame.locator("#statTBs");
    await expect(stat).toBeVisible({ timeout: 90_000 });
    await expect(stat).toHaveAttribute("data-load-state", "error", { timeout: 30_000 });
    await expect(stat).toHaveText("載入失敗");
    await session.close();
  });

  test("T6 合成檔開檔、多檔進度、匯出產物、注入逾時", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const segmentGets: Array<{ url: string; startedAt: number; endedAt: number; status: number }> = [];
    await page.route("**/rest/v1/cat_segments*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const startedAt = Date.now();
      const response = await route.fetch();
      segmentGets.push({
        url: route.request().url(),
        startedAt,
        endedAt: Date.now(),
        status: response.status(),
      });
      await route.fulfill({ response });
    });

    const t0 = Date.now();
    await page.goto("/cat/team");
    await waitCatReady(page);
    const seeded = await seedSyntheticCat(page);
    const frame = catFrame(page);

    await page.goto(`/cat/team/files/${seeded.fileA}?p=${seeded.projectId}`);
    await dismissWfSessionIfNeeded(frame);
    await expect(frame.getByText(seeded.unitsA[0].source)).toBeVisible({ timeout: 60_000 });
    await expect(frame.getByText(seeded.unitsA[1].target)).toBeVisible();

    await page.unroute("**/rest/v1/cat_segments*");
    await page.route("**/rest/v1/cat_segments*", async (route) => {
      const url = route.request().url();
      if (route.request().method() === "GET" && url.includes(`file_id=eq.${seeded.fileB}`)) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "progress_injected_fail" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/cat/team/projects/${seeded.projectId}`);
    const cellA = frame.locator(`.file-progress-cell[data-file-id="${seeded.fileA}"]`);
    const cellB = frame.locator(`.file-progress-cell[data-file-id="${seeded.fileB}"]`);
    await expect(cellA).toBeVisible({ timeout: 60_000 });
    await expect(cellB).toBeVisible();
    await expect(cellB).toContainText("進度載入失敗", { timeout: 30_000 });
    await expect(cellA).not.toContainText("載入中", { timeout: 30_000 });
    await expect(cellA).not.toContainText("進度載入失敗");

    await page.unroute("**/rest/v1/cat_segments*");
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.goto(`/cat/team/files/${seeded.fileA}?p=${seeded.projectId}`);
    await dismissWfSessionIfNeeded(frame);
    await expect(frame.getByText(seeded.unitsA[0].source)).toBeVisible({ timeout: 60_000 });
    await frame.locator("#exportBtn").click();
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    expect(suggestedName.toLowerCase()).toMatch(/xliff|xlf/);
    const stream = await download.createReadStream();
    expect(stream, "匯出必須有可讀內容").toBeTruthy();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const xml = Buffer.concat(chunks).toString("utf8");
    expect(xml).toContain("<trans-unit");
    expect(xml).toContain(seeded.unitsA[0].source);
    expect(xml).toContain(seeded.unitsA[0].target);
    expect(xml).toContain(seeded.unitsA[1].target);
    expect((xml.match(/<trans-unit\b/g) || []).length).toBe(2);

    await page.route("**/rest/v1/cat_segments*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          code: "57014",
          message: "canceling statement due to statement timeout",
        }),
      });
    });
    let dialogText = "";
    page.once("dialog", async (dialog) => {
      dialogText = dialog.message();
      await dialog.accept();
    });
    const timeoutDownloads: string[] = [];
    page.on("download", (d) => {
      timeoutDownloads.push(d.suggestedFilename());
    });
    await frame.locator("#exportBtn").click();
    await expect.poll(() => dialogText, { timeout: 20_000 }).toMatch(/匯出逾時|發生錯誤/);
    expect(dialogText).not.toMatch(/已完成匯出/);
    expect(timeoutDownloads).toEqual([]);
    await expect(frame.locator("#exportBtn")).toHaveText("匯出檔案", { timeout: 15_000 });

    const wallMs = Date.now() - t0;
    console.log(
      JSON.stringify({
        case: "cat-isolated-T6",
        files: 2,
        segmentsPerFile: 2,
        segmentGets: segmentGets.length,
        maxOriginMs: segmentGets.length ? Math.max(...segmentGets.map((e) => e.endedAt - e.startedAt)) : 0,
        wallMs,
        note: "逐檔進度降低同時請求數；隔離小檔不能代表正式大檔，也不能直接宣稱總等待一定縮短。",
      }),
    );
    await session.close();
  });
});
