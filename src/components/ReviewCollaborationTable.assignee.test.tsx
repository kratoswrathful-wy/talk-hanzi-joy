import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReviewCollaborationTable from "@/components/ReviewCollaborationTable";

const uuidB = "660e8400-e29b-41d4-a716-446655440001";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/components/ColorSelect", () => ({
  default: ({
    onAssigneeSelect,
  }: {
    onAssigneeSelect?: (s: { userId: string; label: string } | null) => void;
  }) => (
    <div>
      <button type="button" data-testid="pick-reviewer" onClick={() => onAssigneeSelect?.({ userId: uuidB, label: "Alice" })}>
        pick
      </button>
      <button type="button" data-testid="clear-reviewer" onClick={() => onAssigneeSelect?.(null)}>
        clear
      </button>
    </div>
  ),
}));

describe("ReviewCollaborationTable assignee", () => {
  it("uses selected option UUID for same label", () => {
    const onChange = vi.fn();
    render(
      <ReviewCollaborationTable
        rows={[{
          id: "r1",
          segment: "",
          reviewer: "",
          reviewerUserId: null,
          reviewDeadline: null,
          taskCompleted: false,
          linkedCatFileId: null,
          lineRange: null,
          accepted: true,
        }]}
        onChange={onChange}
        caseStatus="dispatched"
      />,
    );
    fireEvent.click(screen.getByTestId("pick-reviewer"));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ reviewer: "Alice", reviewerUserId: uuidB }),
    ]);
  });

  it("clear sets reviewerUserId null", () => {
    const onChange = vi.fn();
    render(
      <ReviewCollaborationTable
        rows={[{
          id: "r1",
          segment: "",
          reviewer: "Alice",
          reviewerUserId: uuidB,
          reviewDeadline: null,
          taskCompleted: false,
          linkedCatFileId: null,
          lineRange: null,
          accepted: true,
        }]}
        onChange={onChange}
        caseStatus="dispatched"
      />,
    );
    fireEvent.click(screen.getByTestId("clear-reviewer"));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ reviewer: "", reviewerUserId: null }),
    ]);
  });
});
