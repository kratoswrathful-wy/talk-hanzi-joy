import { describe, expect, it } from "vitest";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import type { ToolEntry } from "@/data/case-types";
import {
  buildDuplicateCredentialPatch,
  credentialsMatchCopied,
  evaluateSourceCredentials,
  shouldWriteCredentialPatch,
  toolBlocksEqual,
} from "./case-duplicate-tools";

function cred(partial: Partial<CaseCredentials> & { caseId: string }): CaseCredentials {
  return {
    revision: 1,
    loginAccount: "",
    loginPassword: "",
    otherLoginInfo: "",
    toolFieldValues: {},
    tools: [],
    questionTools: [],
    ...partial,
  };
}

const memoq: ToolEntry = {
  id: "te-1",
  tool: "memoQ",
  fieldValues: { "f-server": "mq.synthetic.local", "f-user": "synthetic-user" },
};

describe("case-duplicate-tools", () => {
  it("rejects public-view or unknown channels even if payload looks full", () => {
    const credentials = cred({ caseId: "src", tools: [memoq] });
    expect(
      evaluateSourceCredentials({
        sourceCaseId: "src",
        credentials,
        sourceChannel: "public_view",
        activeUserId: "user-1",
      }).ok,
    ).toBe(false);
    expect(
      evaluateSourceCredentials({
        sourceCaseId: "src",
        credentials,
        sourceChannel: "unknown",
        activeUserId: "user-1",
      }).ok,
    ).toBe(false);
  });

  it("rejects missing session, missing credentials, and case mismatch", () => {
    const noSession = evaluateSourceCredentials({
      sourceCaseId: "src",
      credentials: cred({ caseId: "src", tools: [memoq] }),
      sourceChannel: "credentials_rpc",
      activeUserId: null,
    });
    expect(noSession.ok).toBe(false);
    if (!noSession.ok) expect(noSession.reason).toBe("session_mismatch");

    const unread = evaluateSourceCredentials({
      sourceCaseId: "src",
      credentials: null,
      sourceChannel: "credentials_rpc",
      activeUserId: "user-1",
    });
    expect(unread.ok).toBe(false);
    if (!unread.ok) expect(unread.reason).toBe("source_credentials_unavailable");

    const badRevision = evaluateSourceCredentials({
      sourceCaseId: "src",
      credentials: cred({ caseId: "src", revision: -1, tools: [memoq] }),
      sourceChannel: "credentials_rpc",
      activeUserId: "user-1",
    });
    expect(badRevision.ok).toBe(false);
    if (!badRevision.ok) expect(badRevision.reason).toBe("source_credentials_unavailable");

    const mismatch = evaluateSourceCredentials({
      sourceCaseId: "src",
      credentials: cred({ caseId: "other", tools: [memoq] }),
      sourceChannel: "credentials_rpc",
      activeUserId: "user-1",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toBe("source_case_mismatch");
  });

  it("accepts empty credentials from the RPC channel (no-tools source)", () => {
    const evaluated = evaluateSourceCredentials({
      sourceCaseId: "src",
      credentials: cred({ caseId: "src" }),
      sourceChannel: "credentials_rpc",
      activeUserId: "user-1",
    });
    expect(evaluated.ok).toBe(true);
    if (evaluated.ok) {
      expect(shouldWriteCredentialPatch(buildDuplicateCredentialPatch(evaluated.credentials))).toBe(false);
    }
  });

  it("clones tools and questionTools without sharing references", () => {
    const credentials = cred({
      caseId: "src",
      tools: [memoq],
      questionTools: [{ id: "qt-1", tool: "memoQ", fieldValues: { "f-q": "ask" } }],
    });
    const patch = buildDuplicateCredentialPatch(credentials);
    expect(patch.tools[0]).not.toBe(credentials.tools[0]);
    patch.tools[0].fieldValues!["f-server"] = "mutated";
    expect(credentials.tools[0].fieldValues!["f-server"]).toBe("mq.synthetic.local");
    expect(shouldWriteCredentialPatch(patch)).toBe(true);
  });

  it("matches copied credentials by entry id, not array identity", () => {
    const expected = buildDuplicateCredentialPatch(
      cred({ caseId: "src", tools: [memoq], questionTools: [] }),
    );
    const actual = cred({
      caseId: "dst",
      tools: [{ ...memoq, fieldValues: { "f-user": "synthetic-user", "f-server": "mq.synthetic.local" } }],
    });
    expect(credentialsMatchCopied(expected, actual)).toBe(true);
    expect(toolBlocksEqual(expected.tools, [{ ...memoq, fieldValues: { "f-server": "other" } }])).toBe(false);
  });
});
