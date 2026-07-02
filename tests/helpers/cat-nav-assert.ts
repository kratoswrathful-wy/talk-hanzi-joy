import type { FrameLocator } from "@playwright/test";

export type CatNavigationState = {
  activeIsGridTextarea: boolean;
  activeInTargetCol: boolean;
  activeSegId: string | null;
  rowCenterDeltaPx: number | null;
  centeredOk: boolean;
  fakeCaretVisible: boolean;
};

export type VirtDebugState = {
  enabled?: boolean;
  anchorSegId?: string | null;
  navAnchorLock?: boolean;
  navAnchorBlock?: string;
  lastStartIdx?: number;
  lastEndIdx?: number;
} | null;

export type CatNavSnapshot = CatNavigationState & {
  savedFakeCaretSegId: string | null;
  fakeOffScreenTipVisible: boolean;
  fakeOffScreenTipText: string;
  virt: VirtDebugState;
  scrollTop: number;
  firstVisibleDisplayId: number | null;
  firstVisibleSegId: string | null;
};

export type ViewportStableResult = {
  stable: boolean;
  changeCount: number;
  samples: Array<{ scrollTop: number; firstVisibleSegId: string | null }>;
};

function measureRowCenterDeltaPxInFrame(segId: string | null): number | null {
  if (!segId) return null;
  const row = document.querySelector(`.grid-data-row[data-seg-id="${CSS.escape(String(segId))}"]`);
  const gridEl = document.getElementById("editorGrid");
  if (!row || !gridEl) return null;
  const rb = row.getBoundingClientRect();
  const gb = gridEl.getBoundingClientRect();
  return Math.round(rb.top + rb.bottom) / 2 - (gb.top + gb.bottom) / 2;
}

function readActiveNavigationState(): CatNavigationState {
  const active = document.activeElement as HTMLElement | null;
  const activeIsGridTextarea = !!(
    active &&
    active.classList.contains("grid-textarea") &&
    active.isContentEditable
  );
  const activeRow = active?.closest?.(".grid-data-row") as HTMLElement | null;
  const activeSegId = activeRow?.dataset?.segId ?? null;
  const activeInTargetCol = !!active?.closest?.(".col-target");
  const rowCenterDeltaPx = measureRowCenterDeltaPxInFrame(activeSegId);
  const centeredOk = rowCenterDeltaPx != null && Math.abs(rowCenterDeltaPx) <= 16;
  const fakeCaretEl = document.querySelector(".cat-fake-caret:not(.hidden)");
  const fakeCaretVisible = !!(
    fakeCaretEl &&
    fakeCaretEl instanceof HTMLElement &&
    fakeCaretEl.offsetParent !== null
  );
  return {
    activeIsGridTextarea,
    activeInTargetCol,
    activeSegId,
    rowCenterDeltaPx,
    centeredOk,
    fakeCaretVisible,
  };
}

export async function getCatNavigationState(frame: FrameLocator): Promise<CatNavigationState> {
  return frame.locator("body").evaluate(() => {
    function measureRowCenterDeltaPx(segId: string | null) {
      if (!segId) return null;
      const row = document.querySelector(`.grid-data-row[data-seg-id="${CSS.escape(String(segId))}"]`);
      const gridEl = document.getElementById("editorGrid");
      if (!row || !gridEl) return null;
      const rb = row.getBoundingClientRect();
      const gb = gridEl.getBoundingClientRect();
      return Math.round(rb.top + rb.bottom) / 2 - (gb.top + gb.bottom) / 2;
    }
    const active = document.activeElement as HTMLElement | null;
    const activeIsGridTextarea = !!(
      active &&
      active.classList.contains("grid-textarea") &&
      active.isContentEditable
    );
    const activeRow = active?.closest?.(".grid-data-row") as HTMLElement | null;
    const activeSegId = activeRow?.dataset?.segId ?? null;
    const activeInTargetCol = !!active?.closest?.(".col-target");
    const rowCenterDeltaPx = measureRowCenterDeltaPx(activeSegId);
    const centeredOk = rowCenterDeltaPx != null && Math.abs(rowCenterDeltaPx) <= 16;
    const fakeCaretEl = document.querySelector(".cat-fake-caret:not(.hidden)");
    const fakeCaretVisible = !!(
      fakeCaretEl &&
      fakeCaretEl instanceof HTMLElement &&
      fakeCaretEl.offsetParent !== null
    );
    return {
      activeIsGridTextarea,
      activeInTargetCol,
      activeSegId,
      rowCenterDeltaPx,
      centeredOk,
      fakeCaretVisible,
    };
  });
}

