import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

describe("file-update mergeSegments 同步 metaItems（混合舊句段刷新）", () => {
  let mergeSegments;

  beforeAll(() => {
    const code = fs.readFileSync(path.join(root, "cat-tool/js/file-update.js"), "utf8");
    const sandbox = { console, globalThis: {} };
    sandbox.window = sandbox;
    sandbox.global = sandbox;
    vm.runInNewContext(code + "\nthis.CatToolFileUpdate = global.CatToolFileUpdate || globalThis.CatToolFileUpdate;", sandbox);
    // IIFE attaches to globalThis/window
    const api =
      sandbox.CatToolFileUpdate ||
      sandbox.global?.CatToolFileUpdate ||
      sandbox.globalThis?.CatToolFileUpdate;
    // Re-run properly
    const sandbox2 = vm.createContext({ console });
    sandbox2.global = sandbox2;
    sandbox2.window = sandbox2;
    sandbox2.globalThis = sandbox2;
    vm.runInContext(code, sandbox2);
    mergeSegments = sandbox2.CatToolFileUpdate.mergeSegments;
  });

  it("內容不變但舊句段缺 metaItems → update patch 帶入 metaItems", () => {
    const existing = [
      {
        id: "1",
        idValue: "KEY1",
        extraValue: "ex",
        sourceText: "Hello",
        targetText: "你好",
        xliffTuId: "tu1",
        globalId: 1,
        metaItems: [],
        status: "confirmed",
      },
    ];
    const incoming = [
      {
        idValue: "KEY1",
        extraValue: "ex",
        sourceText: "Hello",
        targetText: "你好",
        xliffTuId: "tu1",
        globalId: 1,
        metaItems: [
          { sourceType: "attr", name: "id", value: "tu1" },
          { sourceType: "context", name: "x-mmq-context", value: "KEY1" },
        ],
      },
    ];
    const result = mergeSegments(existing, incoming, "xliff", "2026-07-14T00:00:00.000Z");
    expect(result.update.length).toBe(1);
    expect(result.update[0].patch.metaItems).toEqual(incoming[0].metaItems);
    expect(result.update[0].patch.xliffTuId).toBeUndefined();
    expect(result.update[0].patch.idValue).toBeUndefined();
  });

  it("內容與 meta 皆同 → keep", () => {
    const items = [{ sourceType: "attr", name: "id", value: "tu1" }];
    const existing = [
      {
        id: "1",
        idValue: "KEY1",
        extraValue: "ex",
        sourceText: "Hello",
        targetText: "你好",
        xliffTuId: "tu1",
        globalId: 1,
        metaItems: items,
        status: "confirmed",
      },
    ];
    const incoming = [
      {
        idValue: "KEY1",
        extraValue: "ex",
        sourceText: "Hello",
        targetText: "你好",
        xliffTuId: "tu1",
        globalId: 1,
        metaItems: items,
      },
    ];
    const result = mergeSegments(existing, incoming, "xliff", "2026-07-14T00:00:00.000Z");
    expect(result.keep.length).toBe(1);
    expect(result.update.length).toBe(0);
  });
});
