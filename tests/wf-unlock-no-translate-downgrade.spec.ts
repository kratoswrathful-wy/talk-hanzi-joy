/**
 * 工項 4：e2e（測試模式）——解鎖政策與防降級在 CAT 頁面可載入並生效。
 * 完整 LMS 重指派→維持 completed 需正式庫案件；此處釘死瀏覽器側契約。
 */
import { test, expect } from "@playwright/test";
import { resolveCatFixture } from "./helpers/cat-fixtures";
import { openOfflineCatWithFile } from "./helpers/cat-offline-open";

const SMALL_FIXTURE = resolveCatFixture("small");

test.describe("工項4：解鎖不降翻譯狀態（政策契約）", () => {
  test("WfAssignmentSyncPolicy：completed→in_progress 被擋；解鎖不寫翻譯", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const frame = await openOfflineCatWithFile(page, {
      fixturePath: SMALL_FIXTURE,
      projectName: `[PW] wf-unlock-policy ${Date.now()}`,
    });

    await frame.waitForFunction(
      () => !!(window as unknown as { WfAssignmentSyncPolicy?: unknown }).WfAssignmentSyncPolicy,
      null,
      { timeout: 30000 },
    );

    const result = await frame.locator("body").evaluate(() => {
      const api = (
        window as unknown as {
          WfAssignmentSyncPolicy: {
            resolveEffectiveUpsertWorkflowStatus: (i: Record<string, unknown>) => string;
            shouldWriteTranslateStatusOnReviewUnlock: () => boolean;
          };
        }
      ).WfAssignmentSyncPolicy;
      return {
        blocked: api.resolveEffectiveUpsertWorkflowStatus({
          stageStatus: "active",
          existingStatus: "completed",
          requestedStatus: "in_progress",
          allowDowngrade: false,
        }),
        allowed: api.resolveEffectiveUpsertWorkflowStatus({
          stageStatus: "active",
          existingStatus: "completed",
          requestedStatus: "in_progress",
          allowDowngrade: true,
        }),
        unlockWrite: api.shouldWriteTranslateStatusOnReviewUnlock(),
      };
    });

    expect(result.blocked).toBe("completed");
    expect(result.allowed).toBe("in_progress");
    expect(result.unlockWrite).toBe(false);
  });
});
