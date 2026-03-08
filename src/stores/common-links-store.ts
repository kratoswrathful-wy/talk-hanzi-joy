import { useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";

export interface CommonLink {
  id: string;
  name: string;
  url: string;
}

type Listener = () => void;

const SETTINGS_KEY = "common_links";

let links: CommonLink[] = [];
let snapshot = links;
const listeners = new Set<Listener>();

function notify() {
  snapshot = [...links];
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, links);
}

export const commonLinksStore = {
  getAll: (): CommonLink[] => snapshot,

  add: (name: string, url: string): string => {
    const id = `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    links = [...links, { id, name, url }];
    notify();
    return id;
  },

  update: (id: string, updates: Partial<Omit<CommonLink, "id">>) => {
    links = links.map((l) => (l.id === id ? { ...l, ...updates } : l));
    notify();
  },

  remove: (id: string) => {
    links = links.filter((l) => l.id !== id);
    notify();
  },

  reorder: (orderedIds: string[]) => {
    const ordered = orderedIds.map((id) => links.find((l) => l.id === id)).filter(Boolean) as CommonLink[];
    const remaining = links.filter((l) => !orderedIds.includes(l.id));
    links = [...ordered, ...remaining];
    notify();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => snapshot,

  loadSettings: async () => {
    const saved = await loadSetting<CommonLink[]>(SETTINGS_KEY);
    if (saved && Array.isArray(saved)) {
      links = saved;
      snapshot = [...links];
      listeners.forEach((l) => l());
    }
  },
};

export function useCommonLinks() {
  useSyncExternalStore(commonLinksStore.subscribe, commonLinksStore.getSnapshot);
  return commonLinksStore.getAll();
}
