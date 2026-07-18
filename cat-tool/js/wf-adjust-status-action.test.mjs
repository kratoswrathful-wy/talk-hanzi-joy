import { describe, expect, it } from "vitest";
import {
  resolvePmAdjustStatusClickAction,
  formatWorkflowScopeSuffix,
  resolvePlaceholderApplyAction,
  shouldShowAdjustBulkForStage,
  resolveAdjustBulkRowKinds,
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
  it("未選人 → skip", () => {
    expect(resolvePlaceholderApplyAction({})).toBe("skip");
    expect(resolvePlaceholderApplyAction({ assigneeUserId: "" })).toBe("skip");
    expect(resolvePlaceholderApplyAction({ assigneeUserId: "  " })).toBe("skip");
  });

  it("已選人 → insert（狀態預設待開始亦可寫入）", () => {
    expect(resolvePlaceholderApplyAction({ assigneeUserId: "user-1" })).toBe("insert");
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
