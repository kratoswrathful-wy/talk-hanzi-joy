import { describe, expect, it } from "vitest";
import { mergeCasePublicSnapshot } from "./case-public-snapshot";

describe("mergeCasePublicSnapshot", () => {
  it("lets a current masked snapshot clear older sensitive tool values", () => {
    const current = {
      updatedAt: "2026-08-27T10:00:00Z",
      loginPassword: "old-secret",
      tools: [{ id: "tool-1", fieldValues: { token: "old-token" } }],
    };
    const masked = {
      updatedAt: "2026-08-27T10:00:01Z",
      loginPassword: "",
      tools: [{ id: "tool-1", fieldValues: {} }],
    };

    expect(mergeCasePublicSnapshot(current, masked)).toEqual(masked);
  });

  it("still rejects a genuinely older public snapshot", () => {
    const current = { updatedAt: "2026-08-27T10:00:01Z", value: "new" };
    const older = { updatedAt: "2026-08-27T10:00:00Z", value: "old" };

    expect(mergeCasePublicSnapshot(current, older)).toEqual(current);
  });
});
