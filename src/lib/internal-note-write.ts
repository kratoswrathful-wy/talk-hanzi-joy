import type { Json } from "@/integrations/supabase/types";

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
): string | null {
  if (editorApplied) return editorApplied;
  return storeLive ?? null;
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
