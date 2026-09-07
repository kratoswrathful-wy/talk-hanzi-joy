import type { ToolEntry, ToolEntryField } from "@/data/case-types";
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

export type DuplicateToolsRetryStatus =
  | "already_complete"
  | "write"
  | "written"
  | "target_conflict"
  | "source_changed"
  | "session_mismatch"
  | "in_flight"
  | "failed";

export type PendingDuplicateToolsRecord = {
  v: 1;
  targetCaseId: string;
  sourceCaseId: string;
  userId: string;
  env: "test" | "production";
  sourceRevision: number;
  expectedFingerprint: string;
  message: string;
};

export const DUP_TOOLS_PENDING_STORAGE_KEY = "tms.dupToolsPending.v1";

const ABORT_MESSAGES: Record<DuplicateToolsAbortReason, string> = {
  source_not_found: "找不到來源案件，已取消複製。",
  source_credentials_unavailable: "來源案件的完整工具資料無法讀取，已取消複製。",
  source_credentials_masked: "來源工具仍是公開遮罩或未載入底稿，已取消複製。",
  source_case_mismatch: "讀到的工具資料不屬於來源案件，已取消複製。",
  session_mismatch: "目前登入身分不明，已取消複製（避免寫入錯誤環境）。",
  create_failed: "新案件建立失敗，未寫入工具。",
};

export const RETRY_MESSAGES = {
  already_complete: "工具已核實完成，未再寫入。",
  written: "工具已寫入既有新案。",
  target_conflict: "新案工具已與待補寫內容不同，未覆寫。請直接編輯本筆，不要再複製一次。",
  source_changed: "來源工具已變更，未套用新來源、未覆寫新案。",
  session_mismatch: "目前身分或環境與部分完成紀錄不符，未重試。",
  in_flight: "重試進行中，請稍候。",
  created_unknown:
    "新案件已建立，工具結果未知。已先查證、未重送。請用新案識別重試，不要再複製一次。",
} as const;

export function pendingDuplicateToolsMessageTestId(message: string): string | undefined {
  if (message.includes("未覆寫")) return "duplicate-tools-conflict";
  if (message.includes("來源工具已變更")) return "duplicate-tools-source-changed";
  return undefined;
}

const PENDING_RECORD_KEYS = [
  "v",
  "targetCaseId",
  "sourceCaseId",
  "userId",
  "env",
  "sourceRevision",
  "expectedFingerprint",
  "message",
] as const;

const SECRET_KEY_PATTERN =
  /password|loginAccount|loginPassword|otherLoginInfo|fieldValues|fileValues|questionTools|^tools$|secret|token|credential/i;

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

function fieldType(field: ToolEntryField | undefined): "text" | "file" {
  return field?.type === "file" ? "file" : "text";
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

function fileListsEqual(
  left: { name: string; url: string }[] | undefined,
  right: { name: string; url: string }[] | undefined,
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  if (a.length !== b.length) return false;
  return a.every((item, i) => String(item?.name ?? "") === String(b[i]?.name ?? "")
    && String(item?.url ?? "") === String(b[i]?.url ?? ""));
}

function fileValuesEqual(
  a: ToolEntry["fileValues"] | undefined,
  b: ToolEntry["fileValues"] | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!fileListsEqual(left[key], right[key])) return false;
  }
  return true;
}

function fieldsById(fields: ToolEntryField[] | undefined): Map<string, ToolEntryField> {
  const map = new Map<string, ToolEntryField>();
  for (const field of fields ?? []) {
    if (field?.id) map.set(field.id, field);
  }
  return map;
}

