import { describe, expect, it } from "vitest";
import {
  CASE_TABLE_SELECT_FIELD_KEYS,
  caseTableSelectFieldKey,
} from "./case-table-select-field-keys";

/**
 * Regression：案件總表「工作類型」曾誤用 fieldKey=workType（空桶），
 * 選項應來自 selectOptionsStore.taskType（與 WorkTypeLabels／詳情頁一致）。
 */
describe("case-table-select-field-keys", () => {
  it("maps workType column to taskType store key", () => {
    expect(CASE_TABLE_SELECT_FIELD_KEYS.workType).toBe("taskType");
    expect(caseTableSelectFieldKey("workType")).toBe("taskType");
  });

  it("maps category column to caseCategory store key", () => {
    expect(caseTableSelectFieldKey("category")).toBe("caseCategory");
  });
});
