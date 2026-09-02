import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MultiColorSelect from "@/components/MultiColorSelect";
import type { SelectOption } from "@/stores/select-options-store";

const uuidA = "550e8400-e29b-41d4-a716-446655440000";
const uuidB = "660e8400-e29b-41d4-a716-446655440001";

const mockOptions: SelectOption[] = [
  { id: uuidA, label: "Alice", color: "#111", sortOrder: 0 },
  { id: uuidB, label: "Alice", color: "#222", sortOrder: 1 },
];

vi.mock("@/stores/select-options-store", () => ({
  useSelectOptions: () => ({ options: mockOptions, customColors: [] }),
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
  useLabelStyles: () => ({ taskType: { textColor: "#fff" }, billingUnit: { textColor: "#fff" } }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/use-case-store", () => ({
  useCases: () => [],
}));

describe("MultiColorSelect assignee selectedIds", () => {
  it("selectedIds mode toggles second same-label UUID", () => {
    const onAssigneeSelectionsChange = vi.fn();
    render(
      <MultiColorSelect
        fieldKey="assignee"
        values={["Alice"]}
        selectedIds={[uuidB]}
        onValuesChange={vi.fn()}
        onAssigneeSelectionsChange={onAssigneeSelectionsChange}
        defaultOpen
      />,
    );

    const buttons = screen.getAllByRole("button");
    const optionButtons = buttons.filter((b) => b.textContent?.includes("Alice"));
    fireEvent.click(optionButtons[1]!);
    expect(onAssigneeSelectionsChange).toHaveBeenCalledWith([]);
  });

  it("toggle second same-label option reports second UUID", () => {
    const onAssigneeSelectionsChange = vi.fn();
    render(
      <MultiColorSelect
        fieldKey="assignee"
        values={[]}
        selectedIds={[]}
        onValuesChange={vi.fn()}
        onAssigneeSelectionsChange={onAssigneeSelectionsChange}
        defaultOpen
      />,
    );

    const buttons = screen.getAllByRole("button");
    const optionButtons = buttons.filter((b) => b.textContent?.includes("Alice"));
    fireEvent.click(optionButtons[1]!);
    expect(onAssigneeSelectionsChange).toHaveBeenCalledWith([
      { userId: uuidB, label: "Alice" },
    ]);
  });

  it("non-assignee taskType still toggles by label", () => {
    const onValuesChange = vi.fn();
    render(
      <MultiColorSelect
        fieldKey="taskType"
        values={[]}
        onValuesChange={onValuesChange}
        defaultOpen
      />,
    );
    const btn = screen.getAllByRole("button").find((b) => b.textContent?.includes("Alice"));
    fireEvent.click(btn!);
    expect(onValuesChange).toHaveBeenCalledWith(["Alice"]);
  });
});
