import { describe, expect, it, vi } from "vitest";
import { pmUpdateCaseAssignments } from "./pm-case-assignment-rpc";

describe("pmUpdateCaseAssignments", () => {
  it("strips updated_at before rpc so CAT 儲存並同步不會回 unknown_patch_key", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, id: "case-1", revision: 4 },
      error: null,
    });
    const supabase = { rpc } as never;

    const result = await pmUpdateCaseAssignments(
      supabase,
      "case-1",
      {
        collab_rows: [{ id: "cr-1" }],
        review_rows: [{ id: "cr-1", reviewer: "譯者一（測試）" }],
        reviewer: "譯者一（測試）",
        updated_at: "2099-01-01T00:00:00Z",
      },
      3,
    );

    expect(rpc).toHaveBeenCalledWith("pm_update_case_assignments", {
      p_case_id: "case-1",
      p_patch: {
        collab_rows: [{ id: "cr-1" }],
        review_rows: [{ id: "cr-1", reviewer: "譯者一（測試）" }],
        reviewer: "譯者一（測試）",
      },
      p_expected_revision: 3,
    });
    expect(result.error).toBeNull();
    expect(result.data?.ok).toBe(true);
  });

  it("rejects a patch that is only updated_at", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as never;
    const result = await pmUpdateCaseAssignments(
      supabase,
      "case-1",
      { updated_at: "2099-01-01T00:00:00Z" },
      0,
    );
    expect(result.error?.message).toMatch(/empty_patch_after_filter/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
