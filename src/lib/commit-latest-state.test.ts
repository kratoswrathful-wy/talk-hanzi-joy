import { describe, expect, it } from "vitest";
import { computeThenSet, wrapLatestSetter } from "./commit-latest-state";

describe("computeThenSet", () => {
  it("連續兩次用上一筆結果，不靠閉包舊值", () => {
    const latest = { current: [{ id: "a", unitPrice: 0, unitCount: 0 }] };
    const setState = (next: typeof latest.current) => {
      latest.current = next;
    };
    const first = computeThenSet(latest, setState, (prev) =>
      prev.map((row) => (row.id === "a" ? { ...row, unitPrice: 1500 } : row)),
    );
    const second = computeThenSet(latest, setState, (prev) =>
      prev.map((row) => (row.id === "a" ? { ...row, unitCount: 3 } : row)),
    );
    expect(first).toEqual([{ id: "a", unitPrice: 1500, unitCount: 0 }]);
    expect(second).toEqual([{ id: "a", unitPrice: 1500, unitCount: 3 }]);
    expect(latest.current).toBe(second);
  });

  it("compute 內不得被當成 persist：只回傳新值", () => {
    const latest = { current: "甲" };
    const persistCalls: string[] = [];
    const next = computeThenSet(latest, (value) => {
      latest.current = value;
    }, (prev) => `${prev}乙`);
    persistCalls.push(next);
    expect(persistCalls).toEqual(["甲乙"]);
    expect(latest.current).toBe("甲乙");
  });

  it("wrapLatestSetter 讓直接 set 與 computeThenSet 共用同一最新值", () => {
    const reactBox = { value: { client: "", po: "" } };
    const latest = { current: reactBox.value };
    const setState = wrapLatestSetter(latest, (next) => {
      reactBox.value = next;
    });
    setState({ client: "CCJK", po: "" });
    const next = computeThenSet(latest, (value) => {
      reactBox.value = value;
    }, (prev) => ({ ...prev, po: "PO-1" }));
    expect(next).toEqual({ client: "CCJK", po: "PO-1" });
    expect(reactBox.value).toEqual(next);
  });
});
