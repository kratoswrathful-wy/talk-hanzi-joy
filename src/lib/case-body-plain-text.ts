/** 把案件說明 BlockNote JSON 的文字節點依序接起來。 */
export function plainTextFromCaseBodyContent(value: unknown): string {
  const texts: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (typeof rec.text === "string") texts.push(rec.text);
    if (rec.content !== undefined) walk(rec.content);
    if (rec.children !== undefined) walk(rec.children);
  };
  if (typeof value === "string") {
    if (value === "" || value === "[]" || value === "null") return "";
    try {
      walk(JSON.parse(value) as unknown);
      return texts.join("");
    } catch {
      return value;
    }
  }
  walk(value);
  return texts.join("");
}