/** 欄位定義比對：同一 id 的標籤／型別（未標型別視為 text）。順序只當集合，不因排列不同判失敗。 */
export function toolFieldsEqual(
  left: ToolEntryField[] | undefined,
  right: ToolEntryField[] | undefined,
): boolean {
  const a = fieldsById(left);
  const b = fieldsById(right);
  if (a.size !== b.size) return false;
  for (const [id, field] of a) {
    const other = b.get(id);
    if (!other) return false;
    if (String(field.label ?? "") !== String(other.label ?? "")) return false;
    if (fieldType(field) !== fieldType(other)) return false;
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
    if (!toolFieldsEqual(entry.fields, other.fields)) return false;
    if (!fieldValuesEqual(entry.fieldValues, other.fieldValues)) return false;
    if (!fileValuesEqual(entry.fileValues, other.fileValues)) return false;
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

function sortedObject(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

function normalizeFields(fields: ToolEntryField[] | undefined) {
  return [...(fields ?? [])]
    .filter((field) => field?.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((field) => ({
      id: field.id,
      label: String(field.label ?? ""),
      type: fieldType(field),
    }));
}

function normalizeFileValues(fileValues: ToolEntry["fileValues"] | undefined) {
  const src = fileValues ?? {};
  const out: Record<string, { name: string; url: string }[]> = {};
  for (const key of Object.keys(src).sort()) {
    out[key] = (src[key] ?? []).map((item) => ({
      name: String(item?.name ?? ""),
      url: String(item?.url ?? ""),
    }));
  }
  return out;
}

function normalizeEntries(entries: ToolEntry[] | undefined) {
  return [...(entries ?? [])]
    .map((entry) => ({
      id: entry.id,
      tool: String(entry.tool || ""),
      fields: normalizeFields(entry.fields),
      fieldValues: sortedObject(entry.fieldValues ?? {}),
      fileValues: normalizeFileValues(entry.fileValues),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizePatch(patch: DuplicateCredentialPatch) {
  return {
    loginAccount: String(patch.loginAccount ?? ""),
    loginPassword: String(patch.loginPassword ?? ""),
    otherLoginInfo: String(patch.otherLoginInfo ?? ""),
    toolFieldValues: sortedObject(patch.toolFieldValues ?? {}),
    tools: normalizeEntries(patch.tools),
    questionTools: normalizeEntries(patch.questionTools),
  };
}

/** 53-bit 指紋；只存 hex，不存底稿值。 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16);
}

export function fingerprintCredentialPatch(patch: DuplicateCredentialPatch): string {
  return cyrb53(JSON.stringify(normalizePatch(patch)));
}

export function buildPendingDuplicateToolsRecord(input: {
  targetCaseId: string;
  sourceCaseId: string;
  userId: string;
  env: "test" | "production";
  sourceRevision: number;
  expected: DuplicateCredentialPatch;
  message: string;
}): PendingDuplicateToolsRecord {
  return {
    v: 1,
    targetCaseId: input.targetCaseId,
    sourceCaseId: input.sourceCaseId,
    userId: input.userId,
    env: input.env,
    sourceRevision: input.sourceRevision,
    expectedFingerprint: fingerprintCredentialPatch(input.expected),
    message: input.message,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function pendingRecordHasForbiddenKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => {
    if ((PENDING_RECORD_KEYS as readonly string[]).includes(key)) return false;
    return SECRET_KEY_PATTERN.test(key);
  });
}

export function parsePendingDuplicateToolsRecords(raw: string | null | undefined): PendingDuplicateToolsRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : (parsed as { records?: unknown }).records;
    if (!Array.isArray(list)) return [];
    const out: PendingDuplicateToolsRecord[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      if (pendingRecordHasForbiddenKeys(rec)) continue;
      if (rec.v !== 1) continue;
      if (typeof rec.targetCaseId !== "string" || !isUuid(rec.targetCaseId)) continue;
      if (typeof rec.sourceCaseId !== "string" || !isUuid(rec.sourceCaseId)) continue;
      if (typeof rec.userId !== "string" || !rec.userId) continue;
      if (rec.env !== "test" && rec.env !== "production") continue;
      const sourceRevision = Number(rec.sourceRevision);
      if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) continue;
      if (typeof rec.expectedFingerprint !== "string" || !rec.expectedFingerprint) continue;
      if (typeof rec.message !== "string") continue;
      out.push({
        v: 1,
        targetCaseId: rec.targetCaseId,
        sourceCaseId: rec.sourceCaseId,
        userId: rec.userId,
        env: rec.env,
        sourceRevision,
        expectedFingerprint: rec.expectedFingerprint,
        message: rec.message,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function serializePendingDuplicateToolsRecords(records: PendingDuplicateToolsRecord[]): string {
  return JSON.stringify(records.map((rec) => ({
    v: 1,
    targetCaseId: rec.targetCaseId,
    sourceCaseId: rec.sourceCaseId,
    userId: rec.userId,
    env: rec.env,
    sourceRevision: rec.sourceRevision,
    expectedFingerprint: rec.expectedFingerprint,
    message: rec.message,
  })));
}

export function filterPendingRecordsForScope(
  records: PendingDuplicateToolsRecord[],
  userId: string,
  env: "test" | "production",
): PendingDuplicateToolsRecord[] {
  return records.filter((rec) => rec.userId === userId && rec.env === env);
}

export type RetryDecision =
  | { action: "already_complete"; status: "already_complete"; message: string }
  | { action: "write"; status: "write"; patch: DuplicateCredentialPatch; expectedRevision: number; message: string }
  | { action: "target_conflict"; status: "target_conflict"; message: string }
  | { action: "source_changed"; status: "source_changed"; message: string }
  | { action: "session_mismatch"; status: "session_mismatch"; message: string };

export function evaluateRetryDecision(input: {
  pending: PendingDuplicateToolsRecord;
  source: CaseCredentials;
  target: CaseCredentials;
  activeUserId: string;
  activeEnv: "test" | "production";
}): RetryDecision {
  if (
    !input.activeUserId
    || input.activeUserId !== input.pending.userId
    || input.activeEnv !== input.pending.env
  ) {
    return { action: "session_mismatch", status: "session_mismatch", message: RETRY_MESSAGES.session_mismatch };
  }
  if (input.source.caseId !== input.pending.sourceCaseId || input.target.caseId !== input.pending.targetCaseId) {
    return { action: "session_mismatch", status: "session_mismatch", message: RETRY_MESSAGES.session_mismatch };
  }

  const sourcePatch = buildDuplicateCredentialPatch(input.source);
  const sourceFingerprint = fingerprintCredentialPatch(sourcePatch);
  if (sourceFingerprint !== input.pending.expectedFingerprint) {
    return { action: "source_changed", status: "source_changed", message: RETRY_MESSAGES.source_changed };
  }

  const targetPatch = buildDuplicateCredentialPatch(input.target);
  if (fingerprintCredentialPatch(targetPatch) === input.pending.expectedFingerprint) {
    return { action: "already_complete", status: "already_complete", message: RETRY_MESSAGES.already_complete };
  }
  if (shouldWriteCredentialPatch(targetPatch)) {
    return { action: "target_conflict", status: "target_conflict", message: RETRY_MESSAGES.target_conflict };
  }
  return {
    action: "write",
    status: "write",
    patch: sourcePatch,
    expectedRevision: input.target.revision,
    message: RETRY_MESSAGES.written,
  };
}

export function classifyDuplicateException(createdCaseId: string | null | undefined): "create_failed" | "tools_pending" {
  return createdCaseId ? "tools_pending" : "create_failed";
}
