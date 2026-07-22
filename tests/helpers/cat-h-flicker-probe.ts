import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FrameLocator } from "@playwright/test";

export type GridBodyMutationProbe = {
  childListEvents: number;
  addedRows: number;
  removedRows: number;
  focusIn: number;
  focusOut: number;
  lastActiveIsTarget: boolean;
};

/** 產生去識別化合成 mqxliff（僅測試用，不含客戶內容）。 */
export function writeSyntheticMqxliff(segmentCount: number, opts?: { confirmedEvery?: number }): string {
  const confirmedEvery = opts?.confirmedEvery ?? 3;
  const units: string[] = [];
  for (let i = 1; i <= segmentCount; i++) {
    const confirmed = i % confirmedEvery === 0;
    const src = `Synthetic source line ${i} unique token ALPHA${i}`;
    const tgt = confirmed
      ? `合成譯文 ${i} token BETA${i}`
      : `草稿譯文 ${i} token BETA${i}`;
    units.push(`      <trans-unit id="${i}" mq:unitId="u${i}">
        <source>${src}</source>
        <target${confirmed ? ' state="translated"' : ""}>${tgt}</target>
      </trans-unit>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:mq="MQXliff">
  <file source-language="en" target-language="zh-TW" datatype="plaintext" original="synthetic-${segmentCount}.mqxliff">
    <body>
${units.join("\n")}
    </body>
  </file>
</xliff>
`;
  const out = path.join(os.tmpdir(), `cat-h-flicker-synthetic-${segmentCount}-${Date.now()}.mqxliff`);
  fs.writeFileSync(out, xml, "utf8");
  return out;
}

export async function installGridBodyMutationProbe(frame: FrameLocator): Promise<void> {
  await frame.locator("body").evaluate(() => {
    const w = window as unknown as {
      __catHFlickerProbe?: GridBodyMutationProbe & { _mo?: MutationObserver; _onFocusIn?: EventListener; _onFocusOut?: EventListener };
    };
    const prev = w.__catHFlickerProbe;
    if (prev?._mo) prev._mo.disconnect();
    if (prev?._onFocusIn) document.removeEventListener("focusin", prev._onFocusIn, true);
    if (prev?._onFocusOut) document.removeEventListener("focusout", prev._onFocusOut, true);

    const probe: GridBodyMutationProbe & {
      _mo?: MutationObserver;
      _onFocusIn?: EventListener;
      _onFocusOut?: EventListener;
    } = {
      childListEvents: 0,
      addedRows: 0,
      removedRows: 0,
      focusIn: 0,
      focusOut: 0,
      lastActiveIsTarget: false,
    };

    const gridBody = document.getElementById("gridBody");
    if (gridBody) {
      probe._mo = new MutationObserver((records) => {
        for (const rec of records) {
          if (rec.type !== "childList") continue;
          probe.childListEvents += 1;
          for (const n of Array.from(rec.addedNodes)) {
            if (n instanceof HTMLElement && n.classList.contains("grid-data-row")) probe.addedRows += 1;
          }
          for (const n of Array.from(rec.removedNodes)) {
            if (n instanceof HTMLElement && n.classList.contains("grid-data-row")) probe.removedRows += 1;
          }
        }
      });
      probe._mo.observe(gridBody, { childList: true });
    }

    probe._onFocusIn = (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t?.classList?.contains("grid-textarea")) probe.focusIn += 1;
    };
    probe._onFocusOut = (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t?.classList?.contains("grid-textarea")) probe.focusOut += 1;
    };
    document.addEventListener("focusin", probe._onFocusIn, true);
    document.addEventListener("focusout", probe._onFocusOut, true);
    w.__catHFlickerProbe = probe;
  });
}

export async function resetGridBodyMutationProbe(frame: FrameLocator): Promise<void> {
  await frame.locator("body").evaluate(() => {
    const probe = (window as unknown as { __catHFlickerProbe?: GridBodyMutationProbe }).__catHFlickerProbe;
    if (!probe) return;
    probe.childListEvents = 0;
    probe.addedRows = 0;
    probe.removedRows = 0;
    probe.focusIn = 0;
    probe.focusOut = 0;
    probe.lastActiveIsTarget = false;
  });
}

export async function readGridBodyMutationProbe(frame: FrameLocator): Promise<GridBodyMutationProbe> {
  return frame.locator("body").evaluate(() => {
    const probe = (window as unknown as { __catHFlickerProbe?: GridBodyMutationProbe }).__catHFlickerProbe;
    const active = document.activeElement as HTMLElement | null;
    const lastActiveIsTarget = !!(
      active &&
      active.classList.contains("grid-textarea") &&
      active.closest(".col-target")
    );
    if (!probe) {
      return {
        childListEvents: 0,
        addedRows: 0,
        removedRows: 0,
        focusIn: 0,
        focusOut: 0,
        lastActiveIsTarget,
      };
    }
    return {
      childListEvents: probe.childListEvents,
      addedRows: probe.addedRows,
      removedRows: probe.removedRows,
      focusIn: probe.focusIn,
      focusOut: probe.focusOut,
      lastActiveIsTarget,
    };
  });
}

/** 跳焦點後觀察一段時間，回傳期間內的累計重建量。 */
export async function sampleProbeAfterMs(
  frame: FrameLocator,
  ms: number,
): Promise<GridBodyMutationProbe> {
  await frame.locator("body").evaluate(
    (waitMs) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), waitMs);
      }),
    ms,
  );
  return readGridBodyMutationProbe(frame);
}
