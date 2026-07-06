import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appJsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../cat-tool/app.js"
);
const appJs = readFileSync(appJsPath, "utf8");

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("CAT AI settings direct route hotfix (app.js contract)", () => {
  it("defines openAiSettingsView with identity wait and loadAiSettingsView", () => {
    const fn = sliceBetween(appJs, "async function openAiSettingsView()", "// ---- AI 設定 View ----");
    expect(fn).toContain("waitForTmsIdentityReady");
    expect(fn).toContain("switchView('viewAiSettings')");
    expect(fn).toContain("await loadAiSettingsView()");
  });

  it("restoreCatRouteFromSession uses openAiSettingsView for viewAiSettings", () => {
    const restore = sliceBetween(appJs, "async function restoreCatRouteFromSession()", "await restoreCatRouteFromSession()");
    const block = restore.match(/if \(view === 'viewAiSettings'\) \{[\s\S]*?return;\s*\}/);
    expect(block?.[0]).toContain("await openAiSettingsView()");
  });

  it("TMS_NAVIGATE_TO uses openAiSettingsView for viewAiSettings", () => {
    const idx = appJs.indexOf("event.data.type === 'TMS_NAVIGATE_TO'");
    expect(idx).toBeGreaterThanOrEqual(0);
    const chunk = appJs.slice(idx, idx + 2500);
    expect(chunk).toContain("view === 'viewAiSettings'");
    expect(chunk).toContain("await openAiSettingsView()");
  });

  it("applyTmsIdentityToUI refreshes AI settings when view is active", () => {
    const identity = sliceBetween(appJs, "function applyTmsIdentityToUI(payload)", "function showTmsProfileCard()");
    expect(identity).toContain("refreshAiSettingsViewIfActive()");
  });
});
