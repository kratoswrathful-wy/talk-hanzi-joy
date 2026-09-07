import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isTrustedCatIframeMessage } from "./cat-iframe-message-guard";

describe("isTrustedCatIframeMessage", () => {
  const origin = "https://app.example.test";
  let iframeWin: Window;

  beforeEach(() => {
    vi.stubGlobal("location", { origin });
    iframeWin = {} as Window;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when iframeWindow is missing", () => {
    const event = {
      origin,
      source: iframeWin,
    } as MessageEvent;
    expect(isTrustedCatIframeMessage(event, null)).toBe(false);
    expect(isTrustedCatIframeMessage(event, undefined)).toBe(false);
  });

  it("rejects mismatched origin", () => {
    const event = {
      origin: "https://evil.example",
      source: iframeWin,
    } as MessageEvent;
    expect(isTrustedCatIframeMessage(event, iframeWin)).toBe(false);
  });

  it("rejects when source is not the iframe window", () => {
    const other = {} as Window;
    const event = {
      origin,
      source: other,
    } as MessageEvent;
    expect(isTrustedCatIframeMessage(event, iframeWin)).toBe(false);
  });

  it("accepts matching origin and source", () => {
    const event = {
      origin,
      source: iframeWin,
    } as MessageEvent;
    expect(isTrustedCatIframeMessage(event, iframeWin)).toBe(true);
  });
});
