import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function loadIife(rel, sandbox) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  vm.runInContext(code, sandbox);
}

function stripTargetsForDiff(xmlText, DOMParser, XMLSerializer) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const targets = [
    ...Array.from(doc.getElementsByTagName("target")),
    ...Array.from(doc.getElementsByTagNameNS("*", "target")),
  ];
  targets.forEach((t) => {
    while (t.firstChild) t.removeChild(t.firstChild);
    // 匯出常寫 state／確認屬性；與 meta 顯示無關，一併剝除以比對「譯文外結構」
    Array.from(t.attributes || []).forEach((a) => t.removeAttribute(a.name));
  });
  return new XMLSerializer().serializeToString(doc);
}

async function readBlobText(blob, sandbox) {
  if (blob && typeof blob.arrayBuffer === "function") {
    return new TextDecoder("utf-8").decode(await blob.arrayBuffer());
  }
  if (blob && typeof blob.text === "function") {
    return await blob.text();
  }
  return await new Promise((resolve, reject) => {
    const fr = new sandbox.window.FileReader();
    fr.onload = () => resolve(new TextDecoder("utf-8").decode(fr.result));
    fr.onerror = () => reject(fr.error || new Error("FileReader failed"));
    fr.readAsArrayBuffer(blob);
  });
}

describe("meta_display_config 不影響三格式匯出 XML（除譯文）", () => {
  let sandbox;
  let exportBlob;
  let DOMParserRef;
  let XMLSerializerRef;

  beforeAll(async () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://example.test/",
    });
    const w = dom.window;
    DOMParserRef = w.DOMParser;
    XMLSerializerRef = w.XMLSerializer;

    sandbox = vm.createContext({
      console,
      TextEncoder,
      TextDecoder,
      setTimeout,
      clearTimeout,
    });
    sandbox.window = w;
    sandbox.document = w.document;
    sandbox.DOMParser = w.DOMParser;
    sandbox.XMLSerializer = w.XMLSerializer;
    sandbox.Node = w.Node;
    sandbox.Element = w.Element;
    sandbox.NodeFilter = w.NodeFilter;
    sandbox.Blob = typeof Blob !== "undefined" ? Blob : w.Blob;
    sandbox.FileReader = w.FileReader;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    sandbox.global = sandbox;

    const collector = await import("./meta-items-collector.mjs");
    sandbox.MetaItemsCollector = collector.MetaItemsCollector || collector.default;

    loadIife("cat-tool/js/xliff-tag-pipeline.js", sandbox);
    loadIife("cat-tool/js/xliff-build-segments.js", sandbox);

    const Xliff = sandbox.CatToolXliffTags || sandbox.window.CatToolXliffTags;
    const BS = sandbox.CatToolXliffBuildSegments || sandbox.window.CatToolXliffBuildSegments;
    expect(Xliff && typeof Xliff.exportXliffFamilyToBlob).toBe("function");
    expect(BS && typeof BS.buildSegmentsFromXliffXml).toBe("function");
    sandbox.CatToolXliffTags = Xliff;
    sandbox.CatToolXliffBuildSegments = BS;
    exportBlob = Xliff.exportXliffFamilyToBlob.bind(Xliff);
  });

  async function exportPair(fixtureRel, formatHint) {
    const abs = path.join(root, fixtureRel);
    const xmlText = fs.readFileSync(abs, "utf8");
    const fileName = path.basename(abs);
    const BS = sandbox.CatToolXliffBuildSegments;
    const xml = new DOMParserRef().parseFromString(xmlText, "text/xml");
    const built = BS.buildSegmentsFromXliffXml(xml, fileName);
    const segs = (built.segments || []).map((s, i) => ({
      ...s,
      id: `s${i}`,
      globalId: i + 1,
      metaItems: s.metaItems || [],
      targetText: `TGT_${i}`,
    }));
    const buf = new TextEncoder().encode(xmlText).buffer;
    const baseFile = {
      id: "f1",
      name: fileName,
      originalFileBuffer: buf,
    };
    const withCfg = {
      ...baseFile,
      metaDisplayConfig: {
        keyItem: "attr::id",
        extraItems: ["context::x-path", "note::developer"],
        hiddenItems: [],
      },
    };
    const withoutCfg = { ...baseFile, metaDisplayConfig: null };

    const outWith = await readBlobText((await exportBlob(withCfg, segs, formatHint)).blob, sandbox);
    const outWithout = await readBlobText((await exportBlob(withoutCfg, segs, formatHint)).blob, sandbox);

    // 匯出管線可能寫 mq:status；與顯示對應無關，比對前剝除
    const scrub = (t) =>
      stripTargetsForDiff(t, DOMParserRef, XMLSerializerRef)
        .replace(/\s+mq:status="[^"]*"/g, "")
        .replace(/\s+status="[^"]*"/g, "");

    return { withCfg: scrub(outWith), withoutCfg: scrub(outWithout), fileName };
  }

  it("mqxliff：有／無 meta_display_config 匯出（除譯文）相同", async () => {
    const { withCfg, withoutCfg } = await exportPair("tests/fixtures/xliff/minimal.mqxliff", "mqxliff");
    expect(withCfg).toBe(withoutCfg);
  });

  it("sdlxliff：有／無 meta_display_config 匯出（除譯文）相同", async () => {
    const { withCfg, withoutCfg } = await exportPair("tests/fixtures/xliff/minimal.sdlxliff", "sdlxliff");
    expect(withCfg).toBe(withoutCfg);
  });

  it("generic xliff：有／無 meta_display_config 匯出（除譯文）相同", async () => {
    const { withCfg, withoutCfg } = await exportPair("tests/fixtures/xliff/minimal-generic.xliff", "xliff");
    expect(withCfg).toBe(withoutCfg);
  });
});
