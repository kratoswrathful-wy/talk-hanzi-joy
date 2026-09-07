import { describe, expect, it } from "vitest";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import type { ToolEntry } from "@/data/case-types";
import {
  buildDuplicateCredentialPatch,
  buildPendingDuplicateToolsRecord,
  classifyDuplicateException,
  credentialsMatchCopied,
  evaluateRetryDecision,
  createdReadbackFailedMessage,
  createUnknownMessage,
  evaluateSourceCredentials,
  filterPendingRecordsForScope,
  fingerprintCredentialPatch,
  parsePendingDuplicateToolsRecords,
  pendingDuplicateToolsMessageTestId,
  pendingRecordHasForbiddenKeys,
  RETRY_MESSAGES,
  serializePendingDuplicateToolsRecords,
  shouldWriteCredentialPatch,
  toolBlocksEqual,
  toolFieldsEqual,
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

const SRC = "00000000-0000-4000-8000-000000000001";
const DST = "00000000-0000-4000-8000-000000000002";
const USER = "user-1";

const memoq: ToolEntry = {
  id: "te-1",
  tool: "memoQ",
  fields: [
    { id: "f-server", label: "伺服器", type: "text" },
    { id: "f-user", label: "帳號", type: "text" },
  ],
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

  it("does not treat matching fieldValues as complete when field definitions differ", () => {
    const expected = buildDuplicateCredentialPatch(cred({ caseId: "src", tools: [memoq] }));
    const missingFields = cred({
      caseId: "dst",
      tools: [{ id: "te-1", tool: "memoQ", fieldValues: { ...memoq.fieldValues } }],
    });
    expect(credentialsMatchCopied(expected, missingFields)).toBe(false);

    const relabeled = cred({
      caseId: "dst",
      tools: [{
        ...memoq,
        fields: [
          { id: "f-server", label: "主機", type: "text" },
          { id: "f-user", label: "帳號", type: "text" },
        ],
      }],
    });
    expect(credentialsMatchCopied(expected, relabeled)).toBe(false);

    const typeChanged = cred({
      caseId: "dst",
      tools: [{
        ...memoq,
        fields: [
          { id: "f-server", label: "伺服器", type: "file" },
          { id: "f-user", label: "帳號", type: "text" },
        ],
      }],
    });
    expect(credentialsMatchCopied(expected, typeChanged)).toBe(false);
  });

  it("treats omitted field type as text and omitted fileValues as empty", () => {
    expect(toolFieldsEqual(
      [{ id: "f-1", label: "備註" }],
      [{ id: "f-1", label: "備註", type: "text" }],
    )).toBe(true);
    const withFiles: ToolEntry = {
      ...memoq,
      fileValues: { "f-attach": [{ name: "a.txt", url: "https://example.test/a" }] },
    };
    const withoutFiles = { ...memoq };
    expect(toolBlocksEqual([withFiles], [withoutFiles])).toBe(false);
    expect(toolBlocksEqual([withoutFiles], [{ ...memoq, fileValues: {} }])).toBe(true);
  });

  it("does not fail completeness only because field definition order differs", () => {
    const reversed: ToolEntry = {
      ...memoq,
      fields: [
        { id: "f-user", label: "帳號", type: "text" },
        { id: "f-server", label: "伺服器", type: "text" },
      ],
    };
    expect(toolBlocksEqual([memoq], [reversed])).toBe(true);
  });
});

