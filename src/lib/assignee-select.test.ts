import { describe, expect, it } from "vitest";
import {
  assigneeOptionToPayload,
  assigneeSelectionsFromIds,
  primaryAssigneeUserId,
} from "@/lib/assignee-select";

describe("assignee-select", () => {
  const uuidA = "550e8400-e29b-41d4-a716-446655440000";
  const uuidB = "660e8400-e29b-41d4-a716-446655440001";

  it("assigneeOptionToPayload uses option id directly", () => {
    expect(assigneeOptionToPayload({ id: uuidA, label: "Alice" })).toEqual({
      userId: uuidA,
      label: "Alice",
    });
  });

  it("rejects invitation pseudo ids", () => {
    expect(
      assigneeOptionToPayload({ id: "assignee-bob@test.local", label: "bob@test.local" }),
    ).toBeNull();
  });

  it("same label different ids stay distinct via id set", () => {
    const options = [
      { id: uuidA, label: "Alice" },
      { id: uuidB, label: "Alice" },
    ];
    const selected = assigneeSelectionsFromIds(options, new Set([uuidB]));
    expect(selected).toEqual([{ userId: uuidB, label: "Alice" }]);
  });

  it("primaryAssigneeUserId returns first trusted id", () => {
    expect(
      primaryAssigneeUserId([
        { userId: uuidA, label: "A" },
        { userId: uuidB, label: "B" },
      ]),
    ).toBe(uuidA);
  });

  it("clear selection is null user id", () => {
    expect(primaryAssigneeUserId([])).toBeNull();
  });
});
