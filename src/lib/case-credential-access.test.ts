import { describe, expect, it, vi } from "vitest";
import {
  createCaseCredentialAccess,
  CredentialLoadStaleError,
} from "./case-credential-access";

const sample = (caseId: string, revision: number, password: string) => ({
  caseId,
  revision,
  loginAccount: "account",
  loginPassword: password,
  otherLoginInfo: "",
  toolFieldValues: {},
  tools: [{ id: "te-default", tool: "memoQ", fieldValues: { a: "1" } }],
  questionTools: [],
});

describe("case credential access", () => {
  it("keeps confirmed credentials and clears per case", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: sample("case-1", 4, "secret"),
      error: null,
    });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");

    await access.load("case-1");
    expect(access.peekConfirmed("case-1")?.loginPassword).toBe("secret");

    access.clear("case-1");
    expect(access.peekConfirmed("case-1")).toBeUndefined();
  });

  it("keeps prior confirmed credentials when a refresh is denied", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: sample("case-1", 4, "secret"),
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42501", message: "credential_access_denied" },
      });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");

    await access.load("case-1");
    await expect(access.load("case-1")).rejects.toMatchObject({
      message: "credential_access_denied",
    });
    expect(access.peekConfirmed("case-1")?.loginPassword).toBe("secret");
  });

  it("clears every case on session invalidation", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: sample("a", 1, "a"), error: null })
      .mockResolvedValueOnce({ data: sample("b", 1, "b"), error: null });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");

    await access.load("a");
    await access.load("b");
    access.clearAll();

    expect(access.peekConfirmed("a")).toBeUndefined();
    expect(access.peekConfirmed("b")).toBeUndefined();
  });

  it("ignores in-flight load after clearAll", async () => {
    let resolveLoad: ((value: unknown) => void) | undefined;
    const rpc = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");

    const pending = access.load("case-1");
    access.clearAll();
    resolveLoad?.({ data: sample("case-1", 1, "leaked"), error: null });

    await expect(pending).rejects.toBeInstanceOf(CredentialLoadStaleError);
    expect(access.peekConfirmed("case-1")).toBeUndefined();
  });

  it("keeps draft separate from confirmed after putDraft", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: sample("case-1", 1, "secret"),
      error: null,
    });
    const access = createCaseCredentialAccess({ rpc } as never);
    access.setActiveUser("u1");
    await access.load("case-1");
    access.putDraft("case-1", {
      ...sample("case-1", 1, "secret"),
      tools: [{ id: "te-default", tool: "memoQ", fieldValues: { a: "draft" } }],
    });
    expect(access.peekDraft("case-1")?.tools?.[0].fieldValues).toEqual({ a: "draft" });
    expect(access.peekConfirmed("case-1")?.tools?.[0].fieldValues).toEqual({ a: "1" });
  });
});
