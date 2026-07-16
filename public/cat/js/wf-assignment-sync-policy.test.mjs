import { describe, expect, it } from "vitest";
import {
  resolveRequestedSyncWorkflowStatus,
  resolveEffectiveUpsertWorkflowStatus,
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

  it("檔案重開：stage 從 completed 改回 active 後，sync 建議 assigned", () => {
    expect(
      resolveRequestedSyncWorkflowStatus({
        stageStatus: "active",
        taskCompleted: false,
      }),
    ).toBe("assigned");
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
});
