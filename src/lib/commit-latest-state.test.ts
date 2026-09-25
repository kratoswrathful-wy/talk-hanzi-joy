import { describe, expect, it } from "vitest";
import { computeThenSet } from "./commit-latest-state";

function fakeSetState<T>(box: { value: T }) {
  return (updater: (prev: T) => T) => {
    box.value = updater(box.value);
  };
}

describe("computeThenSet", () => {
  it("連續兩次用上一筆結果，不靠閉包舊值", () => {
    const box = { value: [{ id: "a", unitPrice: 0, unitCount: 0 }] };
    const first = computeThenSet(fakeSetState(box), (prev) =>
      prev.map((row) => (row.id === "a" ? { ...row, unitPrice: 1500 } : row)),
    );
    const second = computeThenSet(fakeSetState(box), (prev) =>
      prev.map((row) => (row.id === "a" ? { ...row, unitCount: 3 } : row)),
    );
    expect(first).toEqual([{ id: "a", unitPrice: 1500, unitCount: 0 }]);
    expect(second).toEqual([{ id: "a", unitPrice: 1500, unitCount: 3 }]);
    expect(box.value).toBe(second);
  });

  it("compute 內不得被當成 persist：只回傳新值", () => {
    const box = { value: "甲" };
    const persistCalls: string[] = [];
    const next = computeThenSet(fakeSetState(box), (prev) => `${prev}乙`);
    persistCalls.push(next);
    expect(persistCalls).toEqual(["甲乙"]);
    expect(box.value).toBe("甲乙");
  });
});
