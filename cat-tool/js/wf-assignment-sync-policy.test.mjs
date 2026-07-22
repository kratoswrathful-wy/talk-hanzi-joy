import { describe, expect, it } from "vitest";
import {
  resolveRequestedSyncWorkflowStatus,
  resolveEffectiveUpsertWorkflowStatus,
  shouldWriteTranslateStatusOnReviewUnlock,
  workflowStatusRank,
} from "./wf-assignment-sync-policy.js";

describe("wf-assignment-sync-policy：sync 建議狀態", () => {
  it("taskCompleted 為真 → completed", () => {
    expect(
      resolveRequestedSyncWorkflowStatus({
        stageStatus: "active",
        taskCompleted: true,
      }),
    ).toBe("completed");
  });

  it("stage 已 completed（即使 LMS 尚未 taskCompleted）→ completed，避免洗回 assigned", () => {
    expect(
      resolveRequestedSyncWorkflowStatus({
        stageStatus: "completed",
        taskCompleted: false,
      }),
    ).toBe("completed");
  });

  it("stage 非 completed 且未完成任務 → assigned", () => {
    expect(
      resolveRequestedSyncWorkflowStatus({
        stageStatus: "active",
        taskCompleted: false,
      }),
    ).toBe("assigned");
  });

  it("檔案重開：stage 從 completed 改回 active 後，sync 建議 assigned（無既有高階狀態）", () => {
    expect(
      resolveRequestedSyncWorkflowStatus({
        stageStatus: "active",
        taskCompleted: false,
      }),
    ).toBe("assigned");
  });

  it("既有 in_progress 時 sync 建議維持 in_progress（不得回落 assigned）", () => {
    expect(
      resolveRequestedSyncWorkflowStatus({
        stageStatus: "active",
        taskCompleted: false,
        existingStatus: "in_progress",
      }),
    ).toBe("in_progress");
  });
});

describe("wf-assignment-sync-policy：upsert 防降級與反向路徑", () => {
  it("stage 仍 completed 時，禁止把 completed 指派降成 assigned", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "completed",
        existingStatus: "completed",
        requestedStatus: "assigned",
      }),
    ).toBe("completed");
  });

  it("反向路徑：stage 已改回 active 時，允許 completed → assigned（不得卡死）", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "active",
        existingStatus: "completed",
        requestedStatus: "assigned",
      }),
    ).toBe("assigned");
  });

  it("反向路徑：stage pending 時亦可降回 assigned", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "pending",
        existingStatus: "completed",
        requestedStatus: "assigned",
      }),
    ).toBe("assigned");
  });

  it("既有 assigned＋請求 completed → 升為 completed", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "completed",
        existingStatus: "assigned",
        requestedStatus: "completed",
      }),
    ).toBe("completed");
  });

  it("sync 路徑（allowDowngrade 預設 false）不得在 stage completed 時降級", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "completed",
        existingStatus: "completed",
        requestedStatus: "assigned",
        allowDowngrade: false,
      }),
    ).toBe("completed");
  });

  it("PM 重開路徑：allowDowngrade=true 時可降級（即使 stage 仍 completed）", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "completed",
        existingStatus: "completed",
        requestedStatus: "assigned",
        allowDowngrade: true,
      }),
    ).toBe("assigned");
  });

  // T-D5-1
  it("T-D5-1：existing=in_progress, requested=assigned, stage=active → in_progress", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "active",
        existingStatus: "in_progress",
        requestedStatus: "assigned",
        allowDowngrade: false,
      }),
    ).toBe("in_progress");
  });

  // T-D5-2
  it("T-D5-2：existing=completed, requested=assigned, stage=completed → completed", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "completed",
        existingStatus: "completed",
        requestedStatus: "assigned",
        allowDowngrade: false,
      }),
    ).toBe("completed");
  });

  // T-D5-3
  it("T-D5-3：stage 非 completed + allowDowngrade → 允許降級", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "active",
        existingStatus: "in_progress",
        requestedStatus: "assigned",
        allowDowngrade: true,
      }),
    ).toBe("assigned");
  });

  it("工項4：completed→in_progress 即使 stage 已非 completed 也擋", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "active",
        existingStatus: "completed",
        requestedStatus: "in_progress",
        allowDowngrade: false,
      }),
    ).toBe("completed");
  });

  it("工項4：allowDowngrade=true 時 completed→in_progress 可降（PM 重開）", () => {
    expect(
      resolveEffectiveUpsertWorkflowStatus({
        stageStatus: "active",
        existingStatus: "completed",
        requestedStatus: "in_progress",
        allowDowngrade: true,
      }),
    ).toBe("in_progress");
  });

  it("工項4：解鎖不得寫翻譯狀態", () => {
    expect(shouldWriteTranslateStatusOnReviewUnlock()).toBe(false);
  });

  it("rank：assigned < in_progress < completed", () => {
    expect(workflowStatusRank("assigned")).toBe(0);
    expect(workflowStatusRank("in_progress")).toBe(1);
    expect(workflowStatusRank("completed")).toBe(2);
  });
});
