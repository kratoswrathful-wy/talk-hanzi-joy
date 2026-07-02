import type { FrameLocator, Page } from "@playwright/test";

export function catFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="CAT 個人離線版"], iframe[src*="/cat/"]');
}

export async function enableCatNavDebug(frame: FrameLocator) {
  await frame.locator("body").evaluate(() => {
    localStorage.setItem("catNavDebug", "1");
  });
}
