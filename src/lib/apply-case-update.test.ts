import { describe, expect, it, vi } from "vitest";
import { applyCaseUpdate, applyCaseUpdateErrorMessage } from "./apply-case-update";

describe("applyCaseUpdate", () => {
  it("rejects empty caseId / patch before calling rpc", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as never;

    const missingId = await applyCaseUpdate(supabase, "", { status: "dispatched" });
    expect(missingId.error?.message).toMatch(/caseId/i);
    expect(rpc).not.toHaveBeenCalled();

    const emptyPatch = await applyCaseUpdate(supabase, "case-1", {});
    expect(emptyPatch.error?.message).toMatch(/empty_patch/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls apply_case_update rpc and surfaces ok:false as error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, error: "env_mismatch" },
      error: null,
    });
    const supabase = { rpc } as never;

    const result = await applyCaseUpdate(supabase, "case-1", { status: "task_completed" });
    expect(rpc).toHaveBeenCalledWith("apply_case_update", {
      p_case_id: "case-1",
      p_patch: { status: "task_completed" },
    });
    expect(result.data?.ok).toBe(false);
    expect(result.error?.message).toBe("env_mismatch");
  });

  it("returns ok payload when rpc succeeds", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, id: "case-1", updated_at: "2026-07-20T00:00:00Z" },
      error: null,
    });
    const supabase = { rpc } as never;

    const result = await applyCaseUpdate(supabase, "case-1", {
      status: "dispatched",
      translator: ["譯者一"],
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      ok: true,
      id: "case-1",
      updated_at: "2026-07-20T00:00:00Z",
    });
  });
});

describe("applyCaseUpdateErrorMessage", () => {
  it("reads message from Error / Postgrest-like objects", () => {
    expect(applyCaseUpdateErrorMessage(new Error("boom"))).toBe("boom");
    expect(applyCaseUpdateErrorMessage({ message: "rls", details: "", hint: "", code: "" })).toBe("rls");
    expect(applyCaseUpdateErrorMessage(null)).toBe("");
  });
});
