import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyToolEntryFieldPatch,
  persistToolBlockPatch,
  resetToolCredentialPersistQueuesForTests,
} from "./case-tool-credentials-persist";
import type { CaseCredentials } from "@/lib/case-action-rpc";

function cred(tools: CaseCredentials["tools"]): CaseCredentials {
  return {
    caseId: "c1",
    revision: 1,
    loginAccount: "",
    loginPassword: "",
    otherLoginInfo: "",
    toolFieldValues: {},
    tools,
    questionTools: [{ id: "qt-default", tool: "Google Sheet", fieldValues: { q: "1" } }],
  };
}

afterEach(() => {
  resetToolCredentialPersistQueuesForTests();
});

describe("persistToolBlockPatch", () => {
  it("refuses when credentials are not ready (masked window)", async () => {
    const deps = {
      peek: () => undefined,
      put: vi.fn(),
      load: vi.fn(),
      updateCredentials: vi.fn(),
    };
    const result = await persistToolBlockPatch({
      caseId: "c1",
      block: "tools",
      updater: (c) => c,
      draftCredentials: null,
      credentialsReady: false,
      usedPublicFallback: true,
      deps,
    });
    expect(result.error?.message).toMatch(/尚未載入|公開遮罩/);
    expect(deps.updateCredentials).not.toHaveBeenCalled();
  });

  it("edits one field without wiping sibling tools or fields", async () => {
    const base = cred([
      { id: "te-default", tool: "memoQ", fieldValues: { a: "1", b: "2" } },
      { id: "te-2", tool: "GlobalProtect", fieldValues: { c: "3" } },
    ]);
    let cache: CaseCredentials | undefined = base;
    const updateCredentials = vi.fn(async (_id: string, patch: Partial<CaseCredentials>) => {
      cache = { ...cache!, ...patch, revision: (cache!.revision ?? 1) + 1 };
      return null;
    });
    const result = await persistToolBlockPatch({
      caseId: "c1",
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "edited" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: {
        peek: () => cache,
        put: (_id, c) => {
          cache = c;
        },
        load: vi.fn(),
        updateCredentials,
      },
    });
    expect(result.error).toBeNull();
    expect(result.nextCredentials?.tools?.[0].fieldValues).toEqual({ a: "edited", b: "2" });
    expect(result.nextCredentials?.tools?.[1].fieldValues).toEqual({ c: "3" });
    expect(result.nextCredentials?.questionTools?.[0].fieldValues).toEqual({ q: "1" });
  });

  it("keeps draft when updateCredentials fails", async () => {
    const base = cred([
      { id: "te-default", tool: "memoQ", fieldValues: { a: "1" } },
    ]);
    let cache: CaseCredentials | undefined = base;
    const result = await persistToolBlockPatch({
      caseId: "c1",
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "draft" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: {
        peek: () => cache,
        put: (_id, c) => {
          cache = c;
        },
        load: vi.fn(),
        updateCredentials: vi.fn(async () => new Error("case_revision_conflict")),
      },
    });
    expect(result.error?.message).toBe("case_revision_conflict");
    expect(cache?.tools?.[0].fieldValues).toEqual({ a: "draft" });
  });

  it("serializes consecutive edits so the second sees the first base", async () => {
    const base = cred([
      { id: "te-default", tool: "memoQ", fieldValues: { a: "0", b: "0" } },
    ]);
    let cache: CaseCredentials | undefined = base;
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let enteredFirst = false;
    const updateCredentials = vi.fn(async (_id: string, patch: Partial<CaseCredentials>) => {
      if (!enteredFirst) {
        enteredFirst = true;
        await firstBlocked;
      }
      cache = { ...cache!, tools: patch.tools as typeof base.tools, revision: cache!.revision + 1 };
      return null;
    });
    const deps = {
      peek: () => cache,
      put: (_id: string, c: CaseCredentials) => {
        cache = c;
      },
      load: async () => cache!,
      updateCredentials,
    };
    const p1 = persistToolBlockPatch({
      caseId: "c1",
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "1" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    // 等第一筆進入 updateCredentials 後再排第二筆
    await vi.waitFor(() => expect(enteredFirst).toBe(true));
    const p2 = persistToolBlockPatch({
      caseId: "c1",
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { b: "2" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    releaseFirst();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect(r2.nextCredentials?.tools?.[0].fieldValues).toEqual({ a: "1", b: "2" });
  });

  it("allows intentional clear of a single field", async () => {
    const base = cred([
      { id: "te-default", tool: "memoQ", fieldValues: { a: "1", b: "2" } },
    ]);
    let cache: CaseCredentials | undefined = base;
    const result = await persistToolBlockPatch({
      caseId: "c1",
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: {
        peek: () => cache,
        put: (_id, c) => {
          cache = c;
        },
        load: async () => cache!,
        updateCredentials: async (_id, patch) => {
          cache = { ...cache!, ...patch };
          return null;
        },
      },
    });
    expect(result.error).toBeNull();
    expect(result.nextCredentials?.tools?.[0].fieldValues).toEqual({ a: "", b: "2" });
  });
});
