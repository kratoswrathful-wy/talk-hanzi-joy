/**
 * Internal Notes store with DB persistence via Lovable Cloud.
 */
import type { InternalNote, NoteComment } from "@/hooks/use-internal-notes-table-views";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback, latestTimestamp } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import { createKeyedQueue } from "@/lib/case-write-queue";
import {
  describeNoteWriteFailure,
  parseApplyInternalNoteWriteResult,
  pickNoteWriteExpectedAt,
  stripNoteServerOwnedKeys,
} from "@/lib/internal-note-write";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";

const noteWriteQueue = createKeyedQueue();

type Listener = () => void;

let notes: InternalNote[] = [];
let loaded = false;
let loadSeq = 0;
let loadPromise: Promise<void> | null = null;
let reloadRequested = false;
let authUserId: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

// ── DB ↔ App mapping ──

function commentsFromJson(raw: Json | null | undefined): NoteComment[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteComment[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string") continue;
    const imageUrls = Array.isArray(o.imageUrls) ? o.imageUrls.filter((u): u is string => typeof u === "string") : undefined;
    const fileUrls = Array.isArray(o.fileUrls)
      ? o.fileUrls.reduce<{ name: string; url: string }[]>((acc, f) => {
          if (f && typeof f === "object" && !Array.isArray(f) && typeof (f as Record<string, Json>).name === "string" && typeof (f as Record<string, Json>).url === "string") {
            acc.push({ name: (f as Record<string, Json>).name as string, url: (f as Record<string, Json>).url as string });
          }
          return acc;
        }, [])
      : undefined;
    out.push({
      id: o.id,
      author: typeof o.author === "string" ? o.author : "",
      content: typeof o.content === "string" ? o.content : "",
      ...(imageUrls?.length ? { imageUrls } : {}),
      ...(fileUrls?.length ? { fileUrls } : {}),
      ...(typeof o.replyTo === "string" ? { replyTo: o.replyTo } : {}),
      createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    });
  }
  return out;
}

function commentsToJson(comments: NoteComment[]): Json {
  return comments.map((c) => ({
    id: c.id,
    author: c.author,
    content: c.content,
    ...(c.imageUrls ? { imageUrls: c.imageUrls } : {}),
    ...(c.fileUrls ? { fileUrls: c.fileUrls.map((f) => ({ name: f.name, url: f.url })) } : {}),
    ...(c.replyTo !== undefined ? { replyTo: c.replyTo } : {}),
    createdAt: c.createdAt,
  }));
}

function isInternalNoteRow(raw: unknown): raw is Tables<"internal_notes"> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const row = raw as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.updated_at === "string";
}

function dbToApp(row: Tables<"internal_notes">): InternalNote {
  return {
    id: row.id,
    title: row.title ?? "",
    relatedCase: row.related_case ?? "",
    createdAt: row.created_at,
    creator: row.creator ?? "",
    status: row.status ?? "",
    noteType: row.note_type ?? "",
    internalAssignee: Array.isArray(row.internal_assignee) ? (row.internal_assignee as string[]) : [],
    fileName: row.file_name ?? "",
    idRowCount: row.id_row_count ?? "",
    sourceText: row.source_text ?? "",
    translatedText: row.translated_text ?? "",
    questionOrNote: row.question_or_note ?? "",
    questionOrNoteBlocks: Array.isArray(row.question_or_note_blocks)
      ? (row.question_or_note_blocks as InternalNote["questionOrNoteBlocks"])
      : [],
    updatedAt: row.updated_at,
    referenceFiles: Array.isArray(row.reference_files)
      ? (row.reference_files as InternalNote["referenceFiles"])
      : [],
    comments: commentsFromJson(row.comments),
    invalidated: row.invalidated ?? false,
    invalidatedBy: row.invalidated_by ?? undefined,
    invalidatedAt: row.invalidated_at ?? undefined,
    invalidationReason: row.invalidation_reason ?? undefined,
    editLogs: Array.isArray(row.edit_logs) ? (row.edit_logs as SimplePersistedLog[]) : undefined,
    editLogStartedAt: row.edit_log_started_at ?? undefined,
    consultationSlackRecords: Array.isArray(row.consultation_slack_records)
      ? (row.consultation_slack_records as string[])
      : [],
  };
}

