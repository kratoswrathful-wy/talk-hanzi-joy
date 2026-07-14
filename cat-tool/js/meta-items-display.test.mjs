import { describe, expect, it } from "vitest";
import {
  collectFromTransUnit,
  collectFromXliff2Unit,
  itemKey,
  normalizeMetaItems,
  summarizeMetaItemKinds,
} from "./meta-items-collector.mjs";
import { applyMetaDisplay, normalizeMetaDisplayConfig, buildMetaExtraChipsCellHtml } from "./meta-display-apply.mjs";

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, "text/xml");
}

describe("meta-items-collector", () => {
  it("itemKey 格式為 sourceType::name", () => {
    expect(itemKey({ sourceType: "context", name: "x-mmq-context", value: "k" })).toBe(
      "context::x-mmq-context",
    );
  });

  it("normalize 丟棄空值", () => {
    expect(
      normalizeMetaItems([
        { sourceType: "attr", name: "id", value: "1" },
        { sourceType: "", name: "x", value: "y" },
        { sourceType: "a", name: "b", value: "  " },
      ]),
    ).toEqual([{ sourceType: "attr", name: "id", value: "1" }]);
  });

  it("collectFromTransUnit：context／note／resname", () => {
    const doc = parseXml(`<?xml version="1.0"?>
      <trans-unit id="42" resname="MyKey">
        <context-group>
          <context context-type="x-mmq-context">REAL_KEY</context>
          <context context-type="x-path">/some/path</context>
        </context-group>
        <note from="developer">hello note</note>
      </trans-unit>`);
    const tu = doc.getElementsByTagName("trans-unit")[0];
    const items = collectFromTransUnit(tu, { isMqxliff: false });
    const keys = items.map(itemKey);
    expect(keys).toContain("attr::id");
    expect(keys).toContain("attr::resname");
    expect(keys).toContain("context::x-mmq-context");
    expect(keys).toContain("context::x-path");
    expect(keys).toContain("note::developer");
    expect(items.find((i) => itemKey(i) === "context::x-mmq-context").value).toBe("REAL_KEY");
  });

  it("collectFromXliff2Unit：id／note", () => {
    const doc = parseXml(`<?xml version="1.0"?>
      <unit id="u1" name="UnitName">
        <notes><note category="instr">please</note></notes>
        <segment><source>hi</source></segment>
      </unit>`);
    const unit = doc.getElementsByTagName("unit")[0];
    const items = collectFromXliff2Unit(unit);
    expect(items.map(itemKey)).toEqual(
      expect.arrayContaining(["attr::id", "attr::name", "note::instr"]),
    );
  });

  it("summarizeMetaItemKinds 取前 N 句", () => {
    const segs = [
      { metaItems: [{ sourceType: "context", name: "x-path", value: "a" }] },
      { metaItems: [{ sourceType: "context", name: "x-path", value: "b" }] },
    ];
    const kinds = summarizeMetaItemKinds(segs, 20);
    expect(kinds).toHaveLength(1);
    expect(kinds[0].key).toBe("context::x-path");
    expect(kinds[0].sampleValues).toEqual(["a", "b"]);
    expect(kinds[0].count).toBe(2);
  });
});

describe("meta-display-apply：未設 config ≡ 舊行為", () => {
  const seg = {
    idValue: "legacy-key",
    keys: ["legacy-key"],
    extraValue: "legacy-extra\nline2",
    metaItems: [
      { sourceType: "context", name: "x-mmq-context", value: "REAL" },
      { sourceType: "context", name: "x-path", value: "/p" },
    ],
  };

  it("config=null → 用 idValue／extraValue", () => {
    const r = applyMetaDisplay(seg, null);
    expect(r.usesConfig).toBe(false);
    expect(r.displayKeys).toEqual(["legacy-key"]);
    expect(r.displayExtraText).toBe("legacy-extra\nline2");
    expect(r.displayExtraChips).toBeNull();
  });

  it("空 config 物件也視為未設定", () => {
    expect(normalizeMetaDisplayConfig({})).toBeNull();
    const r = applyMetaDisplay(seg, {});
    expect(r.usesConfig).toBe(false);
  });

  it("有 config → Key／額外來自 meta_items", () => {
    const r = applyMetaDisplay(seg, {
      keyItem: "context::x-mmq-context",
      extraItems: ["context::x-path"],
      hiddenItems: [],
    });
    expect(r.usesConfig).toBe(true);
    expect(r.displayKeys).toEqual(["REAL"]);
    expect(r.displayExtraChips).toEqual([
      { key: "context::x-path", name: "x-path", value: "/p" },
    ]);
    expect(r.displayExtraText).toBe("/p");
  });

  it("有 config 但 metaItems 為空 → 混合舊句段仍走 fallback", () => {
    const oldSeg = {
      idValue: "legacy-key",
      keys: ["legacy-key"],
      extraValue: "legacy-extra",
      metaItems: [],
    };
    const r = applyMetaDisplay(oldSeg, {
      keyItem: "context::x-mmq-context",
      extraItems: ["context::x-path"],
      hiddenItems: [],
    });
    expect(r.usesConfig).toBe(false);
    expect(r.displayKeys).toEqual(["legacy-key"]);
    expect(r.displayExtraText).toBe("legacy-extra");
    expect(r.displayExtraChips).toBeNull();
  });

  it("有 config 且有 metaItems → 產出 chips HTML", () => {
    const r = applyMetaDisplay(seg, {
      keyItem: "context::x-mmq-context",
      extraItems: ["context::x-path"],
    });
    expect(r.usesConfig).toBe(true);
    const html = buildMetaExtraChipsCellHtml(r.displayExtraChips, { expanded: false });
    expect(html).toContain("meta-extra-chip");
    expect(html).toContain("x-path");
    expect(html).toContain("/p");
  });
});
