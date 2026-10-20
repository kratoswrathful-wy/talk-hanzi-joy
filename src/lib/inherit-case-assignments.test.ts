import { describe, expect, it, vi } from "vitest";
import { inheritCaseAssignmentsForLinkedFile } from "./inherit-case-assignments";

function makeClient(input: {
  caseRow: Record<string, unknown> | null;
  updateError?: { message: string } | null;
}) {
  const update = vi.fn().mockResolvedValue({ error: input.updateError ?? null });
  const rpc = vi.fn().mockResolvedValue({
    data: {
      found: true,
      written: 1,
      unresolvedTranslators: [],
      unresolvedReviewers: [],
      rowsWithoutFile: 0,
      reviewRowsWithoutFile: 0,
      reviewWritten: 1,
    },
    error: null,
  });
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: input.caseRow, error: null }),
        })),
      })),
    })),
    rpc,
    update,
    __update: update,
  };
}

describe("inheritCaseAssignmentsForLinkedFile", () => {
  it("缺案件編號時不寫入", async () => {
    const client = makeClient({ caseRow: null });
    const result = await inheritCaseAssignmentsForLinkedFile(client as never, {
      caseId: "",
      fileId: "f1",
    });
    expect(result.ok).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("多列同檔名要等使用者選列，不擅自帶入", async () => {
    const client = makeClient({
      caseRow: {
        id: "c1",
        revision: 3,
        status: "dispatched",
        multi_collab: true,
        collab_rows: [
          { id: "r1", segment: "說明.xlsx", lineRange: "1-10", translator: "甲", accepted: true },
          { id: "r2", segment: "說明.xlsx", lineRange: "11-20", translator: "乙", accepted: true },
        ],
        review_rows: [],
        reviewer: "",
      },
    });
    const result = await inheritCaseAssignmentsForLinkedFile(client as never, {
      caseId: "c1",
      fileId: "file-new",
      fileName: "說明.xlsx",
    });
    expect(result.ok).toBe(false);
    expect(result.needsRowChoice).toBe(true);
    expect(result.candidates.map((row) => row.id)).toEqual(["r1", "r2"]);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
