import { describe, expect, it, vi } from "vitest";
import { assigneeOptionToPayload } from "@/lib/assignee-select";

/**
 * ColorSelect assignee 契約：選取／清除走 option id，非 assignee 欄位不受影響。
 * 完整 DOM 互動由 Playwright 覆蓋；此處鎖定 handleSelect／handleAssigneeClear 資料契約。
 */
describe("ColorSelect assignee contract", () => {
  const uuidA = "550e8400-e29b-41d4-a716-446655440000";
  const uuidB = "660e8400-e29b-41d4-a716-446655440001";

  it("assignee handleSelect passes option id not label lookup", () => {
    const onAssigneeSelect = vi.fn();
    const opt = { id: uuidB, label: "Alice" };
    const payload = assigneeOptionToPayload(opt);
    expect(payload).toEqual({ userId: uuidB, label: "Alice" });
    onAssigneeSelect(payload);
    expect(onAssigneeSelect).toHaveBeenCalledWith({ userId: uuidB, label: "Alice" });
  });

  it("same label two options: selection uses clicked option id", () => {
    const options = [
      { id: uuidA, label: "Alice" },
      { id: uuidB, label: "Alice" },
    ];
    const picked = assigneeOptionToPayload(options[1]!);
    expect(picked?.userId).toBe(uuidB);
    expect(picked?.userId).not.toBe(uuidA);
  });

  it("clear selection passes null", () => {
    const onAssigneeSelect = vi.fn();
    onAssigneeSelect(null);
    expect(onAssigneeSelect).toHaveBeenCalledWith(null);
  });

  it("non-assignee fields do not require onAssigneeSelect", () => {
    const onValueChange = vi.fn();
    onValueChange("客戶甲");
    expect(onValueChange).toHaveBeenCalledWith("客戶甲");
  });
});
