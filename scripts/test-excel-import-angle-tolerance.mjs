/**
 * Quick regression for Excel import angle-bracket tolerance.
 *
 * Validates that game-style placeholders like:
 *   <color=...><SpriteName=...>TEXT</color>
 * are transformed into:
 *   {n}{m}TEXT{/n}
 * where <SpriteName=...> becomes standalone.
 */
import fs from "fs";
import vm from "vm";
import { fileURLToPath } from "url";

function loadScript(relPath) {
  const url = new URL(relPath, import.meta.url);
  const p = fileURLToPath(url);
  return fs.readFileSync(p, "utf8");
}

const sandbox = { window: {}, console };
vm.createContext(sandbox);

// Load the module under test (attaches to window.CatToolExcelImportStringTags)
vm.runInContext(loadScript("../cat-tool/js/excel-import-string-tags.js"), sandbox, {
  filename: "excel-import-string-tags.js",
});

const api = sandbox.window.CatToolExcelImportStringTags;
if (!api || typeof api.applyPipeline !== "function") {
  throw new Error("Failed to load CatToolExcelImportStringTags.applyPipeline");
}

const cases = [
  {
    name: "color+SpriteName nested close",
    input:
      "<color=ColorChenLingCoin><SpriteName=ActivityChenLingCoin>遊樂幣+#1</color>",
  },
  {
    name: "multiple SpriteName inside color",
    input:
      "<color=ColorX><SpriteName=A>AAA<SpriteName=B>BBB</color>",
  },
  {
    name: "unmatched closing should fail",
    input: "TEXT</color>",
    expectNoChange: true,
  },
];

const opts = api.defaultOpts();
opts.angleBracket = true;
opts.squareBracket = false;
opts.curlyBracket = false;
opts.literalBackslashN = false;
opts.customPatterns = [];

let failed = 0;

for (const tc of cases) {
  const r = api.applyPipeline(tc.input, null, opts);
  const out = r.text;
  const tags = r.tags || [];
  if (tc.expectNoChange) {
    if (out !== tc.input || tags.length !== 0) {
      console.error("[FAIL]", tc.name, { out, tagsLen: tags.length });
      failed++;
    } else {
      console.log("[OK]", tc.name);
    }
    continue;
  }
  const hasStandaloneSprite = tags.some(
    (t) =>
      t &&
      t.type === "standalone" &&
      typeof t.xml === "string" &&
      t.xml.includes("<SpriteName=")
  );
  const hasColorOpen = tags.some(
    (t) => t && t.type === "open" && typeof t.xml === "string" && t.xml.startsWith("<color")
  );
  const hasColorClose = tags.some(
    (t) =>
      t && t.type === "close" && typeof t.xml === "string" && t.xml.startsWith("</color")
  );
  if (!hasStandaloneSprite || !hasColorOpen || !hasColorClose) {
    console.error("[FAIL]", tc.name, {
      out,
      tags,
      hasStandaloneSprite,
      hasColorOpen,
      hasColorClose,
    });
    failed++;
  } else {
    console.log("[OK]", tc.name, out);
  }
}

if (failed) process.exit(1);
console.log("[DONE] all cases passed");

