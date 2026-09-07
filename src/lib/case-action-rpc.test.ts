import { describe, expect, it, vi } from "vitest";
import {
  acceptInquiryCollabRow,
  acceptPublicInquiryCase,
  caseRpcErrorKind,
  declinePublicInquiryCase,
  getCaseCredentials,
  updateCaseCredentials,
  updateCasePermittedFields,
} from "./case-action-rpc";

describe("case action RPC client", () => {
  it("rejects invalid optimistic revision before network access", async () => {
    const rpc = vi.fn();
    const client = { rpc } as never;

    const result = await acceptPublicInquiryCase(client, "case-1", -1);

    expect(result.error?.message).toBe("invalid expectedRevision");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes expected revision to single-case acceptance", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { caseId: "case-1", revision: 8, status: "dispatched" },
      error: null,
    });

    const result = await acceptPublicInquiryCase(
      { rpc } as never,
      "case-1",
      7,
    );

    expect(rpc).toHaveBeenCalledWith("accept_public_inquiry_case", {
      p_case_id: "case-1",
      p_expected_revision: 7,
    });
    expect(result.data?.revision).toBe(8);
  });

  it("passes only the controlled decline payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { caseId: "c", revision: 3 }, error: null });
    const decline = { proposedDeadline: "2026-09-01", availableCount: 1000, message: "無法承接" };

    await declinePublicInquiryCase({ rpc } as never, "c", 2, decline);

    expect(rpc).toHaveBeenCalledWith("decline_public_inquiry_case", {
      p_case_id: "c",
      p_expected_revision: 2,
      p_decline: decline,
    });
  });

  it("requires a row id for collab acceptance", async () => {
    const rpc = vi.fn();
    const result = await acceptInquiryCollabRow({ rpc } as never, "c", "", 0);

    expect(result.error?.message).toBe("missing collabRowId");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not permit an empty dynamic field patch", async () => {
    const rpc = vi.fn();
    const result = await updateCasePermittedFields({ rpc } as never, "c", 0, {});

    expect(result.error?.message).toBe("empty changes");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps credential reads and writes on dedicated RPCs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          caseId: "c",
          revision: 2,
          loginAccount: "account",
          loginPassword: "secret",
          otherLoginInfo: "",
          toolFieldValues: {},
          tools: [],
          questionTools: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { caseId: "c", revision: 3 }, error: null });
    const client = { rpc } as never;

    await getCaseCredentials(client, "c");
    await updateCaseCredentials(client, "c", 2, { loginPassword: "new" });

    expect(rpc).toHaveBeenNthCalledWith(1, "get_case_credentials", {
      p_case_id: "c",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "update_case_credentials", {
      p_case_id: "c",
      p_expected_revision: 2,
      p_credentials: { loginPassword: "new" },
    });
  });
});

describe("caseRpcErrorKind", () => {
  it.each([
    [{ code: "40001", message: "case_revision_conflict" }, "conflict"],
    [{ code: "42501", message: "not_authorized" }, "forbidden"],
    [{ code: "P0002", message: "case_unavailable" }, "unavailable"],
    [{ code: "22023", message: "invalid_payload" }, "invalid"],
    [{ code: "XX000", message: "boom" }, "unknown"],
  ] as const)("classifies PostgREST errors", (error, expected) => {
    expect(caseRpcErrorKind(error as never)).toBe(expected);
  });
});
