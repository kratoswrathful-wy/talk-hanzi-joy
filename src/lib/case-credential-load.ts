import type { CaseCredentials } from "@/lib/case-action-rpc";
import { caseRpcErrorKind } from "@/lib/case-action-rpc";
import { CredentialLoadStaleError } from "@/lib/case-credential-access";

/** get_case_credentials 契約只回這些鍵；其餘不得當憑證底稿。 */
export const CASE_CREDENTIAL_PAYLOAD_KEYS = [
  "caseId",
  "revision",
  "loginAccount",
  "loginPassword",
  "otherLoginInfo",
  "toolFieldValues",
  "tools",
  "questionTools",
] as const;

/** 主管私有欄：不得因放開工具讀取而出現在憑證回應。 */
export const CASE_PM_PRIVATE_RESPONSE_KEYS = [
  "client",
  "contact",
  "keyword",
  "clientPoNumber",
  "client_po_number",
  "clientCaseLink",
  "client_case_link",
  "dispatchRoute",
  "dispatch_route",
  "internalComments",
  "internal_comments",
] as const;

export type CredentialLoadFailureKind =
  | "stale"
  | "no_access"
  | "load_fail"
  | "mismatch"
  | "unknown";

export type CredentialLoadSuccessKind = "ok" | "empty_ok";

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error ?? "");
}

export function stripUnexpectedPmPrivateKeys<T extends Record<string, unknown>>(
  payload: T,
): T {
  const next = { ...payload };
  for (const key of CASE_PM_PRIVATE_RESPONSE_KEYS) {
    if (key in next) {
      delete next[key];
    }
  }
  return next;
}

export function sanitizeCaseCredentialsPayload(
  data: CaseCredentials,
): CaseCredentials {
  const stripped = stripUnexpectedPmPrivateKeys(data as CaseCredentials & Record<string, unknown>);
  return {
    caseId: stripped.caseId,
    revision: stripped.revision,
    loginAccount: typeof stripped.loginAccount === "string" ? stripped.loginAccount : "",
    loginPassword: typeof stripped.loginPassword === "string" ? stripped.loginPassword : "",
    otherLoginInfo: typeof stripped.otherLoginInfo === "string" ? stripped.otherLoginInfo : "",
    toolFieldValues: stripped.toolFieldValues && typeof stripped.toolFieldValues === "object"
      ? stripped.toolFieldValues
      : {},
    tools: Array.isArray(stripped.tools) ? stripped.tools : [],
    questionTools: Array.isArray(stripped.questionTools) ? stripped.questionTools : [],
  };
}

export function classifyCredentialLoadSuccess(
  credentials: CaseCredentials | null | undefined,
): CredentialLoadSuccessKind {
  if (!credentials || !Array.isArray(credentials.tools)) return "ok";
  const toolsEmpty = credentials.tools.length === 0
    || credentials.tools.every((entry) => !entry?.tool && Object.keys(entry?.fieldValues ?? {}).length === 0);
  const questions = credentials.questionTools ?? [];
  const questionsEmpty = questions.length === 0
    || questions.every((entry) => !entry?.tool && Object.keys(entry?.fieldValues ?? {}).length === 0);
  return toolsEmpty && questionsEmpty ? "empty_ok" : "ok";
}

export function classifyCredentialLoadError(error: unknown): CredentialLoadFailureKind {
  if (error instanceof CredentialLoadStaleError) return "stale";
  const message = errorMessage(error);
  const code = errorCode(error);
  if (message.includes("credential_case_mismatch")) return "mismatch";
  if (
    code === "42501"
    || /credential_access_denied|not_authorized|access_denied|not_assigned/.test(message)
  ) {
    return "no_access";
  }
  const rpcKind = error instanceof Error || (error && typeof error === "object")
    ? caseRpcErrorKind(error as Error)
    : "unknown";
  if (rpcKind === "forbidden") return "no_access";
  if (
    rpcKind === "unavailable"
    || code === "P0002"
    || /unavailable|network|timeout|fetch|credential_access_failed/i.test(message)
  ) {
    return "load_fail";
  }
  return "unknown";
}

export function credentialLoadUserMessage(kind: CredentialLoadFailureKind): {
  title: string;
  description: string;
} {
  switch (kind) {
    case "no_access":
      return {
        title: "尚未確認登入身分",
        description: "請確認已登入後再讀工具資料。這不是「本案沒有工具」或暫時讀取失敗。",
      };
    case "mismatch":
      return {
        title: "工具資料案件不符",
        description: "這次讀取已忽略，不會寫入其他案件。",
      };
    case "load_fail":
      return {
        title: "工具憑證暫時讀不到",
        description: "請稍後再試。已保留先前確認的內容，不會用空值覆寫。",
      };
    case "stale":
      return {
        title: "工具讀取已過期",
        description: "已忽略這次過期結果。",
      };
    default:
      return {
        title: "工具憑證讀取發生問題",
        description: "請稍後再試。已保留先前確認的內容，不會用空值覆寫。",
      };
  }
}

export function shouldToastCredentialLoadFailure(kind: CredentialLoadFailureKind): boolean {
  return kind !== "stale";
}
