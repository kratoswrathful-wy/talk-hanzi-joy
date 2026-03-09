import { useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";

/**
 * Page Template Store
 * Manages per-module page templates (pre-fill content for new pages).
 * Each module has a built-in "預設" (default) template + user-created ones.
 */

export type PageModule = "cases" | "internalNotes" | "fees" | "invoices" | "clientInvoices";

export const PAGE_MODULE_LABELS: Record<PageModule, string> = {
  cases: "案件",
  internalNotes: "註記",
  fees: "記帳",
  invoices: "稿費",
  clientInvoices: "請款",
};

export const PAGE_MODULES: PageModule[] = [
  "cases", "internalNotes", "fees", "invoices", "clientInvoices",
];

export interface PageTemplate {
  id: string;
  name: string;
  module: PageModule;
  isDefault: boolean;
  /** Arbitrary key-value pairs representing pre-filled field values */
  fieldValues: Record<string, any>;
}

type Listener = () => void;

const SETTINGS_KEY = "page_templates";

// Initialize with default templates for each module
function createDefaults(): PageTemplate[] {
  return PAGE_MODULES.map((mod) => ({
    id: `default-${mod}`,
    name: "預設",
    module: mod,
    isDefault: true,
    fieldValues: {},
  }));
}

let templates: PageTemplate[] = createDefaults();
let snapshot = templates;
const listeners = new Set<Listener>();

function notify() {
  snapshot = [...templates];
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, templates);
}

export const pageTemplateStore = {
  getAll: (): PageTemplate[] => snapshot,

  getByModule: (mod: PageModule): PageTemplate[] =>
    snapshot.filter((t) => t.module === mod),

  getDefault: (mod: PageModule): PageTemplate | undefined =>
    snapshot.find((t) => t.module === mod && t.isDefault),

  getById: (id: string): PageTemplate | undefined =>
    snapshot.find((t) => t.id === id),

  add: (mod: PageModule, name: string): string => {
    const id = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    templates = [...templates, { id, name, module: mod, isDefault: false, fieldValues: {} }];
    notify();
    return id;
  },

  update: (id: string, updates: Partial<Omit<PageTemplate, "id" | "module" | "isDefault">>) => {
    templates = templates.map((t) => (t.id === id ? { ...t, ...updates } : t));
    notify();
  },

  remove: (id: string) => {
    // Cannot remove default templates
    const tpl = templates.find((t) => t.id === id);
    if (tpl?.isDefault) return;
    templates = templates.filter((t) => t.id !== id);
    notify();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => snapshot,

  loadSettings: async () => {
    const saved = await loadSetting<PageTemplate[]>(SETTINGS_KEY);
    if (saved && Array.isArray(saved)) {
      // Ensure all default templates exist
      const defaults = createDefaults();
      const savedIds = new Set(saved.map((t) => t.id));
      const missing = defaults.filter((d) => !savedIds.has(d.id));
      templates = [...missing, ...saved];
      snapshot = [...templates];
      listeners.forEach((l) => l());
    }
  },
};

export function usePageTemplates(mod?: PageModule) {
  useSyncExternalStore(pageTemplateStore.subscribe, pageTemplateStore.getSnapshot);
  if (mod) return pageTemplateStore.getByModule(mod);
  return pageTemplateStore.getAll();
}
