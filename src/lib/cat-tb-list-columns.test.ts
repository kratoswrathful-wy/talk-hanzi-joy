import { describe, expect, it } from "vitest";
import { CAT_TB_LIST_COLUMNS, isCatTbListSelectHeavy } from "./cat-tb-list-columns";

describe("CAT_TB_LIST_COLUMNS", () => {
  it("儀表板／清單不拉 terms", () => {
    expect(CAT_TB_LIST_COLUMNS).toContain("id");
    expect(CAT_TB_LIST_COLUMNS).toContain("name");
    expect(isCatTbListSelectHeavy(CAT_TB_LIST_COLUMNS)).toBe(false);
    expect(isCatTbListSelectHeavy("*")).toBe(true);
    expect(isCatTbListSelectHeavy("id,name,terms")).toBe(true);
  });
});
