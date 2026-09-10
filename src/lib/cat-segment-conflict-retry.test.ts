import { describe, expect, it } from "vitest";
import { decideCatSegmentConflictRetry } from "./cat-segment-conflict-retry";

describe("decideCatSegmentConflictRetry", () => {
  it("does not retry the original client text when DB already has another confirmed target", () => {
    expect(decideCatSegmentConflictRetry({
      attemptedText: "T1-draft",
      dbTargetText: "T2-confirmed",
    })).toBe("abort-divergent");
  });

  it("allows a retry when DB text is still the same attempt (self echo / lost response)", () => {
    expect(decideCatSegmentConflictRetry({
      attemptedText: "same",
      dbTargetText: "same",
    })).toBe("retry-same-text");
  });
});
