import { describe, expect, it, vi } from "vitest";
import { applyCaseUpdate, applyCaseUpdateErrorMessage } from "./apply-case-update";

describe("applyCaseUpdate", () => {
  it("rejects empty caseId / patch / invalid revision before calling rpc", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as never;

    const missingId = await applyCaseUpdate(supabase, "", { status: "dispatched" }, 0);
    expect(missingId.error?.message).toMatch(/caseId/i);
    expect(rpc).not.toHaveBeenCalled();

    const emptyPatch = await applyCaseUpdate(supabase, "case-1", {}, 0);
    expect(emptyPatch.error?.message).toMatch(/empty_patch/i);
    expect(rpc).not.toHaveBeenCalled();

    const badRev = await applyCaseUpdate(supabase, "case-1", { status: "dispatched" }, -1);
    expect(badRev.error?.message).toMatch(/expectedRevision/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls apply_case_update rpc with p_expected_revision and surfaces ok:false", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, error: "stale_revision" },
      error: null,
    });
    const supabase = { rpc } as never;

    const result = await applyCaseUpdate(
      supabase,
      "case-1",
      { status: "task_completed" },
      3,
    );
    expect(rpc).toHaveBeenCalledWith("apply_case_update", {
      p_case_id: "case-1",
      p_patch: { status: "task_completed" },
      p_expected_revision: 3,
    });
    expect(result.data?.ok).toBe(false);
    expect(result.error?.message).toBe("stale_revision");
  });

  it("returns ok payload when rpc succeeds", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        id: "case-1",
        updated_at: "2026-07-20T00:00:00Z",
        revision: 4,
      },
      error: null,
    });
    const supabase = { rpc } as never;

    const result = await applyCaseUpdate(
      supabase,
      "case-1",
      {
        status: "dispatched",
        translator: ["譯者一"],
      },
      3,
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      ok: true,
      id: "case-1",
      updated_at: "2026-07-20T00:00:00Z",
      revision: 4,
    });
  });
});

describe("applyCaseUpdateErrorMessage", () => {
  it("reads message from Error / Postgrest-like objects", () => {
    expect(applyCaseUpdateErrorMessage(new Error("boom"))).toBe("boom");
    expect(applyCaseUpdateErrorMessage({ message: "rls", details: "", hint: "", code: "" })).toBe(
      "rls",
    );
    expect(applyCaseUpdateErrorMessage(null)).toBe("");
  });
});
