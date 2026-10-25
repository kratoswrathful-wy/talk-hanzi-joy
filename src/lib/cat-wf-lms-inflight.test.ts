import { describe, expect, it } from "vitest";
import {
  catWfLmsInflightKey,
  claimCatWfLmsInflight,
  releaseCatWfLmsInflight,
} from "./cat-wf-lms-inflight";

describe("claimCatWfLmsInflight", () => {
  it("drops a duplicate in-flight key until it is released", () => {
    const key = catWfLmsInflightKey("case-1", "row-a", false);
    expect(claimCatWfLmsInflight(key)).toBe(true);
    expect(claimCatWfLmsInflight(key)).toBe(false);
    releaseCatWfLmsInflight(key);
    expect(claimCatWfLmsInflight(key)).toBe(true);
    releaseCatWfLmsInflight(key);
  });
});
