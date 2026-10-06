function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function extractInlineText(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  return nodes
    .map((node) => {
      if (!isRecord(node)) return "";
      if (node.type === "text" && typeof node.text === "string") return node.text;
      if (node.content !== undefined) return extractInlineText(node.content);
      return "";
    })
    .join("");
}

function extractCellText(cell: unknown): string {
  if (Array.isArray(cell)) return extractInlineText(cell);
  if (!isRecord(cell)) return "";
  if (Array.isArray(cell.content)) {
    const inline = extractInlineText(cell.content);
    if (inline) return inline;
    return cell.content.map(extractBlockText).filter(Boolean).join(" ");
  }
  if (isRecord(cell.content)) return extractTableOrInline(cell.content);
  return "";
}

function extractTableContent(content: Record<string, unknown>): string {
  const rows = content.rows;
  if (!Array.isArray(rows)) return "";
  const lines: string[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !Array.isArray(row.cells)) continue;
    const cellTexts = row.cells.map(extractCellText).filter(Boolean);
    if (cellTexts.length) lines.push(cellTexts.join("\t"));
  }
  return lines.join("\n");
}

function extractTableOrInline(content: unknown): string {
  if (Array.isArray(content)) return extractInlineText(content);
  if (!isRecord(content)) return "";
  if (content.type === "tableContent" || Array.isArray(content.rows)) {
    return extractTableContent(content);
  }
  return "";
}

/** Recursively extract plain text from a BlockNote block. Must not throw on table content. */
export function extractBlockText(block: unknown): string {
  if (!isRecord(block)) return "";
  const inline = extractTableOrInline(block.content);
  const childText = Array.isArray(block.children)
    ? block.children.map(extractBlockText).filter(Boolean).join("\n")
    : "";
  return [inline, childText].filter(Boolean).join("\n");
}

/**
 * 案件頁省略預覽用：在子元件內呼叫，勿在父頁 render 直接 map。
 * extractText 僅供測試注入受控拋錯；產品路徑用 extractBlockText。
 */
export function previewBodyText(
  blocks: unknown,
  extractText: (block: unknown) => string = extractBlockText,
): string {
  if (!Array.isArray(blocks)) return "";
  return blocks.map(extractText).filter(Boolean).join("\n");
}
