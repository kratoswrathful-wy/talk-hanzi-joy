import { describe, expect, it } from "vitest";
import { CredentialLoadStaleError } from "./case-credential-access";
import {
  classifyCredentialLoadError,
  classifyCredentialLoadSuccess,
  credentialLoadUserMessage,
  sanitizeCaseCredentialsPayload,
  shouldToastCredentialLoadFailure,
  stripUnexpectedPmPrivateKeys,
} from "./case-credential-load";

const sample = (overrides: Record<string, unknown> = {}) => ({
  caseId: "case-1",
  revision: 1,
  loginAccount: "acc",
  loginPassword: "pw",
  otherLoginInfo: "",
  toolFieldValues: {},
  tools: [{ id: "te-1", tool: "memoQ", fieldValues: { a: "1" } }],
  questionTools: [],
  ...overrides,
});

describe("case credential load classify", () => {
  it("成功空工具不是失敗也不是無權", () => {
    expect(classifyCredentialLoadSuccess(sample({
      loginAccount: "",
      loginPassword: "",
      tools: [],
      questionTools: [],
    }))).toBe("empty_ok");
    expect(classifyCredentialLoadSuccess(sample({
      tools: [{ id: "te-empty", tool: "", fieldValues: {} }],
      questionTools: [{ id: "qt-empty", tool: "", fieldValues: {} }],
    }))).toBe("empty_ok");
    expect(classifyCredentialLoadSuccess(sample())).toBe("ok");
  });

  it("無權、暫時失敗、過期、空工具不是同一種", () => {
    expect(classifyCredentialLoadError({
      code: "42501",
      message: "not_authorized",
    })).toBe("no_access");
    expect(classifyCredentialLoadError(new Error("credential_access_failed"))).toBe("load_fail");
    expect(classifyCredentialLoadError(new CredentialLoadStaleError())).toBe("stale");
    expect(classifyCredentialLoadError(new Error("credential_case_mismatch"))).toBe("mismatch");
    expect(credentialLoadUserMessage("no_access").title).not.toBe(
      credentialLoadUserMessage("load_fail").title,
    );
    expect(credentialLoadUserMessage("no_access").title).not.toMatch(/無權|載入失敗/);
    expect(credentialLoadUserMessage("no_access").description).not.toMatch(/沒有讀取|無法查看工具/);
    expect(shouldToastCredentialLoadFailure("stale")).toBe(false);
    expect(shouldToastCredentialLoadFailure("load_fail")).toBe(true);
  });

  it("憑證回應若夾帶主管私有鍵必須去掉", () => {
    const leaked = sample({
      client: "secret-client",
      keyword: "secret-kw",
      internalComments: [{ id: "1", text: "pm-only" }],
      client_po_number: "PO-1",
    }) as ReturnType<typeof sample> & Record<string, unknown>;
    const stripped = stripUnexpectedPmPrivateKeys(leaked);
    expect(stripped).not.toHaveProperty("client");
    expect(stripped).not.toHaveProperty("keyword");
    expect(stripped).not.toHaveProperty("internalComments");
    expect(stripped).not.toHaveProperty("client_po_number");
    expect(stripped.loginPassword).toBe("pw");
    expect(sanitizeCaseCredentialsPayload(leaked as never).loginPassword).toBe("pw");
    expect(sanitizeCaseCredentialsPayload(leaked as never)).not.toHaveProperty("client");
  });
});
