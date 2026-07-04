import { describe, it, expect } from "vitest";
import { mergeArrayById, resolveArrayPatch } from "./ai-agent-array-merge";

interface Row {
  id: string;
  value: string;
}

describe("mergeArrayById", () => {
  it("新增：patch 帶入不存在的 id 時附加到結果", () => {
    const existing: Row[] = [{ id: "a", value: "old-a" }];
    const patch: Row[] = [{ id: "b", value: "new-b" }];
    const result = mergeArrayById(existing, patch);
    expect(result).toEqual([
      { id: "a", value: "old-a" },
      { id: "b", value: "new-b" },
    ]);
  });

  it("更新：patch 同 id 時覆寫該列其餘欄位，id 維持不變", () => {
    const existing: Row[] = [{ id: "a", value: "old-a" }];
    const patch: Row[] = [{ id: "a", value: "updated-a" }];
    const result = mergeArrayById(existing, patch);
    expect(result).toEqual([{ id: "a", value: "updated-a" }]);
  });

  it("保留：patch 未提及的既有列原樣保留", () => {
    const existing: Row[] = [
      { id: "a", value: "a" },
      { id: "b", value: "b" },
    ];
    const patch: Row[] = [{ id: "a", value: "a2" }];
    const result = mergeArrayById(existing, patch);
    expect(result).toEqual([
      { id: "a", value: "a2" },
      { id: "b", value: "b" },
    ]);
  });

  it("空陣列：patch 為空時原樣回傳既有列", () => {
    const existing: Row[] = [{ id: "a", value: "a" }];
    const result = mergeArrayById(existing, []);
    expect(result).toEqual(existing);
  });

  it("空陣列：existing 為空、patch 有值時直接採用 patch", () => {
    const patch: Row[] = [{ id: "a", value: "a" }];
    const result = mergeArrayById([], patch);
    expect(result).toEqual(patch);
  });

  it("不變動輸入（immutability）：existing／patch 原陣列與其內容物件不被修改", () => {
    const existing: Row[] = [{ id: "a", value: "old-a" }];
    const patch: Row[] = [{ id: "a", value: "updated-a" }];
    const existingSnapshot = JSON.parse(JSON.stringify(existing));
    const patchSnapshot = JSON.parse(JSON.stringify(patch));

    const result = mergeArrayById(existing, patch);

    expect(existing).toEqual(existingSnapshot);
    expect(patch).toEqual(patchSnapshot);
    // 回傳的物件應為新物件，而非既有列或 patch 列的參照
    expect(result[0]).not.toBe(existing[0]);
    expect(result[0]).not.toBe(patch[0]);
  });

  it("patch 列缺少 id 時，以自動產生的 id 附加（不覆寫既有列）", () => {
    const existing: Row[] = [{ id: "a", value: "a" }];
    const patch = [{ id: "", value: "no-id" }] as Row[];
    const result = mergeArrayById(existing, patch);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "a", value: "a" });
    expect(result[1].value).toBe("no-id");
    expect(result[1].id).not.toBe("");
  });
});

describe("resolveArrayPatch", () => {
  const existing: Row[] = [{ id: "a", value: "old" }];

  it("value 為純陣列時：整包取代（不合併既有列）", () => {
    const value = [{ id: "b", value: "new" }];
    const result = resolveArrayPatch(existing, value);
    expect(result).toEqual([{ id: "b", value: "new" }]);
  });

  it("value 為 { mergeById: true, items } 時：依 id 合併既有列", () => {
    const value = { mergeById: true, items: [{ id: "a", value: "merged" }] };
    const result = resolveArrayPatch(existing, value);
    expect(result).toEqual([{ id: "a", value: "merged" }]);
  });

  it("value 為 { items } 但 mergeById 非 true 時：整包取代為 items", () => {
    const value = { items: [{ id: "c", value: "replace" }] };
    const result = resolveArrayPatch(existing, value);
    expect(result).toEqual([{ id: "c", value: "replace" }]);
  });

  it("value 為 null／非物件非陣列：回傳 null（呼叫端應略過此 patch）", () => {
    expect(resolveArrayPatch(existing, null)).toBeNull();
    expect(resolveArrayPatch(existing, "字串")).toBeNull();
    expect(resolveArrayPatch(existing, 123)).toBeNull();
  });

  it("value 為空物件（無 items）：回傳 null", () => {
    expect(resolveArrayPatch(existing, {})).toBeNull();
  });
});
