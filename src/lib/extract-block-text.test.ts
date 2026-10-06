import { describe, expect, it } from "vitest";
import { extractBlockText, previewBodyText } from "./extract-block-text";

/** 修前實作：content 不是陣列時會對 .map 拋錯。只留在測試裡對照，不進產品。 */
function extractBlockTextLegacy(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const b = block as { content?: unknown[]; children?: unknown[] };
  const inline = (b.content || [])
    .map((n: unknown) => {
      const node = n as { type?: string; text?: string };
      return node?.type === "text" ? (node.text || "") : "";
    })
    .join("");
  const childText = (b.children || []).map(extractBlockTextLegacy).join("\n");
  return [inline, childText].filter(Boolean).join("\n");
}

const paragraph = {
  id: "p1",
  type: "paragraph",
  content: [{ type: "text", text: "一般段落", styles: {} }],
  children: [],
};

const tableBlock = {
  id: "t1",
  type: "table",
  content: {
    type: "tableContent",
    columnWidths: [120, 120],
    rows: [
      {
        cells: [
          [{ type: "text", text: "表頭甲", styles: {} }],
          [{ type: "text", text: "表頭乙", styles: {} }],
        ],
      },
      {
        cells: [
          { type: "tableCell", content: [{ type: "text", text: "儲存格一", styles: {} }] },
          { type: "tableCell", content: [{ type: "text", text: "儲存格二", styles: {} }] },
        ],
      },
    ],
  },
  children: [],
};

describe("extractBlockText B1", () => {
  it("修前：一般段落成功，合法表格對 content.map 拋錯", () => {
    expect(extractBlockTextLegacy(paragraph)).toBe("一般段落");
    expect(() => extractBlockTextLegacy(tableBlock)).toThrow(/map is not a function/);
  });

  it("修後：一般段落文字保留", () => {
    expect(extractBlockText(paragraph)).toBe("一般段落");
  });

  it("修後：表格列欄文字有保留、不拋錯", () => {
    expect(extractBlockText(tableBlock)).toBe("表頭甲\t表頭乙\n儲存格一\t儲存格二");
  });

  it("修後：巢狀 children 與缺欄不拋錯", () => {
    const nested = {
      type: "bulletListItem",
      content: [{ type: "text", text: "上層" }],
      children: [paragraph],
    };
    expect(extractBlockText(nested)).toBe("上層\n一般段落");
    expect(extractBlockText({ type: "paragraph" })).toBe("");
    expect(extractBlockText({ type: "unknown", content: { foo: 1 } })).toBe("");
    expect(extractBlockText(null)).toBe("");
  });

  it("B2 摘要路徑：完整 body 陣列含表格時 map 不拋錯，表格文字仍在", () => {
    const body = [paragraph, tableBlock];
    expect(() => previewBodyText(body)).not.toThrow();
    const preview = previewBodyText(body);
    expect(preview).toContain("一般段落");
    expect(preview).toContain("表頭甲");
    expect(preview).toContain("儲存格一");
  });

  it("非陣列 body 回空字串，不拋錯", () => {
    expect(previewBodyText(null)).toBe("");
    expect(previewBodyText({ type: "doc" })).toBe("");
  });
});
