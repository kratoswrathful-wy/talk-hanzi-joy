import { describe, expect, it } from "vitest";
import {
  hasAssignmentPatchKeys,
  isTrustedUserId,
  omitUntrustedCreateAssignments,
  splitDbCasePatch,
} from "@/lib/case-assignment-patch";

describe("case-assignment-patch", () => {
  it("isTrustedUserId accepts UUID v4", () => {
    expect(isTrustedUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isTrustedUserId("assignee-x@test.local")).toBe(false);
  });

  it("splitDbCasePatch separates assignment and general keys", () => {
    const { assignment, general } = splitDbCasePatch(
      {
        title: "A-1",
        translator: ["Alice"],
        collab_rows: [],
        updated_at: "2026-01-01T00:00:00Z",
      },
      { translatorUserId: "550e8400-e29b-41d4-a716-446655440000" },
    );
    expect(general).toEqual({ title: "A-1" });
    expect(assignment.translator).toEqual(["Alice"]);
    expect(assignment.translator_user_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("hasAssignmentPatchKeys detects assignment fields", () => {
    expect(hasAssignmentPatchKeys({ translator: [] })).toBe(true);
    expect(hasAssignmentPatchKeys({ title: "x" })).toBe(false);
  });

  it("omitUntrustedCreateAssignments drops name-only reviewer from templates", () => {
    const { next, omittedLabels } = omitUntrustedCreateAssignments({
      title: "新案件",
      reviewer: "合成審稿甲",
      customGuidelinesUrl: { url: "https://example.test", label: "x" },
    });
    expect(next.title).toBe("新案件");
    expect(next.customGuidelinesUrl).toEqual({ url: "https://example.test", label: "x" });
    expect(next).not.toHaveProperty("reviewer");
    expect(omittedLabels).toEqual(["審稿人員"]);
  });

  it("omitUntrustedCreateAssignments keeps reviewer when UUID is present", () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    const { next, omittedLabels } = omitUntrustedCreateAssignments({
      title: "新案件",
      reviewer: "Alice",
      reviewerUserId: uid,
    });
    expect(next.reviewer).toBe("Alice");
    expect(next.reviewerUserId).toBe(uid);
    expect(omittedLabels).toEqual([]);
  });

  it("omitUntrustedCreateAssignments drops name-only translator arrays", () => {
    const { next, omittedLabels } = omitUntrustedCreateAssignments({
      title: "新案件",
      translator: ["Alice"],
    });
    expect(next).not.toHaveProperty("translator");
    expect(omittedLabels).toEqual(["譯者"]);
  });

  it("omitUntrustedCreateAssignments keeps empty assignee templates and other fields", () => {
    const { next, omittedLabels } = omitUntrustedCreateAssignments({
      title: "新案件",
      client: "合成客戶",
      customGuidelinesUrl: { url: "https://example.test", label: "x" },
    });
    expect(next).toEqual({
      title: "新案件",
      client: "合成客戶",
      customGuidelinesUrl: { url: "https://example.test", label: "x" },
    });
    expect(omittedLabels).toEqual([]);
  });

  it("omitUntrustedCreateAssignments does not silently drop an invalid UUID the caller already sent", () => {
    const { next, omittedLabels } = omitUntrustedCreateAssignments({
      title: "新案件",
      reviewer: "Alice",
      reviewerUserId: "not-a-uuid",
    });
    expect(next.reviewer).toBe("Alice");
    expect(next.reviewerUserId).toBe("not-a-uuid");
    expect(omittedLabels).toEqual([]);
  });

  it("omitUntrustedCreateAssignments keeps empty people and other prefill fields", () => {
    const { next, omittedLabels } = omitUntrustedCreateAssignments({
      title: "新案件",
      reviewer: "",
      translator: [],
      commonInfo: ["note"],
    });
    expect(next.reviewer).toBe("");
    expect(next.translator).toEqual([]);
    expect(next.commonInfo).toEqual(["note"]);
    expect(omittedLabels).toEqual([]);
  });
});
