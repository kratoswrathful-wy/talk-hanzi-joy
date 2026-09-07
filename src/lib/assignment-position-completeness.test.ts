import { describe, expect, it } from "vitest";
import {
  deriveExpectedAssignmentPositions,
  diffAssignmentConfirmation,
} from "./assignment-position-completeness";

describe("assignment-position-completeness", () => {
  it("derives single translator + reviewer from trusted UUIDs", () => {
    const expected = deriveExpectedAssignmentPositions({
      multiCollab: false,
      translatorUserId: "550e8400-e29b-41d4-a716-446655440000",
      translatorLabelCount: 1,
      reviewerUserId: "660e8400-e29b-41d4-a716-446655440001",
      reviewerLabel: "R",
      collabRows: [],
      reviewRows: [],
    });
    expect(expected).toEqual([
      {
        positionKind: "single_translator",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        nameOnlyGap: false,
      },
      {
        positionKind: "case_reviewer",
        userId: "660e8400-e29b-41d4-a716-446655440001",
        nameOnlyGap: false,
      },
    ]);
  });

  it("lists name-only translator as expected position with gap flag", () => {
    const expected = deriveExpectedAssignmentPositions({
      multiCollab: false,
      translatorUserId: null,
      translatorLabelCount: 1,
      reviewerUserId: null,
      reviewerLabel: null,
      collabRows: [],
      reviewRows: [],
    });
    expect(expected).toEqual([
      {
        positionKind: "single_translator",
        userId: null,
        nameOnlyGap: true,
      },
    ]);
  });

  it("does not skip collab/review rows that have labels but missing UUID", () => {
    const expected = deriveExpectedAssignmentPositions({
      multiCollab: true,
      translatorUserId: null,
      translatorLabelCount: 0,
      reviewerUserId: null,
      reviewerLabel: null,
      collabRows: [
        { id: "c1", translatorUserId: null, translatorLabel: "Alice" },
        { id: "c2", translatorUserId: "550e8400-e29b-41d4-a716-446655440000", translatorLabel: "Bob" },
      ],
      reviewRows: [
        { id: "r1", reviewerUserId: null, reviewerLabel: "Rev" },
      ],
    });
    expect(expected).toEqual([
      {
        positionKind: "collab_translator_row",
        userId: null,
        sourceRowId: "c1",
        nameOnlyGap: true,
      },
      {
        positionKind: "collab_translator_row",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        sourceRowId: "c2",
        nameOnlyGap: false,
      },
      {
        positionKind: "review_row",
        userId: null,
        sourceRowId: "r1",
        nameOnlyGap: true,
      },
    ]);
  });

  it("flags name-only translator gap and confirmation missing translator after dispatch", () => {
    const report = diffAssignmentConfirmation({
      live: {
        multiCollab: false,
        translatorUserId: null,
        translatorLabelCount: 1,
        reviewerUserId: "660e8400-e29b-41d4-a716-446655440001",
        reviewerLabel: "R",
        collabRows: [],
        reviewRows: [],
      },
      confirmed: [
        {
          positionKind: "case_reviewer",
          candidateUserId: "660e8400-e29b-41d4-a716-446655440001",
        },
      ],
    });
    expect(report.nameOnlyTranslatorGap).toBe(true);
    expect(report.nameOnlyGaps).toEqual([
      { positionKind: "single_translator", userId: null, nameOnlyGap: true },
    ]);
    expect(report.missingFromConfirmation).toEqual([]);
    expect(report.extraInConfirmation).toEqual([]);
  });

  it("detects live translator UUID missing from old confirmation list", () => {
    const tr = "550e8400-e29b-41d4-a716-446655440000";
    const rv = "660e8400-e29b-41d4-a716-446655440001";
    const report = diffAssignmentConfirmation({
      live: {
        multiCollab: false,
        translatorUserId: tr,
        translatorLabelCount: 1,
        reviewerUserId: rv,
        reviewerLabel: "R",
        collabRows: [],
        reviewRows: [],
      },
      confirmed: [{ positionKind: "case_reviewer", candidateUserId: rv }],
    });
    expect(report.nameOnlyTranslatorGap).toBe(false);
    expect(report.missingFromConfirmation).toEqual([
      { positionKind: "single_translator", userId: tr, nameOnlyGap: false },
    ]);
  });
});