export async function getVirtDebugState(frame: FrameLocator): Promise<VirtDebugState> {
  return frame.locator("body").evaluate(() => {
    const g = (window as unknown as { CatVirtGrid?: { getDebugState?: () => unknown } }).CatVirtGrid;
    return (g?.getDebugState?.() as VirtDebugState) ?? null;
  });
}

export async function getCatNavSnapshot(frame: FrameLocator): Promise<CatNavSnapshot> {
  return frame.locator("body").evaluate(() => {
    function measureRowCenterDeltaPx(segId: string | null) {
      if (!segId) return null;
      const row = document.querySelector(`.grid-data-row[data-seg-id="${CSS.escape(String(segId))}"]`);
      const gridEl = document.getElementById("editorGrid");
      if (!row || !gridEl) return null;
      const rb = row.getBoundingClientRect();
      const gb = gridEl.getBoundingClientRect();
      return Math.round(rb.top + rb.bottom) / 2 - (gb.top + gb.bottom) / 2;
    }
    const active = document.activeElement as HTMLElement | null;
    const activeIsGridTextarea = !!(
      active &&
      active.classList.contains("grid-textarea") &&
      active.isContentEditable
    );
    const activeRow = active?.closest?.(".grid-data-row") as HTMLElement | null;
    const activeSegId = activeRow?.dataset?.segId ?? null;
    const activeInTargetCol = !!active?.closest?.(".col-target");
    const rowCenterDeltaPx = measureRowCenterDeltaPx(activeSegId);
    const centeredOk = rowCenterDeltaPx != null && Math.abs(rowCenterDeltaPx) <= 16;
    const fakeCaretEl = document.querySelector(".cat-fake-caret:not(.hidden)");
    const fakeCaretVisible = !!(
      fakeCaretEl &&
      fakeCaretEl instanceof HTMLElement &&
      fakeCaretEl.offsetParent !== null
    );
    const tipEl = document.querySelector(".cat-fake-caret-scroll-tip:not(.hidden)");
    const fakeOffScreenTipText = tipEl?.textContent?.trim() ?? "";
    const fakeOffScreenTipVisible =
      !!tipEl && fakeOffScreenTipText.includes("暫存游標");
    const firstRow = document.querySelector(".grid-data-row") as HTMLElement | null;
    const firstVisibleSegId = firstRow?.dataset?.segId ?? null;
    const idText = firstRow?.querySelector(".col-id")?.textContent?.trim() ?? "";
    const firstVisibleDisplayId = idText ? parseInt(idText, 10) : null;
    const scrollEl = document.getElementById("editorGrid");
    const g = (window as unknown as { CatVirtGrid?: { getDebugState?: () => unknown } }).CatVirtGrid;
    return {
      activeIsGridTextarea,
      activeInTargetCol,
      activeSegId,
      rowCenterDeltaPx,
      centeredOk,
      fakeCaretVisible,
      savedFakeCaretSegId: null,
      fakeOffScreenTipVisible,
      fakeOffScreenTipText,
      virt: (g?.getDebugState?.() as VirtDebugState) ?? null,
      scrollTop: scrollEl?.scrollTop ?? 0,
      firstVisibleDisplayId: Number.isFinite(firstVisibleDisplayId) ? firstVisibleDisplayId : null,
      firstVisibleSegId,
    };
  });
}

