import { describe, expect, it } from "vitest";
import {
  LONG_TOKEN_MIN,
  buildColExtraCellHtml,
  buildExtraInfoInnerHtml,
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

describe("extra-info-display：cell HTML", () => {
  it("預設有 col-extra-clamp class", () => {
    const html = buildColExtraCellHtml("hello");
    expect(html).toContain('class="col-extra col-extra-clamp"');
    expect(html).not.toContain("is-expanded");
  });

  it("展開態改用 is-expanded，且長 token 顯示全文", () => {
    const long = "ABCDEFGH1234567890ijklmnopQRST";
    const html = buildColExtraCellHtml(long, { expanded: true });
    expect(html).toContain("is-expanded");
    expect(html).not.toContain("col-extra-clamp");
    expect(html).toContain(long);
    expect(html).not.toContain("col-extra-long-token");
  });

  it("收合態長 token 包成可複製 span，點擊後展開應可見全文（inner）", () => {
    const long = "ABCDEFGH1234567890ijklmnopQRST";
    const clamped = buildExtraInfoInnerHtml(long, { expanded: false });
    expect(clamped).toContain("col-extra-long-token");
    expect(clamped).toContain('data-full="ABCDEFGH1234567890ijklmnopQRST"');
    expect(clamped).toContain("ABCDEFGH…opQRST");

    const expanded = buildExtraInfoInnerHtml(long, { expanded: true });
    expect(expanded).toBe(long);
    expect(expanded).toContain(long);
  });

  it("換行保留為 br；HTML 特殊字元跳脫", () => {
    const html = buildExtraInfoInnerHtml("a<b>\nc", { expanded: true });
    expect(html).toBe("a&lt;b&gt;<br>c");
  });
});
