import { describe, expect, it } from "vitest";
import {
  hasAssignmentPatchKeys,
  isTrustedUserId,
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
});
