import type { ToolEntry } from "@/data/case-types";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import { assertWritableToolCredentials } from "@/lib/case-tool-credentials-guard";

export type DuplicateToolsAbortReason =
  | "source_not_found"
  | "source_credentials_unavailable"
  | "source_credentials_masked"
  | "source_case_mismatch"
  | "session_mismatch"
  | "create_failed";

export type DuplicateCredentialPatch = {
  tools: ToolEntry[];
  questionTools: ToolEntry[];
  loginAccount: string;
  loginPassword: string;
  otherLoginInfo: string;
  toolFieldValues: Record<string, string>;
};

export type SourceCredentialsChannel = "credentials_rpc" | "public_view" | "unknown";

const ABORT_MESSAGES: Record<DuplicateToolsAbortReason, string> = {
  source_not_found: "找不到來源案件，已取消複製。",
  source_credentials_unavailable: "來源案件的完整工具資料無法讀取，已取消複製。",
  source_credentials_masked: "來源工具仍是公開遮罩或未載入底稿，已取消複製。",
  source_case_mismatch: "讀到的工具資料不屬於來源案件，已取消複製。",
  session_mismatch: "目前登入身分不明，已取消複製（避免寫入錯誤環境）。",
  create_failed: "新案件建立失敗，未寫入工具。",
};

export function duplicateAbortMessage(reason: DuplicateToolsAbortReason): string {
  return ABORT_MESSAGES[reason];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 公開 view／未知來源不得當複製底稿；必須是憑證 RPC 讀回。 */
export function evaluateSourceCredentials(input: {
  sourceCaseId: string;
  credentials: CaseCredentials | null | undefined;
  sourceChannel: SourceCredentialsChannel;
  activeUserId: string | null;
}):
  | { ok: true; credentials: CaseCredentials }
  | { ok: false; reason: DuplicateToolsAbortReason; message: string } {
  if (!input.activeUserId) {
    return { ok: false, reason: "session_mismatch", message: duplicateAbortMessage("session_mismatch") };
  }
  if (input.sourceChannel !== "credentials_rpc") {
    return {
      ok: false,
      reason: "source_credentials_masked",
      message: duplicateAbortMessage("source_credentials_masked"),
    };
  }
  if (!assertWritableToolCredentials(input.credentials)) {
    return {
      ok: false,
      reason: "source_credentials_unavailable",
      message: duplicateAbortMessage("source_credentials_unavailable"),
    };
  }
  if (!Number.isSafeInteger(input.credentials.revision) || input.credentials.revision < 0) {
    return {
      ok: false,
      reason: "source_credentials_unavailable",
      message: duplicateAbortMessage("source_credentials_unavailable"),
    };
  }
  if (input.credentials.caseId !== input.sourceCaseId) {
    return {
      ok: false,
      reason: "source_case_mismatch",
      message: duplicateAbortMessage("source_case_mismatch"),
    };
  }
  return { ok: true, credentials: input.credentials };
}

export function buildDuplicateCredentialPatch(creds: CaseCredentials): DuplicateCredentialPatch {
  return {
    tools: cloneJson(creds.tools ?? []),
    questionTools: cloneJson(creds.questionTools ?? []),
    loginAccount: creds.loginAccount ?? "",
    loginPassword: creds.loginPassword ?? "",
    otherLoginInfo: creds.otherLoginInfo ?? "",
    toolFieldValues: cloneJson(creds.toolFieldValues ?? {}),
  };
}

export function shouldWriteCredentialPatch(patch: DuplicateCredentialPatch): boolean {
  return (
    patch.tools.length > 0
    || patch.questionTools.length > 0
    || !!patch.loginAccount
    || !!patch.loginPassword
    || !!patch.otherLoginInfo
    || Object.keys(patch.toolFieldValues).length > 0
  );
}

function fieldValuesEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (String(left[key] ?? "") !== String(right[key] ?? "")) return false;
  }
  return true;
}

export function toolBlocksEqual(
  left: ToolEntry[] | undefined,
  right: ToolEntry[] | undefined,
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((entry) => [entry.id, entry]));
  for (const entry of a) {
    const other = byId.get(entry.id);
    if (!other) return false;
    if (String(entry.tool || "") !== String(other.tool || "")) return false;
    if (!fieldValuesEqual(entry.fieldValues, other.fieldValues)) return false;
  }
  return true;
}

export function credentialsMatchCopied(
  expected: DuplicateCredentialPatch,
  actual: CaseCredentials,
): boolean {
  return (
    toolBlocksEqual(expected.tools, actual.tools)
    && toolBlocksEqual(expected.questionTools, actual.questionTools)
    && String(actual.loginAccount ?? "") === expected.loginAccount
    && String(actual.loginPassword ?? "") === expected.loginPassword
    && String(actual.otherLoginInfo ?? "") === expected.otherLoginInfo
    && fieldValuesEqual(expected.toolFieldValues, actual.toolFieldValues)
  );
}
