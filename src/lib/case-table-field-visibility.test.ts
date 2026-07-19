import { describe, expect, it } from "vitest";
import {
  CASE_TABLE_MANAGER_ONLY_KEYS,
  isCaseTableManagerOnlyKey,
} from "./case-table-field-visibility";

describe("case-table-field-visibility", () => {
  it("covers the seven manager-only fields from the D matrix", () => {
    expect(CASE_TABLE_MANAGER_ONLY_KEYS).toEqual(
      new Set([
        "client",
        "contact",
        "keyword",
        "clientPoNumber",
        "dispatchRoute",
        "clientCaseLink",
        "internalComments",
      ])
    );
  });

  it("isCaseTableManagerOnlyKey matches the set", () => {
    expect(isCaseTableManagerOnlyKey("client")).toBe(true);
    expect(isCaseTableManagerOnlyKey("title")).toBe(false);
    expect(isCaseTableManagerOnlyKey("translator")).toBe(false);
  });
});
