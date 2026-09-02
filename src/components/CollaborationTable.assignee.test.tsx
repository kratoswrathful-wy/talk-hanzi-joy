import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CollaborationTable from "@/components/CollaborationTable";
import type { CollabRow } from "@/data/case-types";

const uuidA = "550e8400-e29b-41d4-a716-446655440000";
const uuidB = "660e8400-e29b-41d4-a716-446655440001";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    primaryRole: "pm",
    profile: { id: uuidA, display_name: "Member A" },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

vi.mock("@/components/ColorSelect", () => ({
  default: ({
    onAssigneeSelect,
    "data-testid": testId,
  }: {
    onAssigneeSelect?: (s: { userId: string; label: string } | null) => void;
    "data-testid"?: string;
  }) => (
    <div>
      <button
        type="button"
        data-testid={testId ?? "pick-row"}
        onClick={() => onAssigneeSelect?.({ userId: uuidB, label: "Alice" })}
      >
        pick-row
      </button>
      <button
        type="button"
        data-testid="clear-row"
        onClick={() => onAssigneeSelect?.(null)}
      >
        clear-row
      </button>
    </div>
  ),
}));

describe("CollaborationTable assignee", () => {
  const baseRow: CollabRow = {
    id: "row-1",
    segment: "A",
    translator: "",
    translatorUserId: null,
    unitCount: 0,
    translationDeadline: null,
    accepted: false,
    taskCompleted: false,
    delivered: false,
  };

  it("single row assign uses clicked UUID (same label)", () => {
    const onChange = vi.fn();
    render(
      <CollaborationTable
        rows={[baseRow]}
        onChange={onChange}
        caseStatus="dispatched"
      />,
    );
    fireEvent.click(screen.getByTestId("pick-row"));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ translator: "Alice", translatorUserId: uuidB }),
    ]);
  });

  it("batch assign stores UUID from selection", () => {
    const onChange = vi.fn();
    render(
      <CollaborationTable
        rows={[baseRow, { ...baseRow, id: "row-2" }]}
        onChange={onChange}
        caseStatus="dispatched"
      />,
    );
    const bulkButtons = screen.getAllByRole("button").filter((b) =>
      b.className.includes("h-4") && b.querySelector("svg"),
    );
    fireEvent.click(bulkButtons.find((b) => b.querySelector(".lucide-users")) ?? bulkButtons[0]!);
    const pickButtons = screen.getAllByTestId("pick-row");
    fireEvent.click(pickButtons[pickButtons.length - 1]!);
    fireEvent.click(screen.getByText("套用到所有列"));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ translatorUserId: uuidB }),
      expect.objectContaining({ translatorUserId: uuidB }),
    ]);
  });

  it("clear row sets translatorUserId null", () => {
    const onChange = vi.fn();
    render(
      <CollaborationTable
        rows={[{ ...baseRow, translator: "Alice", translatorUserId: uuidA }]}
        onChange={onChange}
        caseStatus="dispatched"
      />,
    );
    fireEvent.click(screen.getByTestId("clear-row"));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ translator: "", translatorUserId: null }),
    ]);
  });
});
