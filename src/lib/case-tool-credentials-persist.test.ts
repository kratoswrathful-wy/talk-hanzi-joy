import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCaseCredentialAccess,
  CredentialLoadStaleError,
} from "./case-credential-access";
import {
  applyToolEntryFieldPatch,
  applyToolEntryFieldPatchById,
  isPersistResultCurrent,
  persistToolBlockPatch,
  resetToolCredentialPersistQueuesForTests,
} from "./case-tool-credentials-persist";
import type { CaseCredentials } from "@/lib/case-action-rpc";

function cred(caseId: string, tools: CaseCredentials["tools"], revision = 1): CaseCredentials {
  return {
    caseId,
    revision,
    loginAccount: "",
    loginPassword: "",
    otherLoginInfo: "",
    toolFieldValues: {},
    tools,
    questionTools: [{ id: "qt-default", tool: "Google Sheet", fieldValues: { q: "1" } }],
  };
}

function makeDeps(access: ReturnType<typeof createCaseCredentialAccess>, store: {
  updateCredentials: ToolCredentialsPersistDeps["updateCredentials"];
}) {
  return {
    getActiveUserId: () => access.getActiveUserId(),
    scope: (caseId: string) => access.scope(caseId),
    peekConfirmed: (caseId: string) => access.peekConfirmed(caseId),
    putConfirmed: (caseId: string, c: CaseCredentials, g?: number) => access.putConfirmed(caseId, c, g),
    putDraft: (caseId: string, c: CaseCredentials) => access.putDraft(caseId, c),
    peekDraft: (caseId: string) => access.peekDraft(caseId),
    load: (caseId: string) => access.load(caseId),
    updateCredentials: store.updateCredentials,
  };
}

type ToolCredentialsPersistDeps = Parameters<typeof persistToolBlockPatch>[0]["deps"];

afterEach(() => {
  resetToolCredentialPersistQueuesForTests();
});

describe("credential access session isolation", () => {
  it("ignores in-flight load after clearAll / account switch", async () => {
    let resolveLoad: ((value: unknown) => void) | undefined;
    const rpc = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("user-1");
    const pending = access.load("case-1");
    access.setActiveUser("user-2");
    resolveLoad?.({
      data: cred("case-1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "leak" } }]),
      error: null,
    });
    await expect(pending).rejects.toBeInstanceOf(CredentialLoadStaleError);
    expect(access.peekConfirmed("case-1")).toBeUndefined();
  });

  it("ignores older load when a newer load for the same case finishes first", async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    const rpc = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve);
    }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    const first = access.load("case-1");
    const second = access.load("case-1");
    // complete second first
    resolvers[1]!({
      data: cred("case-1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "new" } }], 2),
      error: null,
    });
    await second;
    expect(access.peekConfirmed("case-1")?.revision).toBe(2);
    // late first must not overwrite
    resolvers[0]!({
      data: cred("case-1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "old" } }], 1),
      error: null,
    });
    await expect(first).rejects.toBeInstanceOf(CredentialLoadStaleError);
    expect(access.peekConfirmed("case-1")?.tools?.[0].fieldValues).toEqual({ a: "new" });
  });
});

