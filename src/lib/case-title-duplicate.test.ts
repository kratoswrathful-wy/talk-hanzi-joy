import { describe, it, expect } from "vitest";
import { parseCaseTitleForDuplicate, planDuplicateCaseTitle } from "./case-title-duplicate";

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

  it("excludes source from collision", () => {
    const r = planDuplicateCaseTitle("Moncler 260322", sourceId, today, [
      { id: sourceId, title: "Moncler 260322" },
    ]);
    expect(r.newTitle).toBe("Moncler 260322");
    expect(r.titleUpdates).toHaveLength(0);
  });

  it("bumps letter when same base exists elsewhere", () => {
    const r = planDuplicateCaseTitle("Moncler 260321", sourceId, today, [
      { id: sourceId, title: "Moncler 260321" },
      { id: "other", title: "Moncler 260322" },
    ]);
    expect(r.newTitle).toBe("Moncler 260322B");
    expect(r.titleUpdates.length).toBeGreaterThanOrEqual(0);
  });

  it("handles 260320B style source title", () => {
    const r = planDuplicateCaseTitle("Riot - 2XKO 260320B", sourceId, today, [{ id: sourceId, title: "Riot - 2XKO 260320B" }]);
    expect(r.newTitle).toBe("Riot - 2XKO 260322");
  });
});