function appToDb(note: Partial<InternalNote>): Record<string, Json> {
  const m: Record<string, Json> = {};
  if (note.title !== undefined) m.title = note.title;
  if (note.relatedCase !== undefined) m.related_case = note.relatedCase;
  if (note.creator !== undefined) m.creator = note.creator;
  if (note.status !== undefined) m.status = note.status;
  if (note.noteType !== undefined) m.note_type = note.noteType;
  if (note.internalAssignee !== undefined) m.internal_assignee = note.internalAssignee;
  if (note.fileName !== undefined) m.file_name = note.fileName;
  if (note.idRowCount !== undefined) m.id_row_count = note.idRowCount;
  if (note.sourceText !== undefined) m.source_text = note.sourceText;
  if (note.translatedText !== undefined) m.translated_text = note.translatedText;
  if (note.questionOrNote !== undefined) m.question_or_note = note.questionOrNote;
  if (note.questionOrNoteBlocks !== undefined) m.question_or_note_blocks = note.questionOrNoteBlocks;
  if (note.referenceFiles !== undefined) m.reference_files = note.referenceFiles;
  if (note.comments !== undefined) m.comments = commentsToJson(note.comments);
  if (note.invalidated !== undefined) m.invalidated = note.invalidated;
  if (note.invalidatedBy !== undefined) m.invalidated_by = note.invalidatedBy;
  if (note.invalidatedAt !== undefined) m.invalidated_at = note.invalidatedAt;
  if (note.invalidationReason !== undefined) m.invalidation_reason = note.invalidationReason;
  if (note.editLogs !== undefined) m.edit_logs = note.editLogs;
  if (note.editLogStartedAt !== undefined) m.edit_log_started_at = note.editLogStartedAt;
  if (note.consultationSlackRecords !== undefined)
    m.consultation_slack_records = note.consultationSlackRecords;
  return m;
}

// ── Realtime：只當信號，完整列改由 refreshOne 讀回，避免 payload 缺欄或 env 缺失被丟掉 ──
let notesRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function noteIdFromRealtimePayload(payload: {
  new?: unknown;
  old?: unknown;
}): string | null {
  const incoming = payload.new as { id?: unknown; env?: unknown } | undefined;
  const previous = payload.old as { id?: unknown } | undefined;
  if (typeof incoming?.id === "string") return incoming.id;
  if (typeof previous?.id === "string") return previous.id;
  return null;
}

function subscribeNotesRealtime() {
  if (notesRealtimeChannel) {
    void supabase.removeChannel(notesRealtimeChannel);
    notesRealtimeChannel = null;
  }
  notesRealtimeChannel = supabase
    .channel("internal-notes-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "internal_notes" },
      (payload) => {
        const env = getEnvironment();
        const incomingEnv = (payload.new as { env?: unknown } | undefined)?.env;
        if (typeof incomingEnv === "string" && incomingEnv !== env) return;
        if (payload.eventType === "DELETE") {
          const oldId = (payload.old as Partial<Tables<"internal_notes">> | undefined)?.id;
          if (oldId && notes.some((n) => n.id === oldId)) {
            notes = notes.filter((n) => n.id !== oldId);
            notify();
          }
          return;
        }
        const id = noteIdFromRealtimePayload(payload);
        if (!id) return;
        void internalNotesStore.refreshOne(id);
      },
    )
    .subscribe();
}

subscribeNotesRealtime();

// Polling fallback
const notePoll = createPollFallback("internal_notes", () => {
  if (loaded) internalNotesStore.load();
}, 15000, () => latestTimestamp(notes.map((n) => n.updatedAt)));

