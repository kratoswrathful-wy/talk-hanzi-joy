import { describe, expect, it, vi } from "vitest";
import {
  ACCEPT_CAT_SYNC_USER_MESSAGE,
  acceptInquiryCollabRow,
  acceptPublicInquiryCase,
  caseRpcErrorKind,
  completeCaseReviewRow,
  cancelCaseReviewRow,
  remapAcceptCatSyncError,
  declinePublicInquiryCase,
  getCaseCredentials,
  updateCaseCredentials,
  updateCasePermittedFields,
  updateCaseSocialFields,
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

  it("keeps comments and client question form on the social RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { caseId: "c", revision: 4 }, error: null });
    const result = await updateCaseSocialFields({ rpc } as never, "c", 3, {
      comments: [{ id: "n1" }],
      clientQuestionForm: true,
    });
    expect(rpc).toHaveBeenCalledWith("update_case_social_fields", {
      p_case_id: "c",
      p_expected_revision: 3,
      p_changes: { comments: [{ id: "n1" }], clientQuestionForm: true },
    });
    expect(result.data?.revision).toBe(4);
  });

  it("does not permit an empty social field patch", async () => {
    const rpc = vi.fn();
    const result = await updateCaseSocialFields({ rpc } as never, "c", 1, {});
    expect(result.error?.message).toBe("empty changes");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("caseRpcErrorKind", () => {
  it.each([
    [{ code: "40001", message: "case_revision_conflict" }, "conflict"],
    [{ code: "P0001", message: "case_revision_conflict" }, "conflict"],
    [{ code: "P0001", message: "revision mismatch" }, "conflict"],
    [{ code: "XX000", message: "case_revision_conflict" }, "conflict"],
    [{ code: "42501", message: "not_authorized" }, "forbidden"],
    [{ code: "P0002", message: "case_unavailable" }, "unavailable"],
    [{ code: "22023", message: "invalid_payload" }, "invalid"],
    [{ code: "P0003", message: "cat_sync_wrote_zero" }, "sync"],
    [{ code: "XX000", message: "cat_sync_unknown_result" }, "sync"],
    [{ code: "XX000", message: "boom" }, "unknown"],
  ] as const)("classifies PostgREST errors", (error, expected) => {
    expect(caseRpcErrorKind(error as never)).toBe(expected);
  });

  it("calls the public review-cancel wrapper, never the private impl", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { caseId: "c", revision: 5, rowId: "r1" },
      error: null,
    });
    await cancelCaseReviewRow({ rpc } as never, "c", "r1", 4);
    expect(rpc).toHaveBeenCalledWith("cancel_case_review_row", {
      p_case_id: "c",
      p_review_row_id: "r1",
      p_expected_revision: 4,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "cancel_case_review_row_impl",
      expect.anything(),
    );
  });

  it("calls the public review-complete wrapper, never the private impl", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { caseId: "c", revision: 4, rowId: "r1" },
      error: null,
    });
    await completeCaseReviewRow({ rpc } as never, "c", "r1", 3);
    expect(rpc).toHaveBeenCalledWith("complete_case_review_row", {
      p_case_id: "c",
      p_review_row_id: "r1",
      p_expected_revision: 3,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "complete_case_review_row_impl",
      expect.anything(),
    );
  });

  it("rewrites accept CAT sync failures into a user-facing message", () => {
    const remapped = remapAcceptCatSyncError({
      code: "P0003",
      message: "cat_sync_wrote_zero",
    } as never);
    expect(remapped?.message).toBe(ACCEPT_CAT_SYNC_USER_MESSAGE);
  });
});
