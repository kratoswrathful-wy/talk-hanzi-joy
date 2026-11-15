import type { Json } from "@/integrations/supabase/types";
import { isSameRevision, serializeBlocksForCompare } from "@/lib/rich-text-remote-sync";

export const NOTE_SERVER_OWNED_KEYS = new Set([
  "id",
  "env",
  "created_by",
  "created_at",
  "updated_at",
]);

export const NOTE_PATCH_KEYS = new Set([
  "title",
  "related_case",
  "creator",
  "status",
  "note_type",
  "internal_assignee",
  "file_name",
  "id_row_count",
  "source_text",
  "translated_text",
  "question_or_note",
  "question_or_note_blocks",
  "reference_files",
  "comments",
  "invalidated",
  "invalidated_by",
  "invalidated_at",
  "invalidation_reason",
  "edit_logs",
  "edit_log_started_at",
  "consultation_slack_records",
]);

export type ApplyInternalNoteWriteResult = {
  ok: boolean;
  note?: Record<string, Json | string | boolean | null>;
  error?: string;
  noop?: boolean;
};

/** 伺服器版本原樣保留，禁止 Date 來回以免截掉微秒。 */
const ownNoteWriteRevisions = new Map<string, string>();

/** 成功寫入回傳的版本，須在 notify 之前記住，避免同一頁把自己的存檔當成別人的新版。 */
export function rememberOwnNoteWriteRevision(noteId: string, revision: string): void {
  if (!noteId || !revision) return;
  ownNoteWriteRevisions.set(noteId, revision);
}

export function peekOwnNoteWriteRevision(noteId: string): string | null {
  return ownNoteWriteRevisions.get(noteId) ?? null;
}

export function clearOwnNoteWriteRevision(noteId: string): void {
  ownNoteWriteRevisions.delete(noteId);
}

export function preserveNoteServerRevision(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseApplyInternalNoteWriteResult(raw: unknown): ApplyInternalNoteWriteResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "invalid_response" };
  }
  const row = raw as Record<string, unknown>;
  if (row.ok === true) {
    const note = row.note;
    if (!note || typeof note !== "object" || Array.isArray(note)) {
      return { ok: false, error: "missing_note" };
    }
    const updatedAt = preserveNoteServerRevision((note as Record<string, unknown>).updated_at);
    if (!updatedAt) {
      return { ok: false, error: "missing_version" };
    }
    (note as Record<string, unknown>).updated_at = updatedAt;
    return {
      ok: true,
      note: note as Record<string, Json | string | boolean | null>,
      noop: row.noop === true,
    };
  }
  return {
    ok: false,
    error: typeof row.error === "string" && row.error ? row.error : "apply_internal_note_update_failed",
  };
}

export function stripNoteServerOwnedKeys(patch: Record<string, unknown>): Record<string, Json> {
  const next: Record<string, Json> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (NOTE_SERVER_OWNED_KEYS.has(key) || value === undefined) continue;
    if (!NOTE_PATCH_KEYS.has(key)) continue;
    next[key] = value as Json;
  }
  return next;
}

export function pickNoteWriteExpectedAt(
  editorApplied: string | null | undefined,
  storeLive: string | null | undefined,
  ownWriteRevision?: string | null,
): string | null {
  if (ownWriteRevision && storeLive && isSameRevision(ownWriteRevision, storeLive)) {
    return storeLive;
  }
  if (editorApplied) return editorApplied;
  return storeLive ?? null;
}

export type UnknownNoteWriteDecision = "adopt-own" | "keep-failed" | "conflict" | "ignore";

const LIVE_NOTE_DB_FIELDS = [
  "title",
  "file_name",
  "question_or_note",
  "question_or_note_blocks",
  "source_text",
  "translated_text",
  "id_row_count",
  "related_case",
  "comments",
] as const;

export function sentNoteSnapshotFromDbPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch).sort()) {
    const value = patch[key];
    out[key] = key === "question_or_note_blocks" ? serializeBlocksForCompare(value) : value ?? null;
  }
  return out;
}