export const internalNotesStore = {
  getAll: (): InternalNote[] => notes,
  isLoaded: () => loaded,

  /** Initial consumers share the current request without scheduling a trailing refresh. */
  ensureLoaded: async () => {
    if (loaded) return;
    if (loadPromise) return loadPromise;
    return internalNotesStore.load();
  },

  load: async () => {
    if (loadPromise) {
      reloadRequested = true;
      return loadPromise;
    }

    loadPromise = (async () => {
      try {
        do {
          reloadRequested = false;
          const seq = ++loadSeq;
          const user = await getAuthenticatedUser();
          if (seq !== loadSeq) continue;
          if (!user) {
            notes = [];
            loaded = false;
            notify();
            continue;
          }

          const { data, error } = await supabase
            .from("internal_notes")
            .select("*")
            .eq("env", getEnvironment())
            .order("created_at", { ascending: false });
          if (seq !== loadSeq) continue;
          if (!error && data) {
            notes = data.map(dbToApp);
            loaded = true;
            notify();
          }
        } while (reloadRequested);
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  },

  add: async (note: InternalNote) => {
    notes = [note, ...notes];
    notify();
    const { data, error } = await supabase
      .from("internal_notes")
      .insert({
        id: note.id,
        ...appToDb(note),
        created_at: note.createdAt,
        env: getEnvironment(),
      } as TablesInsert<"internal_notes">)
      .select("*")
      .single();
    if (error) {
      console.error("Failed to insert internal note:", error);
      return note;
    }
    if (data) {
      const saved = dbToApp(data);
      notes = notes.map((n) => (n.id === saved.id ? saved : n));
      notify();
      return saved;
    }
    return note;
  },

  refreshOne: async (id: string): Promise<InternalNote | undefined> => {
    const { data, error } = await supabase
      .from("internal_notes")
      .select("*")
      .eq("id", id)
      .eq("env", getEnvironment())
      .maybeSingle();
    if (error || !data) return internalNotesStore.getById(id);
    const mapped = dbToApp(data);
    notes = notes.map((n) => (n.id === id ? mapped : n));
    if (!notes.some((n) => n.id === id)) notes = [mapped, ...notes];
    notify();
    return mapped;
  },

  update: async (
    id: string,
    updates: Partial<InternalNote>,
    expectedUpdatedAt?: string | null,
  ): Promise<Error | null> => {
    return noteWriteQueue.enqueue(id, async () => {
      const dbUpdates = stripNoteServerOwnedKeys(appToDb(updates));
      if (Object.keys(dbUpdates).length === 0) return null;
      const live = internalNotesStore.getById(id);
      const expected = pickNoteWriteExpectedAt(expectedUpdatedAt, live?.updatedAt);
      if (!expected) {
        return new Error("invalid_updated_at");
      }
      const { data, error } = await supabase.rpc("apply_internal_note_update", {
        p_note_id: id,
        p_patch: dbUpdates,
        p_expected_updated_at: expected,
      });
      const parsed = parseApplyInternalNoteWriteResult(data);
      if (error || !parsed.ok || !isInternalNoteRow(parsed.note)) {
        const fail = error ?? new Error(parsed.error || "apply_internal_note_update_failed");
        await internalNotesStore.refreshOne(id);
        console.error("Failed to update internal note:", fail);
        return new Error(describeNoteWriteFailure(parsed.error ? parsed : fail));
      }
      const mapped = dbToApp(parsed.note);
      notes = notes.map((n) => (n.id === id ? mapped : n));
      notify();
      return null;
    });
  },

  remove: (id: string) => {
    notes = notes.filter((n) => n.id !== id);
    notify();
    supabase
      .from("internal_notes")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.error("Failed to delete internal note:", error);
      });
  },

  removeMany: (ids: Set<string>) => {
    notes = notes.filter((n) => !ids.has(n.id));
    notify();
    supabase
      .from("internal_notes")
      .delete()
      .in("id", Array.from(ids))
      .then(({ error }) => {
        if (error) console.error("Failed to bulk delete internal notes:", error);
      });
  },

  getById: (id: string): InternalNote | undefined => notes.find((n) => n.id === id),

  findByTitlePrefix: (prefix: string): InternalNote[] =>
    notes.filter((n) => n.title.startsWith(prefix)),

  findByCase: (caseTitle: string): InternalNote[] =>
    notes.filter((n) => n.relatedCase === caseTitle),

  retargetRelatedCase: async (fromTitle: string, toTitle: string) => {
    if (!fromTitle || !toTitle || fromTitle === toTitle) return;
    const targets = notes.filter((n) => n.relatedCase === fromTitle);
    for (const note of targets) {
      await internalNotesStore.update(note.id, { relatedCase: toTitle });
    }
  },

  watchOpenNote: (id: string, intervalMs = 3000): (() => void) => {
    if (!id) return () => undefined;
    const refresh = () => {
      void internalNotesStore.refreshOne(id);
    };
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  },

  getMaxSeqForPrefix: (prefix: string): number => {
    let max = 0;
    for (const n of notes) {
      if (n.title.startsWith(prefix)) {
        const suffix = n.title.slice(prefix.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
    return max;
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    if (listeners.size === 1) notePoll.start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) notePoll.stop();
    };
  },

  getSnapshot: () => notes,
};

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED") {
    return;
  }

  if (event === "SIGNED_OUT" || !session) {
    loadSeq += 1;
    reloadRequested = false;
    authUserId = null;
    notes = [];
    loaded = false;
    notify();
    return;
  }

  const nextUserId = session.user.id;
  if (
    (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
    authUserId === nextUserId
  ) {
    return;
  }

  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    loadSeq += 1;
    if (loadPromise) reloadRequested = true;
    authUserId = nextUserId;
    loaded = false;
    subscribeNotesRealtime();
    notify();
  }
});

export function useInternalNotes(): InternalNote[] {
  return useSyncExternalStore(internalNotesStore.subscribe, internalNotesStore.getSnapshot);
}
