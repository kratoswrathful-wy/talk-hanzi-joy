/**
 * Vitest 批次 2：XLIFF harness——為 CRITICAL 模組 cat-tool/js/xliff-tag-pipeline.js
 * 補 mqxliff／sdlxliff／一般 XLIFF 三格式最小合成樣本回歸測試（testing.mdc 規則 2）。
 *
 * 範圍（本輪刻意精簡，見 ENGINEERING_IMPROVEMENT_MASTER_PLAN §「Vitest 第二批」）：
 * - 三格式各一份最小合成樣本，涵蓋 bpt/ept、ph、g 三種行內標籤。
 * - 驗證核心不變量：extractTaggedText → replacePlaceholders → setXmlTargetContent 寫回
 *   → 再次 extractTaggedText，文字與標籤形狀必須與第一次擷取一致（匯出後重新匯入不失真）。
 * - 不含既有 bug-report 語料回填（該部分列為待辦，見主計畫）。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  firstElementByLocalName,
  loadXliffTagPipeline,
  parseXmlDoc,
  type XliffTag,
} from "./helpers/xliff-tag-pipeline";

function readFixture(name: string): string {
  return fs.readFileSync(path.resolve(__dirname, "fixtures/xliff", name), "utf8");
}

function tagShape(tags: XliffTag[]) {
  return tags.map((t) => ({ ph: t.ph, type: t.type, pairNum: t.pairNum, num: t.num, display: t.display }));
}

describe("xliff-tag-pipeline：三格式最小合成樣本回歸測試", () => {
  it("一般 XLIFF：bpt/ept + ph + g，擷取→還原→寫回→再擷取需一致", () => {
    const { extractTaggedText, replacePlaceholders, setXmlTargetContent } = loadXliffTagPipeline();
    const xmlDoc = parseXmlDoc(readFixture("minimal-generic.xliff"));
    const source = firstElementByLocalName(xmlDoc, "source");
    const target = firstElementByLocalName(xmlDoc, "target");

    const extracted = extractTaggedText(source);
    expect(extracted.text).toBe("Hello {1}world{/1} and {2} plus {3}emphasis{/3}.");
    expect(tagShape(extracted.tags)).toEqual([
      { ph: "{1}", type: "open", pairNum: 1, num: 1, display: "[b]" },
      { ph: "{/1}", type: "close", pairNum: 1, num: 1, display: "[/b]" },
      { ph: "{2}", type: "standalone", pairNum: 2, num: 2, display: "x-img" },
      { ph: "{3}", type: "open", pairNum: 3, num: 3, display: "<g>" },
      { ph: "{/3}", type: "close", pairNum: 3, num: 3, display: "</g>" },
    ]);

    // 注意：extracted.tags[i].xml 是 serializeToString(element) 的結果，元素若繼承根層級的預設
    // xmlns（本 fixture 的 xliff 1.2 命名空間即是），單獨序列化該元素時規格要求補上 xmlns="…"
    // 以保持該片段獨立解析時仍有效——這與真實 mqxliff/sdlxliff（皆宣告根層 xmlns）行為一致
    // （已用 tests/fixtures/Test_Small.mqxliff 對照確認），故不對 replacePlaceholders 的還原字串
    // 做逐字比對，只驗證「寫回→再擷取」語意不失真（見下方斷言），避免測試綁死於序列化細節。
    const restored = replacePlaceholders(extracted.text, extracted.tags);
    setXmlTargetContent(xmlDoc, target, restored);
    const reExtracted = extractTaggedText(target);
    expect(reExtracted.text).toBe(extracted.text);
    expect(tagShape(reExtracted.tags)).toEqual(tagShape(extracted.tags));
  });

  it("sdlxliff：結構 <g> 透明（transparentG）、mrk 內真實 <g> 配對，寫回只填 mrk 不動外層結構", () => {
    const { extractTaggedText, replacePlaceholders, setXmlTargetContent } = loadXliffTagPipeline();
    const xmlDoc = parseXmlDoc(readFixture("minimal.sdlxliff"));
    const source = firstElementByLocalName(xmlDoc, "source");
    const target = firstElementByLocalName(xmlDoc, "target");

    // 3.1：source 直接子 <g> 為文件結構包裝，transparentG=true 應直接遞迴、不建立佔位符。
    const topLevel = extractTaggedText(source, { transparentG: true });
    expect(topLevel.tags).toEqual([]);
    expect(topLevel.text).toBe("Hello world");

    // 3.2：mrk 內部才是真正的行內 tag，須以 transparentG=false 對 mrk 節點單獨擷取。
    const sourceMrks = source.getElementsByTagName("mrk");
    expect(sourceMrks.length).toBe(1);
    const sourceMrk = sourceMrks[0];
    const mrkExtracted = extractTaggedText(sourceMrk, { transparentG: false });
    expect(mrkExtracted.text).toBe("Hello {1}world{/1}");
    expect(tagShape(mrkExtracted.tags)).toEqual([
      { ph: "{1}", type: "open", pairNum: 1, num: 1, display: "<g>" },
      { ph: "{/1}", type: "close", pairNum: 1, num: 1, display: "</g>" },
    ]);

    // 3.3：匯出只清空並填回 mrk 內容，外層結構 <g> 原樣保留（不逐字比對還原字串，理由見上一測試註記）。
    const restored = replacePlaceholders(mrkExtracted.text, mrkExtracted.tags);

    const targetMrk = target.getElementsByTagName("mrk")[0];
    setXmlTargetContent(xmlDoc, targetMrk, restored);

    const targetOuterG = target.getElementsByTagName("g")[0];
    expect(targetOuterG.getAttribute("id")).toBe("tu1-wrap");
    expect(targetOuterG.getElementsByTagName("mrk").length).toBe(1);

    const reExtracted = extractTaggedText(targetMrk, { transparentG: false });
    expect(reExtracted.text).toBe(mrkExtracted.text);
    expect(tagShape(reExtracted.tags)).toEqual(tagShape(mrkExtracted.tags));
  });

  it("mqxliff：bpt/ept 以 id 配對、ph displaytext=\"{0}\" 0-based 顯示格式須保留（§4.1）", () => {
    const { extractTaggedText, replacePlaceholders, setXmlTargetContent } = loadXliffTagPipeline();
    const xmlDoc = parseXmlDoc(readFixture("minimal.mqxliff"));
    const source = firstElementByLocalName(xmlDoc, "source");
    const target = firstElementByLocalName(xmlDoc, "target");

    const extracted = extractTaggedText(source);
    expect(extracted.text).toBe("Hello {1}world{/1} and {2}.");
    expect(tagShape(extracted.tags)).toEqual([
      { ph: "{1}", type: "open", pairNum: 1, num: 1, display: "**" },
      { ph: "{/1}", type: "close", pairNum: 1, num: 1, display: "**" },
      { ph: "{2}", type: "standalone", pairNum: 2, num: 2, display: "{0}" },
    ]);

    const restored = replacePlaceholders(extracted.text, extracted.tags);
    setXmlTargetContent(xmlDoc, target, restored);
    const reExtracted = extractTaggedText(target);
    expect(reExtracted.text).toBe(extracted.text);
    expect(tagShape(reExtracted.tags)).toEqual(tagShape(extracted.tags));
  });
});
