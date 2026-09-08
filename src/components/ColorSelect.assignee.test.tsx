import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ColorSelect from "@/components/ColorSelect";
import type { SelectOption } from "@/stores/select-options-store";

const uuidA = "550e8400-e29b-41d4-a716-446655440000";
const uuidB = "660e8400-e29b-41d4-a716-446655440001";

const mockOptions: SelectOption[] = [
  { id: uuidA, label: "Alice", color: "#111111", sortOrder: 0 },
  { id: uuidB, label: "Alice", color: "#222222", sortOrder: 1 },
];

vi.mock("@/components/ProfileViewerDialog", () => ({
  default: () => null,
}));

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
  PRESET_COLORS: ["#111111"],
  CONTACT_DEFAULT_COLOR: "#333333",
}));

vi.mock("@/stores/label-style-store", () => ({
  useLabelStyles: () => ({
    client: { textColor: "#fff" },
    dispatchRoute: { textColor: "#fff" },
    billingUnit: { textColor: "#fff" },
    taskType: { textColor: "#fff" },
    caseCategory: { textColor: "#fff" },
  }),
  labelStyleStore: {},
}));

describe("ColorSelect assignee wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clicking second same-label option returns that option UUID", () => {
    const onAssigneeSelect = vi.fn();
    render(
      <ColorSelect
        fieldKey="assignee"
        value=""
        onValueChange={vi.fn()}
        onAssigneeSelect={onAssigneeSelect}
        defaultOpen
      />,
    );

    const buttons = screen.getAllByRole("button");
    const optionButtons = buttons.filter((b) => b.textContent?.includes("Alice"));
    expect(optionButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(optionButtons[1]!);

    expect(onAssigneeSelect).toHaveBeenCalledWith({ userId: uuidB, label: "Alice" });
  });

  it("clear passes null via onAssigneeSelect contract", () => {
    const onAssigneeSelect = vi.fn();
    render(
      <ColorSelect
        fieldKey="assignee"
        value="Alice"
        onValueChange={vi.fn()}
        onAssigneeSelect={onAssigneeSelect}
        defaultOpen
      />,
    );

    const clearButtons = screen.getAllByTitle("取消選取");
    fireEvent.click(clearButtons[0]!);
    expect(onAssigneeSelect).toHaveBeenCalledWith(null);
  });

  it("non-assignee field uses onValueChange only", () => {
    const onValueChange = vi.fn();
    const onAssigneeSelect = vi.fn();
    render(
      <ColorSelect
        fieldKey="client"
        value=""
        onValueChange={onValueChange}
        onAssigneeSelect={onAssigneeSelect}
        defaultOpen
      />,
    );

    const clientBtn = screen.getAllByText("Alice")[0]!.closest("button");
    expect(clientBtn).toBeTruthy();
    fireEvent.click(clientBtn!);
    expect(onValueChange).toHaveBeenCalledWith("Alice");
    expect(onAssigneeSelect).not.toHaveBeenCalled();
  });
});
