import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "cat-workflow-context-load.js"), "utf8");
const sandbox = { window: {}, globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const api = sandbox.window.CatWorkflowContextLoad || sandbox.globalThis.CatWorkflowContextLoad;

describe("CatWorkflowContextLoad", () => {
  it("team mode without stages uses empty_ok (no ensure)", () => {
    expect(api.resolveWorkflowStagesLoadPlan({ isTeamMode: true, existingStages: [] }))
      .toEqual({ action: "empty_ok", stages: [] });
  });

  it("classifies loading / error / empty / ready", () => {
    expect(api.classifyWorkflowLoadState({ loading: true })).toBe("loading");
    expect(api.classifyWorkflowLoadState({ error: true })).toBe("error");
    expect(api.classifyWorkflowLoadState({ stages: [] })).toBe("empty");
    expect(api.classifyWorkflowLoadState({ stages: [{ id: "1" }] })).toBe("ready");
  });

  it("blocks operate while loading/error or file mismatch", () => {
    expect(api.canOperateWorkflowContext({ loadState: "loading" })).toBe(false);
    expect(api.canOperateWorkflowContext({ loadState: "error" })).toBe(false);
    expect(api.canOperateWorkflowContext({
      loadState: "ready",
      expectedFileId: "A",
      loadedFileId: "B",
    })).toBe(false);
    expect(api.canOperateWorkflowContext({ loadState: "empty" })).toBe(true);
  });

  it("rejects stale load apply when seq or file mismatches", () => {
    expect(api.shouldApplyWorkflowLoadResult({
      requestSeq: 1,
      latestSeq: 2,
      expectedFileId: "A",
      resultFileId: "A",
    })).toBe(false);
    expect(api.shouldApplyWorkflowLoadResult({
      requestSeq: 2,
      latestSeq: 2,
      expectedFileId: "B",
      resultFileId: "A",
    })).toBe(false);
    expect(api.shouldApplyWorkflowLoadResult({
      requestSeq: 3,
      latestSeq: 3,
      expectedFileId: "B",
      resultFileId: "B",
    })).toBe(true);
  });
});
