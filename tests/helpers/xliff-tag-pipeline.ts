/**
 * 讀 cat-tool/js/xliff-tag-pipeline.js 原始碼、在 jsdom 環境內執行，掛到 window.CatToolXliffTags。
 * 不修改 cat-tool 原始碼（維持 IIFE + window 掛載慣例），僅在測試層以 Function 建構子載入。
 */
import fs from "node:fs";
import path from "node:path";

export interface XliffTag {
  ph: string;
  xml: string;
  display: string;
  displayFull: string;
  type: "standalone" | "open" | "close";
  pairNum: number;
  num: number;
}

export interface ExtractTaggedTextResult {
  text: string;
  tags: XliffTag[];
}

export interface CatToolXliffTags {
  extractTaggedText: (xmlNode: Element, opts?: { transparentG?: boolean }) => ExtractTaggedTextResult;
  replacePlaceholders: (text: string, tags: XliffTag[], fallbackTags?: XliffTag[]) => string;
  setXmlTargetContent: (
    xmlDoc: Document,
    targetNode: Element,
    restoredXml: string,
    options?: Record<string, unknown>,
  ) => void;
}

declare global {
  interface Window {
    CatToolXliffTags?: CatToolXliffTags;
  }
}

let cached: CatToolXliffTags | null = null;

export function loadXliffTagPipeline(): CatToolXliffTags {
  if (cached) return cached;
  const filePath = path.resolve(__dirname, "../../cat-tool/js/xliff-tag-pipeline.js");
  const code = fs.readFileSync(filePath, "utf8");
  const install = new Function("window", "document", code);
  install(window, document);
  if (!window.CatToolXliffTags) {
    throw new Error("xliff-tag-pipeline.js 執行後未掛載 window.CatToolXliffTags，載入方式可能已與原始碼不符。");
  }
  cached = window.CatToolXliffTags;
  return cached;
}

/** 解析 XML 字串為 Document，解析失敗（含 parsererror 節點）時直接拋錯，避免測試誤判通過。 */
export function parseXmlDoc(xmlString: string): Document {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) {
    throw new Error(`XML 解析失敗：${err.textContent ?? ""}`);
  }
  return doc;
}

export function serializeNode(node: Node): string {
  return new XMLSerializer().serializeToString(node);
}

/** 取節點的第一個具名子元素（忽略文字節點），供測試找 trans-unit/source/target/mrk 等。 */
export function firstElementByLocalName(root: Document | Element, localName: string): Element {
  const list = root.getElementsByTagName("*");
  for (let i = 0; i < list.length; i++) {
    if (list[i].localName === localName) return list[i];
  }
  throw new Error(`找不到元素：${localName}`);
}
