import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appPath = resolve(process.cwd(), "cat-tool/app.js");
const appSource = readFileSync(appPath, "utf8");

function sliceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return appSource.slice(start, end);
}

describe("CAT 開檔句段單次載入契約", () => {
  const workflowLoader = sliceBetween(
    "async function _loadFileWorkflowContext(fileId, opts)",
    "async function _loadViewWorkflowContext",
  );
  const openEditor = sliceBetween(
    "async function openEditor(fileId, opts)",
    "function renderEditorSegments()",
  );

  it("開檔前的 Workflow metadata 載入略過句段列號查詢", () => {
    expect(openEditor).toContain(
      "await _loadFileWorkflowContext(fileId, { loadLineNoCache: false });",
    );
    expect(workflowLoader).toContain(
      "if (loadLineNoCache) await _buildFullListLineNoCacheForFile(fileId);",
    );
  });

  it("openEditor 只直接載入一輪句段", () => {
    const calls =
      openEditor.match(/DBService\.getSegmentsByFile\(fileId\)/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("主載入完成後以同一批句段建立列號快取", () => {
    const fetchAt = openEditor.indexOf(
      "currentSegmentsList = await DBService.getSegmentsByFile(fileId);",
    );
    const cacheAt = openEditor.indexOf(
      "_buildFullListLineNoCache(currentSegmentsList);",
    );
    const reconcileAt = openEditor.indexOf(
      "reconcileSegmentWfConsistencyOnLoad(currentSegmentsList);",
    );

    expect(fetchAt).toBeGreaterThanOrEqual(0);
    expect(cacheAt).toBeGreaterThan(fetchAt);
    expect(reconcileAt).toBeGreaterThan(cacheAt);
  });

  it("非開檔的 Workflow 刷新仍保留列號快取重建", () => {
    expect(appSource).toContain(
      "await _loadFileWorkflowContext(currentFileId);",
    );
  });
});
