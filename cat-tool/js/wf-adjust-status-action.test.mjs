import { describe, expect, it } from "vitest";
import {
  resolvePmAdjustStatusClickAction,
  formatWorkflowScopeSuffix,
  resolvePlaceholderApplyAction,
  resolveUnassignedAdjustApplyAction,
  classifyWorkflowStageLoad,
  mapAdjustWorkflowStatusToStageStatus,
  missingWorkflowStageKinds,
  shouldEnsureFileWorkflowStages,
  mapStageStatusToAdjustWorkflowStatus,
  shouldShowAdjustBulkForStage,
  resolveAdjustBulkRowKinds,
  formatAdjustWorkflowStatusLabel,
  formatPlaceholderCreateConfirmLine,
  buildPlaceholderCreateConfirmMessage,
  needsPlaceholderCreateConfirm,
} from "./wf-adjust-status-action.js";

describe("resolvePmAdjustStatusClickAction", () => {
  it("prep 進行中 → prep-complete", () => {
    expect(resolvePmAdjustStatusClickAction({ prepActive: true })).toBe("prep-complete");
  });

  it("非 prep：一律 open-modal", () => {
    expect(resolvePmAdjustStatusClickAction({ prepActive: false })).toBe("open-modal");
    expect(resolvePmAdjustStatusClickAction()).toBe("open-modal");
  });
});

describe("formatWorkflowScopeSuffix（工項 E 整檔標示）", () => {
  it("整檔（無列範圍）→ （整檔）", () => {
    expect(formatWorkflowScopeSuffix({})).toBe("（整檔）");
    expect(formatWorkflowScopeSuffix({ lineStart: null, lineEnd: null })).toBe("（整檔）");
  });

  it("拆段 → （N–M 列）", () => {
    expect(formatWorkflowScopeSuffix({ lineStart: 1, lineEnd: 8 })).toBe("（1–8 列）");
  });

  it("scopeLabel 優先", () => {
    expect(formatWorkflowScopeSuffix({ scopeLabel: "對話", lineStart: 1, lineEnd: 2 })).toBe("（對話）");
  });
});

describe("resolvePlaceholderApplyAction", () => {
  it("未選人 → skip（不新建指派）", () => {
    expect(resolvePlaceholderApplyAction({})).toBe("skip");
    expect(resolvePlaceholderApplyAction({ assigneeUserId: "" })).toBe("skip");
    expect(resolvePlaceholderApplyAction({ assigneeUserId: "  " })).toBe("skip");
  });

  it("已選人 → insert（狀態預設待開始亦可寫入）", () => {
    expect(resolvePlaceholderApplyAction({ assigneeUserId: "user-1" })).toBe("insert");
  });
});

describe("未指派整檔狀態與載入分流", () => {
  it("未選人且狀態不同 → 只改步驟", () => {
    expect(
      resolveUnassignedAdjustApplyAction({
        wantedWfStatus: "completed",
        currentStageStatus: "pending",
      }),
    ).toBe("stage-only");
  });

  it("載入失敗不是空段落", () => {
    expect(classifyWorkflowStageLoad({ stages: [], error: new Error("denied") })).toBe("error");
    expect(classifyWorkflowStageLoad({ stages: [] })).toBe("empty");
  });

  it("三態對到步驟狀態", () => {
    expect(mapAdjustWorkflowStatusToStageStatus("assigned")).toBe("pending");
    expect(mapAdjustWorkflowStatusToStageStatus("in_progress")).toBe("active");
  });

  it("僅有翻譯步驟仍要補準備與審稿", () => {
    expect(missingWorkflowStageKinds([{ stageKind: "translate", status: "completed" }])).toEqual([
      "prep",
      "review",
    ]);
    expect(shouldEnsureFileWorkflowStages([{ stageKind: "translate" }])).toBe(true);
    expect(
      shouldEnsureFileWorkflowStages([
        { stageKind: "prep" },
        { stageKind: "translate" },
        { stageKind: "review" },
      ]),
    ).toBe(false);
  });

  it("未指派佔位列帶出目前步驟，不一律待開始", () => {
    expect(mapStageStatusToAdjustWorkflowStatus("active")).toBe("in_progress");
    expect(mapStageStatusToAdjustWorkflowStatus("completed")).toBe("completed");
    expect(mapStageStatusToAdjustWorkflowStatus("pending")).toBe("assigned");
  });
});

describe("shouldShowAdjustBulkForStage", () => {
  it("階段存在即顯示（含 0 筆指派）", () => {
    expect(shouldShowAdjustBulkForStage({ stageExists: true })).toBe(true);
    expect(shouldShowAdjustBulkForStage({ stageExists: false })).toBe(false);
  });
});

describe("resolveAdjustBulkRowKinds", () => {
  it("翻譯／審稿各成一排（順序固定）", () => {
    expect(
      resolveAdjustBulkRowKinds({ hasTranslateStage: true, hasReviewStage: true }),
    ).toEqual(["translate", "review"]);
  });

  it("僅有審稿時只一排", () => {
    expect(
      resolveAdjustBulkRowKinds({ hasTranslateStage: false, hasReviewStage: true }),
    ).toEqual(["review"]);
  });
});

describe("工項 G：佔位新建確認文案", () => {
  it("status 標籤", () => {
    expect(formatAdjustWorkflowStatusLabel("assigned")).toBe("待開始");
    expect(formatAdjustWorkflowStatusLabel("in_progress")).toBe("執行中");
    expect(formatAdjustWorkflowStatusLabel("completed")).toBe("完成");
  });

  it("確認行含階段／人員／範圍／狀態", () => {
    expect(
      formatPlaceholderCreateConfirmLine({
        stageKind: "review",
        assigneeName: "威儀",
        scopeText: "整檔",
        wfStatus: "in_progress",
      }),
    ).toBe("• 審稿 · 威儀 · 整檔 · 執行中");
  });

  it("有新建列才需確認", () => {
    expect(needsPlaceholderCreateConfirm([])).toBe(false);
    expect(
      needsPlaceholderCreateConfirm([{ stageKind: "review", assigneeName: "A" }]),
    ).toBe(true);
    expect(
      buildPlaceholderCreateConfirmMessage([
        { stageKind: "review", assigneeName: "A", scopeText: "整檔", wfStatus: "assigned" },
      ]),
    ).toContain("即將新建");
  });

  it("清空選人後不應再視為待新建", () => {
    expect(needsPlaceholderCreateConfirm(
      [].filter(() => false),
    )).toBe(false);
    expect(resolvePlaceholderApplyAction({ assigneeUserId: "" })).toBe("skip");
  });
});
