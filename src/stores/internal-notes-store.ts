/**
 * Shared in-memory store for Internal Notes so they can be created from CaseDetailPage
 * and displayed/edited in InternalNotesPage.
 */
import type { InternalNote } from "@/hooks/use-internal-notes-table-views";
import { useSyncExternalStore } from "react";

type Listener = () => void;

let notes: InternalNote[] = [];
let snapshot = notes;
const listeners = new Set<Listener>();

function notify() {
  snapshot = [...notes];
  listeners.forEach((l) => l());
}

export const internalNotesStore = {
  getAll: (): InternalNote[] => snapshot,

  add: (note: InternalNote) => {
    notes = [note, ...notes];
    notify();
    return note;
  },

  update: (id: string, updates: Partial<InternalNote>) => {
    notes = notes.map((n) => (n.id === id ? { ...n, ...updates } : n));
    notify();
  },

  remove: (id: string) => {
    notes = notes.filter((n) => n.id !== id);
    notify();
  },

  removeMany: (ids: Set<string>) => {
    notes = notes.filter((n) => !ids.has(n.id));
    notify();
  },

  getById: (id: string): InternalNote | undefined => notes.find((n) => n.id === id),

  /** Find all notes whose title starts with prefix */
  findByTitlePrefix: (prefix: string): InternalNote[] =>
    notes.filter((n) => n.title.startsWith(prefix)),

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => snapshot,
};

export function useInternalNotes(): InternalNote[] {
  return useSyncExternalStore(internalNotesStore.subscribe, internalNotesStore.getSnapshot);
}
