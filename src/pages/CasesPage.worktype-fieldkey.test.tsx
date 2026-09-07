import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineEditCell } from "@/components/fees/InlineEditCell";
import { caseTableSelectFieldKey } from "@/lib/case-table-select-field-keys";
import type { SelectOption } from "@/stores/select-options-store";

const TASK_TYPE_OPTIONS: SelectOption[] = [
  { id: "tt-1", label: "翻譯", color: "#2563EB", sortOrder: 0 },
  { id: "tt-2", label: "校對", color: "#16A34A", sortOrder: 1 },
  { id: "tt-3", label: "MTPE", color: "#CA8A04", sortOrder: 2 },
];

/** 模擬正式設定：taskType 有選項；誤用的 workType 桶為空。 */
const useSelectOptionsMock = vi.fn((fieldKey: string) => {
  if (fieldKey === "taskType") {
    return { options: TASK_TYPE_OPTIONS, customColors: [] as string[] };
  }
  return { options: [] as SelectOption[], customColors: [] as string[] };
});

vi.mock("@/stores/select-options-store", () => ({
  useSelectOptions: (fieldKey: string) => useSelectOptionsMock(fieldKey),
  selectOptionsStore: {
    addOption: vi.fn(),
    deleteOption: vi.fn(),
    renameOption: vi.fn(),
    updateOptionColor: vi.fn(),
    addCustomColor: vi.fn(),
    removeCustomColor: vi.fn(),
  },
  PRESET_COLORS: ["#111"],
}));

vi.mock("@/stores/label-style-store", () => ({
  useLabelStyles: () => ({
    taskType: { textColor: "#fff" },
    billingUnit: { textColor: "#fff" },
    caseCategory: { textColor: "#fff" },
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/use-case-store", () => ({
  useCases: () => [],
}));

function extractWorkTypeColumnSource(src: string): string {
  const start = src.indexOf('key: "workType"');
  expect(start, "CasesPage must define workType column").toBeGreaterThanOrEqual(0);
  const next = src.indexOf('key: "billingUnit"', start);
  expect(next, "workType column must be followed by billingUnit").toBeGreaterThan(start);
  return src.slice(start, next);
}

/**
 * CasesPage 工作類型欄位接線回歸：
 * - 實際頁面原始碼不得再寫死 fieldKey="workType"
 * - 以與 CasesPage 相同的 helper＋onCommit("workType") 接線做互動 mock
 */
describe("CasesPage workType column wiring", () => {
  beforeEach(() => {
    useSelectOptionsMock.mockClear();
  });

  it("CasesPage workType InlineEditCell 使用 caseTableSelectFieldKey，且提交欄位仍為 workType", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/CasesPage.tsx"), "utf8");
    expect(src).toContain('import { caseTableSelectFieldKey } from "@/lib/case-table-select-field-keys"');

    const col = extractWorkTypeColumnSource(src);
    expect(col).toContain('fieldKey={caseTableSelectFieldKey("workType")}');
    expect(col).toContain('onCommit={(v) => onCommit("workType", v)}');
    expect(col).not.toMatch(/fieldKey\s*=\s*["']workType["']/);
    expect(col).not.toMatch(/fieldKey\s*=\s*\{\s*["']workType["']\s*\}/);
  });

  it("與 CasesPage 相同接線：選項來自 taskType、既有多選勾選、提交鍵為 workType", () => {
    const onFieldCommit = vi.fn();
    const fieldKey = caseTableSelectFieldKey("workType");
    expect(fieldKey).toBe("taskType");

    render(
      <InlineEditCell
        value={["翻譯"]}
        type="multiColorSelect"
        fieldKey={fieldKey}
        editable
        onCommit={(v) => onFieldCommit("workType", v)}
      >
        <span data-testid="wt-label">翻譯</span>
      </InlineEditCell>,
    );

    const optionButton = (label: string) =>
      screen.getAllByRole("button").find(
        (b) => b.textContent?.trim() === label && b.className.includes("py-1.5"),
      );

    fireEvent.click(screen.getByTestId("wt-label"));

    expect(useSelectOptionsMock).toHaveBeenCalledWith("taskType");
    expect(useSelectOptionsMock).not.toHaveBeenCalledWith("workType");

    expect(optionButton("翻譯")).toBeTruthy();
    expect(optionButton("校對")).toBeTruthy();
    expect(optionButton("MTPE")).toBeTruthy();

    expect(optionButton("校對")!.className).not.toMatch(/bg-destructive\/30/);
    expect(optionButton("翻譯")!.className).toMatch(/bg-destructive\/30/);

    fireEvent.click(optionButton("校對")!);
    expect(onFieldCommit).toHaveBeenCalledWith("workType", ["翻譯", "校對"]);
  });

  it("誤用 fieldKey=workType 時選項桶為空（對照缺陷）", () => {
    render(
      <InlineEditCell
        value={["翻譯"]}
        type="multiColorSelect"
        fieldKey="workType"
        editable
        onCommit={vi.fn()}
      >
        <span data-testid="wt-broken">翻譯</span>
      </InlineEditCell>,
    );
    fireEvent.click(screen.getByTestId("wt-broken"));
    expect(useSelectOptionsMock).toHaveBeenCalledWith("workType");
    expect(screen.queryByText("校對")).toBeNull();
    expect(screen.queryByText("MTPE")).toBeNull();
  });

  it("重新開啟仍保留既有多選勾選", () => {
    const { unmount } = render(
      <InlineEditCell
        value={["翻譯", "校對"]}
        type="multiColorSelect"
        fieldKey={caseTableSelectFieldKey("workType")}
        editable
        onCommit={vi.fn()}
      >
        <span data-testid="wt-reopen">翻譯、校對</span>
      </InlineEditCell>,
    );

    const optionButton = (label: string) =>
      screen.getAllByRole("button").find(
        (b) => b.textContent?.trim() === label && b.className.includes("py-1.5"),
      );

    fireEvent.click(screen.getByTestId("wt-reopen"));
    for (const label of ["翻譯", "校對"]) {
      expect(optionButton(label)!.className).toMatch(/bg-destructive\/30/);
    }
    unmount();

    render(
      <InlineEditCell
        value={["翻譯", "校對"]}
        type="multiColorSelect"
        fieldKey={caseTableSelectFieldKey("workType")}
        editable
        onCommit={vi.fn()}
      >
        <span data-testid="wt-reopen-2">翻譯、校對</span>
      </InlineEditCell>,
    );
    fireEvent.click(screen.getByTestId("wt-reopen-2"));
    for (const label of ["翻譯", "校對"]) {
      expect(optionButton(label)!.className).toMatch(/bg-destructive\/30/);
    }
  });

  it("editable=false 時不進入編輯（唯讀）", () => {
    render(
      <InlineEditCell
        value={["翻譯"]}
        type="multiColorSelect"
        fieldKey={caseTableSelectFieldKey("workType")}
        editable={false}
        onCommit={vi.fn()}
      >
        <span data-testid="wt-ro">翻譯</span>
      </InlineEditCell>,
    );
    fireEvent.click(screen.getByTestId("wt-ro"));
    expect(screen.queryByPlaceholderText("搜尋...")).toBeNull();
    expect(useSelectOptionsMock).not.toHaveBeenCalled();
  });
});
