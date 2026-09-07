import { describe, expect, it, vi } from "vitest";
import {
  CASE_ADMIN_RPC,
  adminCreateCase,
  adminDeleteCase,
} from "./case-admin-rpc";

describe("CASE_ADMIN_RPC", () => {
  it("uses stable admin case RPC names", () => {
    expect(CASE_ADMIN_RPC.create).toBe("admin_create_case");
    expect(CASE_ADMIN_RPC.delete).toBe("admin_delete_case");
  });
});

describe("adminCreateCase", () => {
  it("calls admin_create_case with case id and payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, id: "c1", revision: 0 }, error: null });
    const client = { rpc } as never;
    const result = await adminCreateCase(client, "c1", { title: "x", status: "draft" });
    expect(rpc).toHaveBeenCalledWith("admin_create_case", {
      p_case_id: "c1",
      p_payload: { title: "x", status: "draft" },
    });
    expect(result.error).toBeNull();
  });
});

describe("adminDeleteCase", () => {
  it("calls admin_delete_case with expected revision", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, id: "c1" }, error: null });
    const client = { rpc } as never;
    const result = await adminDeleteCase(client, "c1", 3);
    expect(rpc).toHaveBeenCalledWith("admin_delete_case", {
      p_case_id: "c1",
      p_expected_revision: 3,
    });
    expect(result.error).toBeNull();
  });
});