export async function pollViewportStable(
  frame: FrameLocator,
  ms = 2000,
  interval = 100,
): Promise<ViewportStableResult> {
  const samples: Array<{ scrollTop: number; firstVisibleSegId: string | null }> = [];
  const end = Date.now() + ms;
  let lastKey = "";
  let changeCount = 0;

  while (Date.now() < end) {
    const sample = await frame.locator("body").evaluate(() => {
      const scrollEl = document.getElementById("editorGrid");
      const firstRow = document.querySelector(".grid-data-row") as HTMLElement | null;
      return {
        scrollTop: scrollEl?.scrollTop ?? 0,
        firstVisibleSegId: firstRow?.dataset?.segId ?? null,
      };
    });
    samples.push(sample);
    const key = `${sample.scrollTop}|${sample.firstVisibleSegId ?? ""}`;
    if (lastKey && key !== lastKey) changeCount += 1;
    lastKey = key;
    await new Promise((r) => setTimeout(r, interval));
  }

  return { stable: changeCount <= 2, changeCount, samples };
}

export async function pollScrollTopChanges(
  frame: FrameLocator,
  ms = 3000,
  interval = 100,
): Promise<{ changeCount: number; scrollTops: number[] }> {
  const scrollTops: number[] = [];
  const end = Date.now() + ms;
  let last = -1;
  let changeCount = 0;
  while (Date.now() < end) {
    const scrollTop = await frame.locator("#editorGrid").evaluate((el) => el.scrollTop);
    scrollTops.push(scrollTop);
    if (last >= 0 && scrollTop !== last) changeCount += 1;
    last = scrollTop;
    await new Promise((r) => setTimeout(r, interval));
  }
  return { changeCount, scrollTops };
}

export async function dismissHighMatchGuard(frame: FrameLocator, acceptEdit = true) {
  const modal = frame.locator("#highMatchGuardModal:not(.hidden)");
  if (await modal.isVisible().catch(() => false)) {
    const btn = acceptEdit ? "#btnHighMatchGuardOk" : "#btnHighMatchGuardCancel";
    await frame.locator(btn).click();
    await frame.locator("#highMatchGuardModal.hidden").waitFor({ state: "attached", timeout: 10_000 });
  }
}

/** 關閉擋住點擊的通用確認（例如 Workflow「檔案準備中」）。 */
export async function dismissCatGenericConfirm(frame: FrameLocator, accept = false) {
  const modal = frame.locator("#catGenericConfirmModal:not(.hidden)");
  if (await modal.isVisible().catch(() => false)) {
    const btn = accept ? "#btnCatGenericConfirmOk" : "#btnCatGenericConfirmCancel";
    await frame.locator(btn).click();
    await frame.locator("#catGenericConfirmModal.hidden").waitFor({ state: "attached", timeout: 10_000 });
  }
}

export async function dismissBlockingModals(frame: FrameLocator) {
  await dismissHighMatchGuard(frame, true);
  await dismissCatGenericConfirm(frame, false);
}

