import { describe, expect, it } from "vitest";
import {
  applyToolTemplatePatch,
  buildNextToolsFromWritableBase,
  isExplicitEmptyToolFields,
  looksLikeMaskedPublicTools,
  mergeToolEntryUpdates,
  rejectMaskedFallbackWrite,
  resolveDisplayedToolFields,
  shouldPersistResolvedToolFields,
  toolChangePersistPatch,
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

  it("只有尚未寫入欄位定義時才回寫已載入的範本欄；空清單不復活", () => {
    expect(shouldPersistResolvedToolFields(undefined, 2)).toBe(true);
    expect(shouldPersistResolvedToolFields(null, 2)).toBe(true);
    expect(shouldPersistResolvedToolFields([], 2)).toBe(false);
    expect(shouldPersistResolvedToolFields([{ id: "a", label: "帳號", type: "text" }], 2)).toBe(false);
    expect(shouldPersistResolvedToolFields(undefined, 0)).toBe(false);
    expect(shouldPersistResolvedToolFields([], 0)).toBe(false);
  });

  it("缺欄才顯示執行工具預設帳號列；空清單維持已刪、不補回", () => {
    const optionFields = [{ id: "u", label: "帳號", type: "text" as const }];
    expect(isExplicitEmptyToolFields([])).toBe(true);
    expect(isExplicitEmptyToolFields(undefined)).toBe(false);
    expect(isExplicitEmptyToolFields(null)).toBe(false);
    expect(resolveDisplayedToolFields(undefined, optionFields)).toEqual(optionFields);
    expect(resolveDisplayedToolFields(null, optionFields)).toEqual(optionFields);
    expect(resolveDisplayedToolFields([], optionFields)).toEqual([]);
    expect(resolveDisplayedToolFields([{ id: "c", label: "自訂", type: "text" }], optionFields)).toEqual([
      { id: "c", label: "自訂", type: "text" },
    ]);
    expect(resolveDisplayedToolFields([], [])).toEqual([]);
  });

  it("選工具時範本欄未載入不得寫入空 fields", () => {
    expect(toolChangePersistPatch({ newTool: "memoQ", defaultFields: [], defaultValues: {} })).toEqual({
      tool: "memoQ",
    });
    expect(
      toolChangePersistPatch({
        newTool: "memoQ",
        defaultFields: [{ id: "u", label: "帳號", type: "text" }],
        defaultValues: { u: "" },
      }),
    ).toEqual({
      tool: "memoQ",
      fields: [{ id: "u", label: "帳號", type: "text" }],
      fieldValues: { u: "" },
      fileValues: {},
    });
  });

  it("rejects write when credentials are not ready", () => {
    expect(
      buildNextToolsFromWritableBase({
        writableTools: null,
        updater: (c) => c,
      }),
    ).toEqual({ ok: false, reason: "credentials_not_ready" });
  });

  it("applyToolTemplatePatch uses latest entry, not a stale snapshot", () => {
    const patch = applyToolTemplatePatch(
      { id: "te-default", tool: "memoQ", fieldValues: { a: "draft-a", b: "keep-b", c: "old-c" } },
      {
        tool: "memoQ",
        fields: [
          { id: "a", label: "A", type: "text" },
          { id: "b", label: "B", type: "text" },
          { id: "d", label: "D", type: "text" },
        ],
        fieldValues: { a: "from-template", b: "", d: "" },
      },
    );
    expect(patch.fieldValues).toEqual({
      a: "from-template",
      b: "keep-b",
      d: "",
    });
    expect(patch.fieldValues).not.toHaveProperty("c");
  });

  it("rejectMaskedFallbackWrite blocks public fallback and unreadiness", () => {
    expect(rejectMaskedFallbackWrite({ credentialsReady: false, usedPublicFallback: false }))
      .toMatch(/尚未載入/);
    expect(rejectMaskedFallbackWrite({ credentialsReady: true, usedPublicFallback: true }))
      .toMatch(/公開遮罩/);
    expect(rejectMaskedFallbackWrite({ credentialsReady: true, usedPublicFallback: false }))
      .toBeNull();
    expect(rejectMaskedFallbackWrite({
      credentialsReady: true,
      usedPublicFallback: false,
      canWrite: false,
    })).toMatch(/不能修改/);
  });
});
