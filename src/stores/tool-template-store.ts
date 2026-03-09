import { useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";

export interface TemplateField {
  id: string;
  label: string;
  type?: "text" | "file";
}

export interface ToolTemplate {
  id: string;
  name: string;
  tool: string; // tool label (e.g. "memoQ")
  fields: TemplateField[]; // custom field list (can differ from tool's defaults)
  fieldValues: Record<string, string>; // field.id → value
}

type Listener = () => void;

const SETTINGS_KEY = "tool_templates";

let templates: ToolTemplate[] = [];
let snapshot = templates;
const listeners = new Set<Listener>();

function notify() {
  snapshot = [...templates];
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, templates);
}

export const toolTemplateStore = {
  getAll: (): ToolTemplate[] => [...snapshot].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })),

  add: (tpl: Omit<ToolTemplate, "id">): string => {
    const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newTpl = { ...tpl, id, fields: tpl.fields || [] };
    templates = [...templates, newTpl];
    notify();
    return id;
  },

  update: (id: string, updates: Partial<Omit<ToolTemplate, "id">>) => {
    templates = templates.map((t) => (t.id === id ? { ...t, ...updates } : t));
    notify();
  },

  remove: (id: string) => {
    templates = templates.filter((t) => t.id !== id);
    notify();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => snapshot,

  loadSettings: async () => {
    const saved = await loadSetting<ToolTemplate[]>(SETTINGS_KEY);
    if (saved && Array.isArray(saved)) {
      templates = saved;
      snapshot = [...templates];
      listeners.forEach((l) => l());
    }
  },
};

export function useToolTemplates() {
  useSyncExternalStore(toolTemplateStore.subscribe, toolTemplateStore.getSnapshot);
  return toolTemplateStore.getAll();
}
