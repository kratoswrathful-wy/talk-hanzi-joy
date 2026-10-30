import { describe, expect, it, vi } from "vitest";
import {
  LMS_COMPLETE_CAT_ASSIGN_COLUMNS,
  LMS_COMPLETE_CAT_STAGE_COLUMNS,
  markCatTranslateCompletedForLmsRow,
  translateAssignmentIdsFromLmsCompleteLookup,
} from "./lms-complete-cat-translate";

describe("translateAssignmentIdsFromLmsCompleteLookup", () => {
  it("只挑該列未完成的翻譯指派", () => {
    expect(translateAssignmentIdsFromLmsCompleteLookup({
      assignments: [
        { id: "t-a", workflow_status: "in_progress", file_workflow_stage_id: "st-t" },
        { id: "t-done", workflow_status: "completed", file_workflow_stage_id: "st-t" },
        { id: "r-a", workflow_status: "in_progress", file_workflow_stage_id: "st-r" },
      ],
      stages: [
        { id: "st-t", stage_kind: "translate" },
        { id: "st-r", stage_kind: "review" },
      ],
    })).toEqual(["t-a"]);
  });

  it("清單欄位不含 *", () => {
    expect(LMS_COMPLETE_CAT_ASSIGN_COLUMNS).toContain("id");
    expect(LMS_COMPLETE_CAT_ASSIGN_COLUMNS).not.toContain("*");
    expect(LMS_COMPLETE_CAT_STAGE_COLUMNS).toBe("id, stage_kind");
  });
});

describe("markCatTranslateCompletedForLmsRow", () => {
  it("查出翻譯指派後呼叫既有完成 RPC", async () => {
    const from = vi.fn((table: string) => {
      if (table === "cat_stage_assignments") {
        return {
          select: () => ({
            eq: async () => ({
              data: [{
                id: "t-a",
                collab_row_id: "row-a",
                workflow_status: "in_progress",
                file_workflow_stage_id: "st-t",
              }],
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: "st-t", stage_kind: "translate" }],
            error: null,
          }),
        }),
      };
    });
    const rpc = vi.fn().mockResolvedValue({ data: { id: "t-a" }, error: null });
    await expect(markCatTranslateCompletedForLmsRow(
      { from, rpc } as never,
      "row-a",
    )).resolves.toEqual(["t-a"]);
    expect(rpc).toHaveBeenCalledWith("cat_update_stage_assignment_workflow_status", {
      p_assignment_id: "t-a",
      p_workflow_status: "completed",
    });
  });
});
