import { describe, it, expect } from "vitest";
import { mergeArrayById, resolveArrayPatch } from "./ai-agent-array-merge";

interface Row {
  id: string;
  name: string;
  value?: number;
}

describe("mergeArrayById", () => {
  it("patch 新增一筆不存在的 id 時附加到結果", () => {
    const existing: Row[] = [{ id: "a", name: "Alice" }];
    const patch: Row[] = [{ id: "b", name: "Bob" }];
    const result = mergeArrayById(existing, patch);
    expect(result).toEqual([{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }]);
  });

  it("patch 命中同 id 時覆寫該筆內容", () => {
    const existing: Row[] = [{ id: "a", name: "Alice", value: 1 }];
    const patch: Row[] = [{ id: "a", name: "Alice2", value: 2 }];
    const result = mergeArrayById(existing, patch);
    expect(result).toEqual([{ id: "a", name: "Alice2", value: 2 }]);
  });

  it("未被 patch 提及的既有列保留不變", () => {
    const existing: Row[] = [
      { id: "a", name: "Alice" },
      { id: "b", name: "Bob" },
    ];
    const patch: Row[] = [{ id: "a", name: "Alice2" }];
    const result = mergeArrayById(existing, patch);
    expect(result).toEqual([
      { id: "a", name: "Alice2" },
      { id: "b", name: "Bob" },
    ]);
  });

  it("patch 為空陣列時回傳既有列（原樣、非引用相等的新陣列）", () => {
    const existing: Row[] = [{ id: "a", name: "Alice" }];
    const result = mergeArrayById(existing, []);
    expect(result).toEqual(existing);
  });

  it("existing 為空陣列時，結果等於 patch（逐筆補上 id）", () => {
    const patch: Row[] = [{ id: "a", name: "Alice" }];
    const result = mergeArrayById([], patch);
    expect(result).toEqual([{ id: "a", name: "Alice" }]);
  });

  it("patch 中無 id 的列會被指派新 id 並附加（不覆寫既有列）", () => {
    const existing: Row[] = [{ id: "a", name: "Alice" }];
    const patch = [{ id: "", name: "NoId" }] as Row[];
    const result = mergeArrayById(existing, patch);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "a", name: "Alice" });
    expect(result[1].name).toBe("NoId");
    expect(result[1].id).toBeTruthy();
    expect(result[1].id).not.toBe("a");
  });

  it("不變動輸入陣列與物件（immutability）", () => {
    const existing: Row[] = [{ id: "a", name: "Alice" }];
    const patch: Row[] = [{ id: "a", name: "Alice2" }];
    const existingSnapshot = JSON.parse(JSON.stringify(existing));
    const patchSnapshot = JSON.parse(JSON.stringify(patch));

    mergeArrayById(existing, patch);

    expect(existing).toEqual(existingSnapshot);
    expect(patch).toEqual(patchSnapshot);
  });

  it("保留 existing 原本的相對順序，patch 新增項目依序附加於後", () => {
    const existing: Row[] = [
      { id: "b", name: "Bob" },
      { id: "a", name: "Alice" },
    ];
    const patch: Row[] = [{ id: "c", name: "Carol" }];
    const result = mergeArrayById(existing, patch);
    expect(result.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("resolveArrayPatch", () => {
  const existing: Row[] = [{ id: "a", name: "Alice" }];

  it("value 為純陣列時整包取代（不合併既有列）", () => {
    const patch: Row[] = [{ id: "b", name: "Bob" }];
    const result = resolveArrayPatch(existing, patch);
    expect(result).toEqual([{ id: "b", name: "Bob" }]);
  });

  it("value 為 { mergeById: true, items } 時走 mergeArrayById 合併", () => {
    const result = resolveArrayPatch(existing, { mergeById: true, items: [{ id: "a", name: "Alice2" }] });
    expect(result).toEqual([{ id: "a", name: "Alice2" }]);
  });

  it("value 為 { items } 但 mergeById 為 false／缺省時整包取代", () => {
    const result = resolveArrayPatch(existing, { items: [{ id: "b", name: "Bob" }] });
    expect(result).toEqual([{ id: "b", name: "Bob" }]);
  });

  it("value 為 null 時回傳 null（不合法 patch）", () => {
    expect(resolveArrayPatch(existing, null)).toBeNull();
  });

  it("value 為字串等非物件型別時回傳 null", () => {
    expect(resolveArrayPatch(existing, "not an array")).toBeNull();
  });

  it("value 為物件但缺 items 欄位時回傳 null", () => {
    expect(resolveArrayPatch(existing, { foo: "bar" })).toBeNull();
  });

  it("mergeById 為 true 但 items 非陣列時回傳 null", () => {
    expect(resolveArrayPatch(existing, { mergeById: true, items: "not-array" })).toBeNull();
  });
});
