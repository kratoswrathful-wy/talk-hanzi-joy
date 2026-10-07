import { describe, expect, it } from "vitest";
import {
  acceptCatSyncShouldFail,
  collabFileAssignmentPairs,
  parseCatWorkflowSyncPayload,
} from "./cat-workflow-sync-result";

describe("parseCatWorkflowSyncPayload", () => {
  it("treats RPC error as failure", () => {
    expect(parseCatWorkflowSyncPayload({ found: true, written: 1 }, { message: "boom" })).toEqual({
      ok: false,
      reason: "rpc_error",
    });
  });

  it("does not treat an empty object as a successful sync", () => {
    expect(parseCatWorkflowSyncPayload({})).toEqual({ ok: false, reason: "unknown" });
    expect(parseCatWorkflowSyncPayload(null)).toEqual({ ok: false, reason: "unknown" });
  });

  it("rejects missing written count", () => {
    expect(parseCatWorkflowSyncPayload({ found: true })).toEqual({ ok: false, reason: "unknown" });
  });

  it("rejects found=false", () => {
    expect(parseCatWorkflowSyncPayload({ found: false, written: 0 })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("parses a complete success payload", () => {
    expect(
      parseCatWorkflowSyncPayload({
        found: true,
        written: 2,
        unresolvedTranslators: ["缺帳號"],
        rowsWithoutFile: 1,
      }),
    ).toEqual({
      ok: true,
      report: {
        found: true,
        unresolvedTranslators: ["缺帳號"],
        unresolvedReviewers: [],
        rowsWithoutFile: 1,
        reviewRowsWithoutFile: 0,
        written: 2,
        reviewWritten: 0,
      },
    });
  });
});

describe("acceptCatSyncShouldFail", () => {
  it("allows LMS-only cases with no linked CAT files", () => {
    expect(acceptCatSyncShouldFail({ found: true, written: 0, linkedFileCount: 0 })).toBe(false);
  });

  it("fails when linked files exist but nothing was written", () => {
    expect(acceptCatSyncShouldFail({ found: true, written: 0, linkedFileCount: 1 })).toBe(true);
  });

  it("fails when the case is missing", () => {
    expect(acceptCatSyncShouldFail({ found: false, written: 0, linkedFileCount: 0 })).toBe(true);
  });

  it("passes when at least one assignment was written", () => {
    expect(acceptCatSyncShouldFail({ found: true, written: 1, linkedFileCount: 1 })).toBe(false);
  });
});

describe("collabFileAssignmentPairs", () => {
  const rows = [
    {
      accepted: true,
      translatorUserId: "u1",
      translator: "譯者一（測試）",
      linkedCatFileId: "file-1",
    },
    {
      accepted: false,
      translatorUserId: "u2",
      translator: "譯者二（測試）",
      linkedCatFileId: "file-2",
    },
  ];

  it("while inquiry, only writes the accepted row onto its own file", () => {
    expect(collabFileAssignmentPairs({ status: "inquiry", rows })).toEqual([
      { userId: "u1", fileId: "file-1" },
    ]);
  });

  it("after dispatch, writes each accepted row only to its own file", () => {
    const dispatched = rows.map((row) => ({ ...row, accepted: true }));
    expect(collabFileAssignmentPairs({ status: "dispatched", rows: dispatched })).toEqual([
      { userId: "u1", fileId: "file-1" },
      { userId: "u2", fileId: "file-2" },
    ]);
  });

  it("does not invent a pair when the row has no linked file", () => {
    expect(
      collabFileAssignmentPairs({
        status: "dispatched",
        rows: [{ accepted: true, translatorUserId: "u1", linkedCatFileId: "" }],
      }),
    ).toEqual([]);
  });
});
