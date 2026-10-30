import { describe, expect, it, vi } from "vitest";
import { catWorkflowSyncBroadcastMessage, syncCatWorkflowAssignmentsForCase } from "./cat-workflow-dispatch";

describe("syncCatWorkflowAssignmentsForCase", () => {
  it("returns null when the RPC reports an error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { found: true, written: 3 },
      error: { message: "not_authorized" },
    });

    const report = await syncCatWorkflowAssignmentsForCase({ rpc } as never, "case-1");

    expect(report).toBeNull();
    expect(rpc).toHaveBeenCalledWith("lms_sync_cat_workflow_for_case", {
      p_case_id: "case-1",
    });
  });

  it("returns null for an empty payload instead of inventing success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    await expect(syncCatWorkflowAssignmentsForCase({ rpc } as never, "case-1")).resolves.toBeNull();
  });

  it("returns the parsed report only when found and written are present", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { found: true, written: 1, unresolvedTranslators: [] },
      error: null,
    });

    await expect(syncCatWorkflowAssignmentsForCase({ rpc } as never, "case-1")).resolves.toMatchObject({
      found: true,
      written: 1,
    });
  });
});

describe("catWorkflowSyncBroadcastMessage", () => {
  it("LMS 勾完成會帶該列編號，讓已開 CAT 清回退去重", () => {
    expect(catWorkflowSyncBroadcastMessage("case-1", {
      completedCollabRowIds: ["row-a", "", "row-a"],
      source: "lms_row_complete",
    })).toEqual({
      type: "WORKFLOW_ASSIGNMENTS_SYNCED",
      caseId: "case-1",
      completedCollabRowIds: ["row-a"],
      source: "lms_row_complete",
    });
  });

  it("舊呼叫只給案件編號時仍相容", () => {
    expect(catWorkflowSyncBroadcastMessage("case-1")).toEqual({
      type: "WORKFLOW_ASSIGNMENTS_SYNCED",
      caseId: "case-1",
      completedCollabRowIds: [],
      source: "",
    });
  });
});
