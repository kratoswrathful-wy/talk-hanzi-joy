import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeArrayById } from "./ai-agent-array-merge";

describe("mergeArrayById", () => {
  it("合併同 id 列並保留未提及列", () => {
    const existing = [
      { id: "a", taskType: "翻譯", unitCount: 100 },
      { id: "b", taskType: "校對", unitCount: 50 },
    ];
    const patch = [{ id: "a", unitCount: 200 }];
    const out = mergeArrayById(existing, patch);
    expect(out).toHaveLength(2);
    expect(out.find((x) => x.id === "a")?.unitCount).toBe(200);
    expect(out.find((x) => x.id === "b")?.unitCount).toBe(50);
  });
});

describe("uploadFromBytes validation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("缺少 fileName 時失敗", async () => {
    const { uploadFromBytes } = await import("./ai-agent-upload");
    const r = await uploadFromBytes({ fileName: "", base64: "abc" });
    expect(r.ok).toBe(false);
  });
});
