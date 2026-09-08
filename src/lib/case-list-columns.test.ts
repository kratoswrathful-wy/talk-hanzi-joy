import { describe, expect, it } from "vitest";
import {
  CASE_LIST_COLUMNS,
  CASE_LIST_OMITTED_DB_COLUMNS,
  isCasesVisibleFullListSelect,
} from "./case-list-columns";

describe("CASE_LIST_COLUMNS", () => {
  it("含清單必要欄、不含昂貴 view 欄", () => {
    expect(CASE_LIST_COLUMNS).toContain("id");
    expect(CASE_LIST_COLUMNS).toContain("title");
    expect(CASE_LIST_COLUMNS).toContain("status");
    expect(CASE_LIST_COLUMNS).toContain("collab_rows");
    expect(CASE_LIST_COLUMNS).not.toContain("*");
    for (const col of CASE_LIST_OMITTED_DB_COLUMNS) {
      expect(isCasesVisibleFullListSelect(CASE_LIST_COLUMNS), col).toBe(false);
      expect(CASE_LIST_COLUMNS.includes(col), col).toBe(false);
    }
  });

  it("select=* 或含 edit_logs 視為全表昂貴讀取", () => {
    expect(isCasesVisibleFullListSelect("*")).toBe(true);
    expect(isCasesVisibleFullListSelect("id,title,edit_logs")).toBe(true);
    expect(isCasesVisibleFullListSelect(CASE_LIST_COLUMNS)).toBe(false);
  });
});
