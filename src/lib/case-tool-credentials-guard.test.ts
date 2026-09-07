import { describe, expect, it } from "vitest";
import {
  buildNextToolsFromWritableBase,
  looksLikeMaskedPublicTools,
  mergeToolEntryUpdates,
  rejectMaskedFallbackWrite,
} from "./case-tool-credentials-guard";
import type { ToolEntry } from "@/data/case-types";

const full: ToolEntry[] = [
  {
    id: "te-default",
    tool: "memoQ",
    fieldValues: { a: "keep", b: "also" },
  },
  {
    id: "te-2",
    tool: "GlobalProtect",
    fieldValues: { c: "vpn" },
  },
];

const masked: ToolEntry[] = [
  { id: "te-default", tool: "memoQ", fieldValues: {} },
  { id: "te-2", tool: "GlobalProtect", fieldValues: {} },
];

describe("case-tool-credentials-guard", () => {
  it("detects public masked tool structures", () => {
    expect(looksLikeMaskedPublicTools(masked)).toBe(true);
    expect(looksLikeMaskedPublicTools(full)).toBe(false);
  });

  it("merges one field without dropping sibling fields", () => {
    const next = mergeToolEntryUpdates(full[0], { fieldValues: { a: "new" } });
    expect(next.fieldValues).toEqual({ a: "new", b: "also" });
  });

  it("allows intentional clear of a single field via merge", () => {
    const next = mergeToolEntryUpdates(full[0], { fieldValues: { a: "" } });
    expect(next.fieldValues).toEqual({ a: "", b: "also" });
  });

  it("builds next tools only from writable base", () => {
    const built = buildNextToolsFromWritableBase({
      writableTools: full,
      updater: (current) =>
        current.map((t, i) =>
          i === 0 ? mergeToolEntryUpdates(t, { fieldValues: { a: "edited" } }) : t,
        ),
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.next[0].fieldValues).toEqual({ a: "edited", b: "also" });
      expect(built.next[1].fieldValues).toEqual({ c: "vpn" });
    }
  });

  it("rejects write when credentials are not ready", () => {
    expect(
      buildNextToolsFromWritableBase({
        writableTools: null,
        updater: (c) => c,
      }),
    ).toEqual({ ok: false, reason: "credentials_not_ready" });
  });

  it("rejectMaskedFallbackWrite blocks public fallback and unreadiness", () => {
    expect(rejectMaskedFallbackWrite({ credentialsReady: false, usedPublicFallback: false }))
      .toMatch(/尚未載入/);
    expect(rejectMaskedFallbackWrite({ credentialsReady: true, usedPublicFallback: true }))
      .toMatch(/公開遮罩/);
    expect(rejectMaskedFallbackWrite({ credentialsReady: true, usedPublicFallback: false }))
      .toBeNull();
  });
});
