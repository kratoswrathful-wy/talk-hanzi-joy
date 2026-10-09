import { describe, expect, it, vi } from "vitest";
import {
  broadcastCatCaseFilesChanged,
  decideCatFileOptionsCommit,
  subscribeCatCaseFilesChanged,
} from "./cat-case-file-options";

const caseA = "90d31e2b-484c-455e-ad15-46bc3e384ccd";
const caseB = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("decideCatFileOptionsCommit", () => {
  it("does not apply a late result after switching cases", () => {
    const decided = decideCatFileOptionsCommit({
      requestCaseId: caseA,
      currentCaseId: caseB,
      requestGeneration: 1,
      currentGeneration: 1,
      fetchError: null,
    });
    expect(decided).toEqual({ apply: false, reason: "stale_case" });
  });

  it("does not apply a superseded same-case fetch", () => {
    const decided = decideCatFileOptionsCommit({
      requestCaseId: caseA,
      currentCaseId: caseA,
      requestGeneration: 1,
      currentGeneration: 2,
      fetchError: null,
    });
    expect(decided).toEqual({ apply: false, reason: "superseded" });
  });

  it("does not treat a failed fetch as an empty file list", () => {
    const decided = decideCatFileOptionsCommit({
      requestCaseId: caseA,
      currentCaseId: caseA,
      requestGeneration: 3,
      currentGeneration: 3,
      fetchError: { message: "network down" },
    });
    expect(decided).toEqual({
      apply: false,
      reason: "fetch_error",
      message: "network down",
    });
  });

  it("applies a current successful fetch", () => {
    const decided = decideCatFileOptionsCommit({
      requestCaseId: caseA,
      currentCaseId: caseA,
      requestGeneration: 4,
      currentGeneration: 4,
      fetchError: null,
    });
    expect(decided).toEqual({ apply: true });
  });
});

describe("broadcastCatCaseFilesChanged", () => {
  it("notifies only the matching case", () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const unsubA = subscribeCatCaseFilesChanged(caseA, onA);
    const unsubB = subscribeCatCaseFilesChanged(caseB, onB);
    broadcastCatCaseFilesChanged(caseA);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });
});
