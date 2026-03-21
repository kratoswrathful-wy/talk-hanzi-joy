import { describe, it, expect } from "vitest";
import {
  parseCaseTitleForDuplicate,
  planDuplicateCaseTitle,
  needsDuplicateSortDialog,
  DEFAULT_DUPLICATE_SORT,
  findDuplicateTitleCase,
  normalizeCaseTitleForComparison,
} from "./case-title-duplicate";

describe("parseCaseTitleForDuplicate", () => {
  it("parses Moncler 260321", () => {
    const p = parseCaseTitleForDuplicate("Moncler 260321");
    expect(p).toEqual({
      prefix: "Moncler ",
      dateYYMMDD: "260321",
      letterAfterDate: null,
      underscoreSuffix: null,
    });
  });

  it("parses Riot - 2XKO 260320B", () => {
    const p = parseCaseTitleForDuplicate("Riot - 2XKO 260320B");
    expect(p).toEqual({
      prefix: "Riot - 2XKO ",
      dateYYMMDD: "260320",
      letterAfterDate: "B",
      underscoreSuffix: null,
    });
  });

  it("parses underscore suffix", () => {
    const p = parseCaseTitleForDuplicate("Moncler 260321_作業");
    expect(p?.underscoreSuffix).toBe("_作業");
    expect(p?.dateYYMMDD).toBe("260321");
  });
});

describe("planDuplicateCaseTitle", () => {
  const today = "260322";
  const sourceId = "source-1";
  const nowIso = "2026-03-22T12:00:00.000Z";

  it("same-day duplicate: source + new row get distinct titles (no longer identical to source)", () => {
    const r = planDuplicateCaseTitle(
      "Moncler 260322",
      sourceId,
      today,
      [
        {
          id: sourceId,
          title: "Moncler 260322",
          createdAt: "2026-03-22T08:00:00.000Z",
          translationDeadline: null,
          reviewDeadline: null,
        },
      ],
      DEFAULT_DUPLICATE_SORT,
      nowIso
    );
    expect(r.titleUpdates.length).toBe(1);
    expect(r.titleUpdates[0]).toEqual({ caseId: sourceId, newTitle: "Moncler 260322A" });
    expect(r.newTitle).toBe("Moncler 260322B");
  });

  it("same-day duplicate: identical created_at tie → source A, new B", () => {
    const r = planDuplicateCaseTitle(
      "Moncler 260322",
      sourceId,
      today,
      [
        {
          id: sourceId,
          title: "Moncler 260322",
          createdAt: nowIso,
          translationDeadline: null,
          reviewDeadline: null,
        },
      ],
      DEFAULT_DUPLICATE_SORT,
      nowIso
    );
    expect(r.titleUpdates[0]).toEqual({ caseId: sourceId, newTitle: "Moncler 260322A" });
    expect(r.newTitle).toBe("Moncler 260322B");
  });

  it("same-day duplicate: identical created_at tie + desc → new A, source B", () => {
    const r = planDuplicateCaseTitle(
      "Moncler 260322",
      sourceId,
      today,
      [
        {
          id: sourceId,
          title: "Moncler 260322",
          createdAt: nowIso,
          translationDeadline: null,
          reviewDeadline: null,
        },
      ],
      { key: "created_at", dir: "desc" },
      nowIso
    );
    expect(r.newTitle).toBe("Moncler 260322A");
    expect(r.titleUpdates[0]).toEqual({ caseId: sourceId, newTitle: "Moncler 260322B" });
  });

  it("same-day duplicate: both deadlines null tie (translation_deadline asc) → source A, new B", () => {
    const r = planDuplicateCaseTitle(
      "Moncler 260322",
      sourceId,
      today,
      [
        {
          id: sourceId,
          title: "Moncler 260322",
          createdAt: nowIso,
          translationDeadline: null,
          reviewDeadline: null,
        },
      ],
      { key: "translation_deadline", dir: "asc" },
      nowIso
    );
    expect(r.titleUpdates[0]).toEqual({ caseId: sourceId, newTitle: "Moncler 260322A" });
    expect(r.newTitle).toBe("Moncler 260322B");
  });

  it("bumps letter when same base exists elsewhere (source old date)", () => {
    const r = planDuplicateCaseTitle(
      "Moncler 260321",
      sourceId,
      today,
      [
        {
          id: sourceId,
          title: "Moncler 260321",
          createdAt: "2026-03-21T08:00:00.000Z",
          translationDeadline: null,
          reviewDeadline: null,
        },
        {
          id: "other",
          title: "Moncler 260322",
          createdAt: "2026-03-22T07:00:00.000Z",
          translationDeadline: null,
          reviewDeadline: null,
        },
      ],
      DEFAULT_DUPLICATE_SORT,
      nowIso
    );
    expect(r.newTitle).toBe("Moncler 260322B");
    expect(r.titleUpdates).toEqual([
      { caseId: "other", newTitle: "Moncler 260322A" },
    ]);
  });

  it("handles 260320B style source title moving to today", () => {
    const r = planDuplicateCaseTitle(
      "Riot - 2XKO 260320B",
      sourceId,
      today,
      [{ id: sourceId, title: "Riot - 2XKO 260320B", createdAt: nowIso, translationDeadline: null, reviewDeadline: null }],
      DEFAULT_DUPLICATE_SORT,
      nowIso
    );
    expect(r.newTitle).toBe("Riot - 2XKO 260322");
  });
});

describe("findDuplicateTitleCase", () => {
  it("treats whitespace variants as the same title", () => {
    const dup = findDuplicateTitleCase(
      "b",
      "Hello   World",
      [
        { id: "a", title: "Hello World" },
        { id: "b", title: "x" },
      ]
    );
    expect(dup?.id).toBe("a");
  });

  it("normalizes internal spaces for comparison", () => {
    expect(normalizeCaseTitleForComparison("  a  b  ")).toBe("a b");
  });
});

describe("needsDuplicateSortDialog", () => {
  it("true when same-day same-series already exists", () => {
    expect(
      needsDuplicateSortDialog(
        "Moncler 260322",
        "260322",
        [{ id: "a", title: "Moncler 260322" }]
      )
    ).toBe(true);
  });

  it("false when no same-day row and source is old date", () => {
    expect(
      needsDuplicateSortDialog(
        "Moncler 260321",
        "260322",
        [{ id: "a", title: "Moncler 260321" }]
      )
    ).toBe(false);
  });
});