export function liveNoteSnapshotFromDbKeys(
  dbKeys: string[],
  live: {
    title?: unknown;
    fileName?: unknown;
    questionOrNote?: unknown;
    questionOrNoteBlocks?: unknown;
    sourceText?: unknown;
    translatedText?: unknown;
    idRowCount?: unknown;
    relatedCase?: unknown;
    comments?: unknown;
  } | null | undefined,
): Record<string, unknown> {
  const fromLive: Record<string, unknown> = {
    title: live?.title ?? null,
    file_name: live?.fileName ?? null,
    question_or_note: live?.questionOrNote ?? null,
    question_or_note_blocks: live?.questionOrNoteBlocks ?? null,
    source_text: live?.sourceText ?? null,
    translated_text: live?.translatedText ?? null,
    id_row_count: live?.idRowCount ?? null,
    related_case: live?.relatedCase ?? null,
    comments: live?.comments ?? null,
  };
  const out: Record<string, unknown> = {};
  for (const key of [...dbKeys].sort()) {
    if (!(LIVE_NOTE_DB_FIELDS as readonly string[]).includes(key)) continue;
    const value = fromLive[key];
    out[key] = key === "question_or_note_blocks" ? serializeBlocksForCompare(value) : value ?? null;
  }
  return out;
}

export function overlapNoteSnapshots(
  sent: Record<string, unknown>,
  live: Record<string, unknown>,
): { sentSerialized: string; liveSerialized: string; keyCount: number } {
  const keys = Object.keys(sent).filter((key) => key in live).sort();
  const pick = (src: Record<string, unknown>) => {
    const next: Record<string, unknown> = {};
    for (const key of keys) next[key] = src[key];
    return JSON.stringify(next);
  };
  return {
    sentSerialized: pick(sent),
    liveSerialized: pick(live),
    keyCount: keys.length,
  };
}

const NOTE_WRITE_REJECTED_ERRORS = new Set([
  "stale_updated_at",
  "not_authorized",
  "note_unavailable",
  "invalid_updated_at",
]);

export function isExplicitNoteWriteRejection(errorCode: string | null | undefined): boolean {
  return Boolean(errorCode && NOTE_WRITE_REJECTED_ERRORS.has(errorCode));
}

/** 回覆遺失／寫入失敗後，用「這次送出的檔與快照」對帳，不拿新版號重送舊全文。 */
export function decideUnknownNoteWrite(input: {
  sentNoteId: string;
  liveNoteId: string | null | undefined;
  sentExpectedRevision: string;
  liveRevision: string | null | undefined;
  sentSnapshotSerialized: string;
  liveSnapshotSerialized: string;
  comparableKeyCount: number;
  writeRejected?: boolean;
}): UnknownNoteWriteDecision {
  if (!input.liveNoteId || input.liveNoteId !== input.sentNoteId) return "ignore";
  if (isSameRevision(input.liveRevision, input.sentExpectedRevision)) {
    return "keep-failed";
  }
  if (input.writeRejected) {
    return "conflict";
  }
  if (input.comparableKeyCount === 0) {
    return "conflict";
  }
  if (input.sentSnapshotSerialized === input.liveSnapshotSerialized) {
    return "adopt-own";
  }
  return "conflict";
}

export function isStaleNoteWrite(error: { message?: string; error?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.error ?? ""} ${error.message ?? ""}`;
  return text.includes("stale_updated_at") || text.includes("較新版本");
}

export function describeNoteWriteFailure(
  error: { message?: string; error?: string } | null | undefined,
): string {
  if (!error) return "儲存結果不明，尚未確認已寫入。";
  if (isStaleNoteWrite(error)) {
    return "這則註記已有較新版本，尚未覆寫你正在編輯的內容。";
  }
  const text = error.message || error.error || "";
  if (text.includes("not_authorized")) return "沒有權限儲存這則註記。";
  if (text.includes("note_unavailable")) return "找不到這則註記，或目前環境看不到。";
  if (
    text.includes("missing_note")
    || text.includes("missing_version")
    || text.includes("invalid_response")
  ) {
    return "儲存結果不明，尚未確認已寫入。";
  }
  return "儲存未完成，請稍後再試。內容仍留在畫面。";
}