describe("duplicate-tools retry decision and pending records", () => {
  const expected = buildDuplicateCredentialPatch(cred({ caseId: SRC, tools: [memoq] }));
  /** 部分完成當下的新案：全空、revision 4 */
  const emptyTargetBaseline = {
    revision: 4,
    patch: buildDuplicateCredentialPatch(cred({ caseId: DST, revision: 4 })),
  };
  const pending = buildPendingDuplicateToolsRecord({
    targetCaseId: DST,
    sourceCaseId: SRC,
    userId: USER,
    env: "test",
    sourceRevision: 3,
    expected,
    message: "待補寫",
    targetBaseline: emptyTargetBaseline,
  });
  const legacyPending = buildPendingDuplicateToolsRecord({
    targetCaseId: DST,
    sourceCaseId: SRC,
    userId: USER,
    env: "test",
    sourceRevision: 3,
    expected,
    message: "待補寫",
  });

  it("fingerprints expected content without putting values on the record", () => {
    expect(pending.expectedFingerprint).toMatch(/^[0-9a-f]+$/);
    expect(pending.targetBaselineFingerprint).toMatch(/^[0-9a-f]+$/);
    expect(pending.targetBaselineRevision).toBe(4);
    expect(JSON.stringify(pending)).not.toContain("mq.synthetic.local");
    expect(JSON.stringify(pending)).not.toContain("synthetic-user");
    expect(pendingRecordHasForbiddenKeys({ ...pending, loginPassword: "x" })).toBe(true);
  });

  it("rejects stored records that contain secret-like keys", () => {
    const raw = JSON.stringify([{
      ...pending,
      loginPassword: "should-not-store",
    }]);
    expect(parsePendingDuplicateToolsRecords(raw)).toEqual([]);
  });

  it("round-trips allowlisted pending records and scopes by user/env", () => {
    const raw = serializePendingDuplicateToolsRecords([pending]);
    const parsed = parsePendingDuplicateToolsRecords(raw);
    expect(parsed).toEqual([pending]);
    expect(filterPendingRecordsForScope(parsed, USER, "production")).toEqual([]);
    expect(filterPendingRecordsForScope(parsed, "other-user", "test")).toEqual([]);
    expect(filterPendingRecordsForScope(parsed, USER, "test")).toEqual([pending]);
  });

  it("verifies complete target without requesting a write", () => {
    const decision = evaluateRetryDecision({
      pending,
      source: cred({ caseId: SRC, revision: 3, tools: [memoq] }),
      target: cred({ caseId: DST, revision: 8, tools: [memoq] }),
      activeUserId: USER,
      activeEnv: "test",
    });
    expect(decision.action).toBe("already_complete");
    expect(decision.message).toBe(RETRY_MESSAGES.already_complete);
  });

  it("writes only when target is still empty and source fingerprint still matches", () => {
    const decision = evaluateRetryDecision({
      pending,
      source: cred({ caseId: SRC, revision: 9, tools: [memoq] }),
      target: cred({ caseId: DST, revision: 4 }),
      activeUserId: USER,
      activeEnv: "test",
    });
    expect(decision.action).toBe("write");
    if (decision.action === "write") {
      expect(decision.expectedRevision).toBe(4);
      expect(decision.patch.tools[0]?.fieldValues?.["f-server"]).toBe("mq.synthetic.local");
    }
  });

  it("does not refill after the user added tools to the new case and then cleared them", () => {
    // 使用者改過又清空：內容看起來與基準一樣空，但版本號已前進
    const decision = evaluateRetryDecision({
      pending,
      source: cred({ caseId: SRC, revision: 9, tools: [memoq] }),
      target: cred({ caseId: DST, revision: 6 }),
      activeUserId: USER,
      activeEnv: "test",
    });
    expect(decision.action).toBe("target_conflict");
    expect(decision.message).toBe(RETRY_MESSAGES.target_cleared);
  });

  it("treats an empty target with no recorded baseline as unsafe to refill", () => {
    expect(legacyPending.targetBaselineFingerprint).toBeUndefined();
    const decision = evaluateRetryDecision({
      pending: legacyPending,
      source: cred({ caseId: SRC, revision: 9, tools: [memoq] }),
      target: cred({ caseId: DST, revision: 4 }),
      activeUserId: USER,
      activeEnv: "test",
    });
    expect(decision.action).toBe("target_conflict");
    expect(decision.message).toBe(RETRY_MESSAGES.target_baseline_unknown);
  });

  it("still verifies a complete target even without a recorded baseline", () => {
    const decision = evaluateRetryDecision({
      pending: legacyPending,
      source: cred({ caseId: SRC, revision: 3, tools: [memoq] }),
      target: cred({ caseId: DST, revision: 9, tools: [memoq] }),
      activeUserId: USER,
      activeEnv: "test",
    });
    expect(decision.action).toBe("already_complete");
  });

  it("drops a malformed stored baseline instead of trusting it", () => {
    const raw = JSON.stringify([{
      ...pending,
      targetBaselineRevision: "not-a-number",
    }]);
    const parsed = parsePendingDuplicateToolsRecords(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].targetBaselineRevision).toBeUndefined();
    expect(parsed[0].targetBaselineFingerprint).toBeUndefined();
  });

  it("stops when the target already has different tool content", () => {
    const decision = evaluateRetryDecision({
      pending,
      source: cred({ caseId: SRC, tools: [memoq] }),
      target: cred({
        caseId: DST,
        revision: 5,
        tools: [{ ...memoq, fieldValues: { ...memoq.fieldValues, "f-server": "user-edited" } }],
      }),
      activeUserId: USER,
      activeEnv: "test",
    });
    expect(decision.action).toBe("target_conflict");
    expect(decision.message).toBe(RETRY_MESSAGES.target_conflict);
  });

  it("stops when source content no longer matches the stored fingerprint", () => {
    const decision = evaluateRetryDecision({
      pending,
      source: cred({
        caseId: SRC,
        revision: 10,
        tools: [{ ...memoq, fieldValues: { ...memoq.fieldValues, "f-server": "source-changed" } }],
      }),
      target: cred({ caseId: DST }),
      activeUserId: USER,
      activeEnv: "test",
    });
    expect(decision.action).toBe("source_changed");
    expect(decision.message).toBe(RETRY_MESSAGES.source_changed);
  });

  it("rejects another account or environment", () => {
    expect(evaluateRetryDecision({
      pending,
      source: cred({ caseId: SRC, tools: [memoq] }),
      target: cred({ caseId: DST }),
      activeUserId: "other",
      activeEnv: "test",
    }).action).toBe("session_mismatch");
    expect(evaluateRetryDecision({
      pending,
      source: cred({ caseId: SRC, tools: [memoq] }),
      target: cred({ caseId: DST }),
      activeUserId: USER,
      activeEnv: "production",
    }).action).toBe("session_mismatch");
  });

  it("maps conflict and source-changed messages to unique test ids", () => {
    expect(pendingDuplicateToolsMessageTestId(RETRY_MESSAGES.target_conflict)).toBe("duplicate-tools-conflict");
    expect(pendingDuplicateToolsMessageTestId(RETRY_MESSAGES.source_changed)).toBe("duplicate-tools-source-changed");
    expect(pendingDuplicateToolsMessageTestId(RETRY_MESSAGES.already_complete)).toBeUndefined();
  });

  it("keeps the reserved target id in create readback/unknown messages", () => {
    const readback = createdReadbackFailedMessage(DST);
    expect(readback).toContain(DST);
    expect(readback).toContain("不要再複製一次");
    expect(pendingDuplicateToolsMessageTestId(readback)).toBe("duplicate-tools-readback-pending");

    const unknown = createUnknownMessage(DST);
    expect(unknown).toContain(DST);
    expect(unknown).toContain("未再建案");
    expect(unknown).not.toContain("再複製一張");
  });

  it("classifies post-create exceptions as pending, not create_failed", () => {
    expect(classifyDuplicateException(DST)).toBe("tools_pending");
    expect(classifyDuplicateException(null)).toBe("create_failed");
  });

  it("keeps fingerprint stable when only field order changes", () => {
    const reversed = buildDuplicateCredentialPatch(cred({
      caseId: SRC,
      tools: [{
        ...memoq,
        fields: [
          { id: "f-user", label: "帳號", type: "text" },
          { id: "f-server", label: "伺服器", type: "text" },
        ],
      }],
    }));
    expect(fingerprintCredentialPatch(reversed)).toBe(fingerprintCredentialPatch(expected));
  });
});
