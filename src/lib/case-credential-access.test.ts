import { describe, expect, it, vi } from "vitest";
import { createCaseCredentialAccess } from "./case-credential-access";

describe("case credential access", () => {
  it("keeps credentials in a session-only cache and clears per case", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        caseId: "case-1",
        revision: 4,
        loginAccount: "account",
        loginPassword: "secret",
        otherLoginInfo: "",
        toolFieldValues: {},
        tools: [],
        questionTools: [],
      },
      error: null,
    });
    const access = createCaseCredentialAccess({ rpc } as never);

    await access.load("case-1");
    expect(access.peek("case-1")?.loginPassword).toBe("secret");

    access.clear("case-1");
    expect(access.peek("case-1")).toBeUndefined();
  });

  it("drops stale cached credentials when a refresh is denied", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          caseId: "case-1",
          revision: 4,
          loginAccount: "account",
          loginPassword: "secret",
          otherLoginInfo: "",
          toolFieldValues: {},
          tools: [],
          questionTools: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42501", message: "credential_access_denied" },
      });
    const access = createCaseCredentialAccess({ rpc } as never);

    await access.load("case-1");
    await expect(access.load("case-1")).rejects.toMatchObject({
      message: "credential_access_denied",
    });
    expect(access.peek("case-1")).toBeUndefined();
  });

  it("clears every case on session invalidation", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          caseId: "a",
          revision: 1,
          loginAccount: "a",
          loginPassword: "a",
          otherLoginInfo: "",
          toolFieldValues: {},
          tools: [],
          questionTools: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          caseId: "b",
          revision: 1,
          loginAccount: "b",
          loginPassword: "b",
          otherLoginInfo: "",
          toolFieldValues: {},
          tools: [],
          questionTools: [],
        },
        error: null,
      });
    const access = createCaseCredentialAccess({ rpc } as never);

    await access.load("a");
    await access.load("b");
    access.clearAll();

    expect(access.peek("a")).toBeUndefined();
    expect(access.peek("b")).toBeUndefined();
  });
});
