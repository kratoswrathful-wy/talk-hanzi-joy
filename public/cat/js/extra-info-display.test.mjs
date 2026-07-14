import { describe, expect, it } from "vitest";
import {
  LONG_TOKEN_MIN,
  buildColExtraCellHtml,
  buildExtraInfoInnerHtml,
  getCopyTextFromEventTarget,
  needsExpandToggle,
  needsExpandToggleForChips,
  shortenLongToken,
} from "./extra-info-display.js";

describe("extra-info-display：長 token 縮短", () => {
  it("短於門檻不縮短", () => {
    expect(shortenLongToken("short")).toBe("short");
    expect(shortenLongToken("a".repeat(LONG_TOKEN_MIN - 1))).toBe(
      "a".repeat(LONG_TOKEN_MIN - 1),
    );
  });

  it("≥24 且無空白 → 頭8…尾6", () => {
    const tok = "ABCDEFGH1234567890ijklmnop";
    expect(tok.length).toBeGreaterThanOrEqual(24);
    expect(shortenLongToken(tok)).toBe("ABCDEFGH…klmnop");
  });
});

describe("extra-info-display：needsExpandToggle", () => {
  it("短內容、≤3 行、無長 token → false（不顯示按鈕）", () => {
    expect(needsExpandToggle("")).toBe(false);
    expect(needsExpandToggle("a\nb\nc")).toBe(false);
    expect(needsExpandToggle("short")).toBe(false);
  });

  it(">3 行或有長 token → true", () => {
    expect(needsExpandToggle("a\nb\nc\nd")).toBe(true);
    const long = "A".repeat(LONG_TOKEN_MIN);
    expect(needsExpandToggle(long)).toBe(true);
  });

  it("chips：≤3 且 value 皆短 → false；否則 true", () => {
    expect(needsExpandToggleForChips([])).toBe(false);
    expect(
      needsExpandToggleForChips([{ value: "a" }, { value: "b" }, { value: "c" }]),
    ).toBe(false);
    expect(
      needsExpandToggleForChips([
        { value: "a" },
        { value: "b" },
        { value: "c" },
        { value: "d" },
      ]),
    ).toBe(true);
    expect(
      needsExpandToggleForChips([{ value: "X".repeat(LONG_TOKEN_MIN) }]),
    ).toBe(true);
  });
});

describe("extra-info-display：cell HTML", () => {
  it("預設有 col-extra-clamp、展開鈕 hidden、短內容 data-needs-expand=0", () => {
    const html = buildColExtraCellHtml("hello");
    expect(html).toContain('class="col-extra col-extra-clamp"');
    expect(html).toContain('data-needs-expand="0"');
    expect(html).toContain("col-extra-expand-btn");
    expect(html).toContain("hidden");
    expect(html).not.toContain("is-expanded");
  });

  it("需截斷時 data-needs-expand=1 且含展開鈕", () => {
    const html = buildColExtraCellHtml("a\nb\nc\nd");
    expect(html).toContain('data-needs-expand="1"');
    expect(html).toContain("col-extra-expand-btn");
    expect(html).toContain("col-extra-expand-icon--right");
  });

  it("展開態改用 is-expanded，且長 token 顯示全文", () => {
    const long = "ABCDEFGH1234567890ijklmnopQRST";
    const html = buildColExtraCellHtml(long, { expanded: true });
    expect(html).toContain("is-expanded");
    expect(html).not.toContain("col-extra-clamp");
    expect(html).toContain(long);
    expect(html).not.toContain("col-extra-long-token");
    expect(html).toContain("col-extra-expand-icon--down");
  });

  it("收合態長 token 包成 span，段落 data-full 為完整原文", () => {
    const long = "ABCDEFGH1234567890ijklmnopQRST";
    const clamped = buildExtraInfoInnerHtml(long, { expanded: false });
    expect(clamped).toContain("col-extra-long-token");
    expect(clamped).toContain('data-full="ABCDEFGH1234567890ijklmnopQRST"');
    expect(clamped).toContain("ABCDEFGH…opQRST");
    expect(clamped).toContain("col-extra-para");

    const expanded = buildExtraInfoInnerHtml(long, { expanded: true });
    expect(expanded).toContain("col-extra-para");
    expect(expanded).toContain(long);
    expect(expanded).not.toContain("col-extra-long-token");
  });

  it("多行各成段落；HTML 特殊字元跳脫", () => {
    const html = buildExtraInfoInnerHtml("a<b>\nc", { expanded: true });
    expect(html).toContain('data-full="a&lt;b&gt;"');
    expect(html).toContain("a&lt;b&gt;");
    expect(html).toContain('data-full="c"');
  });
});

describe("extra-info-display：雙擊複製取完整原文", () => {
  it("自段落／長 token／chip 取 data-full", () => {
    const wrap = document.createElement("div");
    wrap.innerHTML =
      `<span class="col-extra-para" data-full="完整段落原文">` +
      `<span class="col-extra-long-token" data-full="TOKEN_FULL">短…ken</span>` +
      `</span>` +
      `<span class="meta-extra-chip" data-full="CHIP_FULL"><span class="meta-extra-chip-value">短</span></span>`;

    const token = wrap.querySelector(".col-extra-long-token");
    const para = wrap.querySelector(".col-extra-para");
    const chipVal = wrap.querySelector(".meta-extra-chip-value");

    // 點長 token 仍屬於段落時優先 chip? 無 chip → 段落
    expect(getCopyTextFromEventTarget(token)).toBe("完整段落原文");
    expect(getCopyTextFromEventTarget(para)).toBe("完整段落原文");
    expect(getCopyTextFromEventTarget(chipVal)).toBe("CHIP_FULL");
  });
});