describe("persistToolBlockPatch cross-case and draft isolation", () => {
  it("refuses draftCredentials from another case even when credentialsReady was spoofed", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: cred("case-B", [{ id: "te-default", tool: "B", fieldValues: { b: "1" } }]),
      error: null,
    });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("case-B");
    // Codex repro: peek empty for wrong path — clear confirmed mid-way then use A draft
    const draftA = cred("case-A", [{ id: "te-default", tool: "A", fieldValues: { a: "secret" } }]);
    access.clear("case-B");
    const updateCredentials = vi.fn(async () => null);
    const result = await persistToolBlockPatch({
      caseId: "case-B",
      userId: "u1",
      generation: access.generation("case-B"),
      block: "tools",
      updater: (c) => c,
      draftCredentials: draftA,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: makeDeps(access, { updateCredentials }),
    });
    expect(result.status).toBe("rejected");
    expect(result.error?.message).toMatch(/跨案|不符/);
    expect(updateCredentials).not.toHaveBeenCalled();
  });

  it("refuses when only foreign draft is present and confirmed is missing", async () => {
    const access = createCaseCredentialAccess({ rpc: vi.fn() } as never);
    access.setActiveUser("u1");
    const updateCredentials = vi.fn(async () => null);
    const result = await persistToolBlockPatch({
      caseId: "case-B",
      userId: "u1",
      generation: access.generation("case-B"),
      block: "tools",
      updater: (c) => applyToolEntryFieldPatch(c, 0, { fieldValues: { x: "1" } }),
      draftCredentials: cred("case-A", [{ id: "te-default", tool: "A", fieldValues: { a: "1" } }]),
      credentialsReady: true,
      usedPublicFallback: false,
      deps: makeDeps(access, { updateCredentials }),
    });
    expect(updateCredentials).not.toHaveBeenCalled();
    expect(result.status).toBe("rejected");
  });

  it("keeps sibling fields and tools; serializes consecutive edits", async () => {
    const base = cred("c1", [
      { id: "te-default", tool: "memoQ", fieldValues: { a: "0", b: "0" } },
      { id: "te-2", tool: "GlobalProtect", fieldValues: { c: "3" } },
    ]);
    let server = structuredClone(base);
    const rpc = vi.fn().mockImplementation(async () => ({ data: structuredClone(server), error: null }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("c1");
    const gen = access.generation("c1");
    const updateCredentials = vi.fn(async (_id: string, patch: Partial<CaseCredentials>) => {
      server = { ...server, ...patch, revision: server.revision + 1 };
      return null;
    });
    const deps = makeDeps(access, { updateCredentials });
    const r1 = await persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "1" } }),
      draftCredentials: access.peekConfirmed("c1")!,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    expect(r1.status).toBe("ok");
    const r2 = await persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: access.generation("c1"),
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { b: "2" } }),
      draftCredentials: r1.confirmedCredentials,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    expect(r2.status).toBe("ok");
    expect(r2.confirmedCredentials?.tools?.[0].fieldValues).toEqual({ a: "1", b: "2" });
    expect(r2.confirmedCredentials?.tools?.[1].fieldValues).toEqual({ c: "3" });
  });

  it("parallel queue from same stale draft keeps both field intents on latest confirmed", async () => {
    const base = cred("c1", [
      { id: "te-default", tool: "memoQ", fieldValues: { a: "0", b: "0" } },
      { id: "te-2", tool: "GlobalProtect", fieldValues: { c: "3" } },
    ]);
    let server = structuredClone(base);
    const rpc = vi.fn().mockImplementation(async () => ({ data: structuredClone(server), error: null }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("c1");
    const gen = access.generation("c1");
    const staleDraft = structuredClone(access.peekConfirmed("c1")!);
    const updateCredentials = vi.fn(async (_id: string, patch: Partial<CaseCredentials>) => {
      server = { ...server, ...patch, revision: server.revision + 1 };
      return null;
    });
    const deps = makeDeps(access, { updateCredentials });
    const p1 = persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: (current) => applyToolEntryFieldPatchById(current, "te-default", { fieldValues: { a: "1" } }),
      draftCredentials: staleDraft,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    const p2 = persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: (current) => applyToolEntryFieldPatchById(current, "te-default", { fieldValues: { b: "2" } }),
      draftCredentials: staleDraft,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe("ok");
    expect(r2.status).toBe("ok");
    expect(r2.confirmedCredentials?.tools?.[0].fieldValues).toEqual({ a: "1", b: "2" });
    expect(r2.confirmedCredentials?.tools?.[1].fieldValues).toEqual({ c: "3" });
    expect(r2.confirmedCredentials?.questionTools?.[0].fieldValues).toEqual({ q: "1" });
  });

  it("failed draft field is not resent by a later sibling-field edit", async () => {
    const base = cred("c1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "0", b: "0" } }]);
    let server = structuredClone(base);
    const rpc = vi.fn().mockImplementation(async () => ({ data: structuredClone(server), error: null }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("c1");
    const gen = access.generation("c1");
    const depsFail = makeDeps(access, {
      updateCredentials: vi.fn(async () => new Error("write boom")),
    });
    const failed = await persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: (current) => applyToolEntryFieldPatchById(current, "te-default", { fieldValues: { a: "fail" } }),
      draftCredentials: access.peekConfirmed("c1")!,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: depsFail,
    });
    expect(failed.status).toBe("write_failed");
    expect(access.peekDraft("c1")?.tools?.[0].fieldValues).toEqual({ a: "fail", b: "0" });
    const depsOk = makeDeps(access, {
      updateCredentials: vi.fn(async (_id, patch) => {
        server = { ...server, ...patch, revision: server.revision + 1 };
        return null;
      }),
    });
    const ok2 = await persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: access.generation("c1"),
      block: "tools",
      updater: (current) => applyToolEntryFieldPatchById(current, "te-default", { fieldValues: { b: "2" } }),
      draftCredentials: failed.draftCredentials,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: depsOk,
    });
    expect(ok2.status).toBe("ok");
    expect(ok2.confirmedCredentials?.tools?.[0].fieldValues).toEqual({ a: "0", b: "2" });
  });

  it("rejects stale load that would overwrite a newer putConfirmed", async () => {
    let resolveLoad: ((value: unknown) => void) | undefined;
    const rpc = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    const pending = access.load("c1");
    access.putConfirmed("c1", cred("c1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "new" } }], 2));
    resolveLoad?.({
      data: cred("c1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "old" } }], 1),
      error: null,
    });
    await expect(pending).rejects.toBeInstanceOf(CredentialLoadStaleError);
    expect(access.peekConfirmed("c1")?.revision).toBe(2);
    expect(access.peekConfirmed("c1")?.tools?.[0].fieldValues).toEqual({ a: "new" });
  });

  it("does not put failed draft into confirmed cache", async () => {
    const base = cred("c1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "1" } }]);
    const rpc = vi.fn().mockResolvedValue({ data: structuredClone(base), error: null });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("c1");
    const result = await persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: access.generation("c1"),
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "draft" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: makeDeps(access, {
        updateCredentials: vi.fn(async () => new Error("case_revision_conflict")),
      }),
    });
    expect(result.status).toBe("write_failed");
    expect(access.peekDraft("c1")?.tools?.[0].fieldValues).toEqual({ a: "draft" });
    expect(access.peekConfirmed("c1")?.tools?.[0].fieldValues).toEqual({ a: "1" });
  });

  it("reports write_ok_readback_pending without claiming full success", async () => {
    const base = cred("c1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "1" } }]);
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: structuredClone(base), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "credential_access_denied" } });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("c1");
    const result = await persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: access.generation("c1"),
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "2" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: makeDeps(access, {
        updateCredentials: vi.fn(async () => null),
      }),
    });
    expect(result.status).toBe("write_ok_readback_pending");
    expect(result.error?.message).toMatch(/已寫入、尚未確認讀回/);
    expect(result.confirmedCredentials).toBeNull();
  });

  it("cancels queued write after case clear (switch)", async () => {
    const base = cred("c1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "1" } }]);
    let release!: () => void;
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    const rpc = vi.fn().mockResolvedValue({ data: structuredClone(base), error: null });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("c1");
    const gen = access.generation("c1");
    let entered = false;
    const updateCredentials = vi.fn(async () => {
      entered = true;
      await blocked;
      return null;
    });
    const deps = makeDeps(access, { updateCredentials });
    const p1 = persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "x" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    await vi.waitFor(() => expect(entered).toBe(true));
    access.clear("c1");
    release();
    const r1 = await p1;
    // write may have completed before clear observed on readback; either stale or readback pending
    expect(["stale_session", "write_ok_readback_pending", "ok", "write_failed"]).toContain(r1.status);
    const p2 = persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: gen,
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "y" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps,
    });
    const r2 = await p2;
    expect(r2.status).toMatch(/rejected|stale_session/);
    expect(updateCredentials.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("isPersistResultCurrent rejects late result for another case", () => {
    expect(isPersistResultCurrent({
      result: {
        status: "ok",
        error: null,
        draftCredentials: null,
        confirmedCredentials: cred("A", []),
        caseId: "A",
        userId: "u1",
        generation: 1,
      },
      viewingCaseId: "B",
      activeUserId: "u1",
      generation: 1,
    })).toBe(false);
  });

  it("allows intentional clear of a single field", async () => {
    const base = cred("c1", [{ id: "te-default", tool: "memoQ", fieldValues: { a: "1", b: "2" } }]);
    let server = structuredClone(base);
    const rpc = vi.fn().mockImplementation(async () => ({ data: structuredClone(server), error: null }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("c1");
    const result = await persistToolBlockPatch({
      caseId: "c1",
      userId: "u1",
      generation: access.generation("c1"),
      block: "tools",
      updater: (current) => applyToolEntryFieldPatch(current, 0, { fieldValues: { a: "" } }),
      draftCredentials: base,
      credentialsReady: true,
      usedPublicFallback: false,
      deps: makeDeps(access, {
        updateCredentials: async (_id, patch) => {
          server = { ...server, ...patch };
          return null;
        },
      }),
    });
    expect(result.status).toBe("ok");
    expect(result.confirmedCredentials?.tools?.[0].fieldValues).toEqual({ a: "", b: "2" });
  });
});