export async function jumpToDisplayIndex(frame: FrameLocator, displayId: number) {
  await dismissBlockingModals(frame);
  await frame.locator("#btnJumpToSegmentToolbar").click();
  await frame.locator("#catGenericPromptModal:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });
  await frame.locator("#catGenericPromptInput").fill(String(displayId));
  await frame.locator("#btnCatGenericPromptOk").click();
  await frame.locator("#catGenericPromptModal.hidden").waitFor({ state: "attached", timeout: 10_000 });

  const row = frame.locator(".grid-data-row").filter({
    has: frame.locator(".col-id", { hasText: new RegExp(`^${displayId}$`) }),
  });
  await row.first().waitFor({ state: "visible", timeout: 30_000 });
  await pollViewportStable(frame, 2000, 80);
  return row.first().getAttribute("data-seg-id");
}

export async function scrollToDisplayIndex(
  frame: FrameLocator,
  displayId: number,
): Promise<string | null> {
  const inEditor = await frame.locator("#btnJumpToSegmentToolbar").isVisible().catch(() => false);
  if (inEditor) {
    return jumpToDisplayIndex(frame, displayId);
  }
  return frame.locator("body").evaluate(async (targetDisplayId) => {
    const grid = document.getElementById("editorGrid");
    if (!grid) return null;

    const readFirstDisplayId = () => {
      const cell = document.querySelector(".grid-data-row .col-id");
      const n = parseInt(cell?.textContent?.trim() || "0", 10);
      return Number.isFinite(n) ? n : 0;
    };

    const findVisibleSegId = () => {
      const rows = document.querySelectorAll(".grid-data-row");
      for (const row of rows) {
        const id = parseInt(row.querySelector(".col-id")?.textContent?.trim() || "0", 10);
        if (id === targetDisplayId) {
          return (row as HTMLElement).dataset.segId ?? null;
        }
      }
      return null;
    };

    for (let attempt = 0; attempt < 60; attempt++) {
      const hit = findVisibleSegId();
      if (hit) {
        const row = document.querySelector(`.grid-data-row[data-seg-id="${CSS.escape(hit)}"]`);
        row?.scrollIntoView({ block: "center", behavior: "auto" });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return hit;
      }
      const first = readFirstDisplayId();
      const delta = targetDisplayId - first;
      const step = Math.max(200, Math.min(4000, Math.abs(delta) * 48));
      grid.scrollTop = Math.max(0, grid.scrollTop + (delta > 0 ? step : -step));
      grid.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 16));
    }
    return findVisibleSegId();
  }, displayId);
}

export async function clickTargetTextareaAtDisplay(
  frame: FrameLocator,
  displayId: number,
): Promise<string | null> {
  const segId = await scrollToDisplayIndex(frame, displayId);
  if (!segId) return null;
  const row = frame.locator(`.grid-data-row[data-seg-id="${segId}"]`);
  await row.locator(".col-target .grid-textarea").click();
  return segId;
}

export async function findConfirmedTargetSegId(
  frame: FrameLocator,
  minDisplay = 1,
  maxDisplay = 80,
): Promise<string | null> {
  return frame.locator("body").evaluate(
    ({ minDisplay, maxDisplay }) => {
      const rows = document.querySelectorAll(".grid-data-row.row-bg-confirmed");
      for (const row of rows) {
        const id = parseInt(row.querySelector(".col-id")?.textContent?.trim() || "0", 10);
        if (id >= minDisplay && id <= maxDisplay) {
          return (row as HTMLElement).dataset.segId ?? null;
        }
      }
      for (const row of rows) {
        const id = parseInt(row.querySelector(".col-id")?.textContent?.trim() || "0", 10);
        if (id > 0 && id < 500) return (row as HTMLElement).dataset.segId ?? null;
      }
      return null;
    },
    { minDisplay, maxDisplay },
  );
}

/** 跳到 display 附近並點已確認句段譯文格；回傳 segId。 */
export async function clickConfirmedTargetNearDisplay(
  frame: FrameLocator,
  centerDisplay: number,
  radius = 10,
): Promise<string | null> {
  await jumpToDisplayIndex(frame, centerDisplay);
  await new Promise((r) => setTimeout(r, 400));

  let segId = await findConfirmedTargetSegId(frame, centerDisplay - radius, centerDisplay + radius);
  if (!segId) {
    for (const probe of [1, 50, 100, 200]) {
      if (probe === centerDisplay) continue;
      await jumpToDisplayIndex(frame, probe);
      await new Promise((r) => setTimeout(r, 300));
      segId = await findConfirmedTargetSegId(frame, 1, probe + 50);
      if (segId) break;
    }
  }
  if (!segId) return null;

  await frame
    .locator(`.grid-data-row[data-seg-id="${segId}"] .col-target .grid-textarea`)
    .click();
  return segId;
}

export function formatSnapshot(snapshot: CatNavSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
