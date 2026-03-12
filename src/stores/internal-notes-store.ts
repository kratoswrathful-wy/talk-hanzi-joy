/**
 * Internal Notes store with DB persistence via Lovable Cloud.
 */
import type { InternalNote } from "@/hooks/use-internal-notes-table-views";
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";

type Listener = () => void;

let notes: InternalNote[] = [];
let loaded = false;
let loadSeq = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

// ── DB ↔ App mapping ──

function dbToApp(row: any): InternalNote {
  return {
    id: row.id,
    title: row.title ?? "",
    relatedCase: row.related_case ?? "",
    createdAt: row.created_at,
    creator: row.creator ?? "",
    status: row.status ?? "",
    noteType: row.note_type ?? "",
    internalAssignee: Array.isArray(row.internal_assignee) ? row.internal_assignee : [],
    fileName: row.file_name ?? "",
    idRowCount: row.id_row_count ?? "",
    sourceText: row.source_text ?? "",
    translatedText: row.translated_text ?? "",
    questionOrNote: row.question_or_note ?? "",
    questionOrNoteBlocks: Array.isArray(row.question_or_note_blocks) ? row.question_or_note_blocks : [],
    referenceFiles: Array.isArray(row.reference_files) ? row.reference_files : [],
    comments: Array.isArray(row.comments) ? row.comments : [],
    invalidated: row.invalidated ?? false,
    invalidatedBy: row.invalidated_by ?? undefined,
    invalidatedAt: row.invalidated_at ?? undefined,
    invalidationReason: row.invalidation_reason ?? undefined,
  };
}

function appToDb(note: Partial<InternalNote>): Record<string, any> {
  const m: Record<string, any> = {};
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
  if (note.comments !== undefined) m.comments = note.comments;
  if (note.invalidated !== undefined) m.invalidated = note.invalidated;
  if (note.invalidatedBy !== undefined) m.invalidated_by = note.invalidatedBy;
  if (note.invalidatedAt !== undefined) m.invalidated_at = note.invalidatedAt;
  if (note.invalidationReason !== undefined) m.invalidation_reason = note.invalidationReason;
  return m;
}

// ── Realtime ──
supabase
  .channel("internal-notes-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "internal_notes" },
    (payload) => {
      const env = getEnvironment();
      if (payload.eventType === "UPDATE" && payload.new) {
        const row = payload.new as any;
        if (row.env !== env) return;
        const updated = dbToApp(row);
        notes = notes.map((n) => (n.id === updated.id ? updated : n));
        notify();
      } else if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as any;
        if (row.env !== env) return;
        if (!notes.some((n) => n.id === row.id)) {
          notes = [dbToApp(row), ...notes];
          notify();
        }
      } else if (payload.eventType === "DELETE" && payload.old) {
        const oldId = (payload.old as any).id;
        if (notes.some((n) => n.id === oldId)) {
          notes = notes.filter((n) => n.id !== oldId);
          notify();
        }
      }
    }
  )
  .subscribe();

// Polling fallback
const notePoll = createPollFallback("internal_notes", () => {
  if (loaded) internalNotesStore.load();
}, 3000);

// Auth change – reload
supabase.auth.onAuthStateChange(() => {
  loaded = false;
  notify();
});

export const internalNotesStore = {
  getAll: (): InternalNote[] => notes,
  isLoaded: () => loaded,

  load: async () => {
    const seq = ++loadSeq;
    const { data, error } = await supabase
      .from("internal_notes")
      .select("*")
      .eq("env", getEnvironment())
      .order("created_at", { ascending: false });
    if (seq !== loadSeq) return;
    if (!error && data) {
      notes = (data as any[]).map(dbToApp);
      loaded = true;
      notify();
    }
  },

  add: async (note: InternalNote) => {
    notes = [note, ...notes];
    notify();
    const { error } = await supabase
      .from("internal_notes")
      .insert({
        id: note.id,
        ...appToDb(note),
        created_at: note.createdAt,
        env: getEnvironment(),
      } as any);
    if (error) console.error("Failed to insert internal note:", error);
    return note;
  },

  update: (id: string, updates: Partial<InternalNote>) => {
    notes = notes.map((n) => (n.id === id ? { ...n, ...updates } : n));
    notify();
    const dbUpdates = appToDb(updates);
    if (Object.keys(dbUpdates).length === 0) return;
    supabase
      .from("internal_notes")
      .update({ ...dbUpdates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.error("Failed to update internal note:", error);
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

export function useInternalNotes(): InternalNote[] {
  return useSyncExternalStore(internalNotesStore.subscribe, internalNotesStore.getSnapshot);
}
