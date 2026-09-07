import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(join(root, "cat-tool/js/cat-workflow-context-load.js"), "utf8");
const sandbox: { CatWorkflowContextLoad?: {
  resolveWorkflowStagesLoadPlan: (input: {
    isTeamMode: boolean;
    existingStages: unknown[];
  }) => { action: string; stages: unknown[] };
  classifyWorkflowLoadState: (input: {
    error?: boolean;
    loading?: boolean;
    stages?: unknown[];
  }) => string;
}; globalThis: unknown } = { globalThis: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const api = sandbox.CatWorkflowContextLoad!;

describe("cat-workflow-context-load", () => {
  it("uses existing stages without ensure in team mode", () => {
    const plan = api.resolveWorkflowStagesLoadPlan({
      isTeamMode: true,
      existingStages: [{ id: "1", stageKind: "prep" }],
    });
    expect(plan.action).toBe("use_existing");
    expect(plan.stages).toHaveLength(1);
  });

  it("does not request ensure when team mode has no stages", () => {
    const plan = api.resolveWorkflowStagesLoadPlan({
      isTeamMode: true,
      existingStages: [],
    });
    expect(plan.action).toBe("empty_ok");
  });

  it("allows local ensure when not team mode and empty", () => {
    const plan = api.resolveWorkflowStagesLoadPlan({
      isTeamMode: false,
      existingStages: [],
    });
    expect(plan.action).toBe("ensure_local");
  });

  it("classifies error vs empty vs ready", () => {
    expect(api.classifyWorkflowLoadState({ error: true, stages: [] })).toBe("error");
    expect(api.classifyWorkflowLoadState({ loading: true, stages: [] })).toBe("loading");
    expect(api.classifyWorkflowLoadState({ stages: [] })).toBe("empty");
    expect(api.classifyWorkflowLoadState({ stages: [{ id: 1 }] })).toBe("ready");
  });
});
