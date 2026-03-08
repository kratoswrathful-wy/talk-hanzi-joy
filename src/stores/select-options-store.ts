import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";

export interface SelectOption {
  id: string;
  label: string;
  email?: string;
  color: string;
  note?: string;
  avatarUrl?: string | null;
  timezone?: string | null;
  statusMessage?: string | null;
}

export const PRESET_COLORS = [
  "#B91C1C", // red
  "#C2410C", // orange
  "#B45309", // amber
  "#A16207", // yellow
  "#4D7C0F", // lime
  "#15803D", // green
  "#003CC0", // blue
  "#3730A3", // indigo
  "#5B21B6", // violet
  "#BE185D", // pink
  "#6B7280", // dark gray
  "#383A3F", // charcoal
];

/** Default color used for new "contact" field options */
export const CONTACT_DEFAULT_COLOR = "#383A3F";

// Sort: English alphabetical, Chinese by stroke count
function sortOptions(options: SelectOption[]): SelectOption[] {
  return [...options].sort((a, b) =>
    a.label.localeCompare(b.label, "zh-Hant-TW-u-co-stroke")
  );
}

type Listener = () => void;

interface FieldOptions {
  options: SelectOption[];
  customColors: string[]; // user-added custom colors
  manualOrder?: boolean; // if true, skip auto-sort
}

let store: Record<string, FieldOptions> = {};
const listeners = new Set<Listener>();

const SETTINGS_KEY = "select_options";

// Fields to persist (assignee is loaded from profiles, not settings)
const PERSISTED_FIELDS = ["taskType", "billingUnit", "client", "contact", "dispatchRoute"];

function persistableSnapshot() {
  const snapshot: Record<string, FieldOptions> = {};
  for (const key of PERSISTED_FIELDS) {
    if (store[key]) snapshot[key] = store[key];
  }
  return snapshot;
}

function notify() {
  listeners.forEach((l) => l());
  // Mark as user-mutated then save
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, persistableSnapshot());
}

// Initialize default options for known fields
function initDefaults() {
  store = {
    assignee: {
      options: [],
      customColors: [],
    },
    taskType: {
      options: [
        { id: "opt-t1", label: "翻譯", color: PRESET_COLORS[9] },
        { id: "opt-t2", label: "校對", color: PRESET_COLORS[4] },
        { id: "opt-t3", label: "MTPE", color: PRESET_COLORS[6] },
        { id: "opt-t4", label: "LQA", color: PRESET_COLORS[11] },
      ],
      customColors: [],
      manualOrder: true,
    },
    billingUnit: {
      options: [
        { id: "opt-b1", label: "字", color: PRESET_COLORS[8] },
        { id: "opt-b2", label: "小時", color: PRESET_COLORS[1] },
      ],
      customColors: [],
      manualOrder: true,
    },
    client: {
      options: [
        { id: "opt-c1", label: "CCJK", color: PRESET_COLORS[9] },
      ],
      customColors: [],
    },
    contact: {
      options: [],
      customColors: [],
    },
    dispatchRoute: {
      options: [
        { id: "opt-dr1", label: "V 信箱", color: PRESET_COLORS[6] },
        { id: "opt-dr2", label: "Teams", color: PRESET_COLORS[8] },
      ],
      customColors: [],
    },
  };
}

initDefaults();

export const selectOptionsStore = {
  getField: (fieldKey: string): FieldOptions => {
    if (!store[fieldKey]) {
      store[fieldKey] = { options: [], customColors: [] };
    }
    return store[fieldKey];
  },

  getSortedOptions: (fieldKey: string): SelectOption[] => {
    const field = selectOptionsStore.getField(fieldKey);
    if (field.manualOrder) return [...field.options];
    return sortOptions(field.options);
  },

  addOption: (fieldKey: string, label: string, color: string) => {
    const field = selectOptionsStore.getField(fieldKey);
    const id = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    field.options.push({ id, label, color });
    store = { ...store, [fieldKey]: { ...field, options: [...field.options] } };
    notify();
    return id;
  },

  deleteOption: (fieldKey: string, optionId: string) => {
    const field = selectOptionsStore.getField(fieldKey);
    store = {
      ...store,
      [fieldKey]: { ...field, options: field.options.filter((o) => o.id !== optionId) },
    };
    notify();
  },

  renameOption: (fieldKey: string, optionId: string, newLabel: string) => {
    const field = selectOptionsStore.getField(fieldKey);
    store = {
      ...store,
      [fieldKey]: {
        ...field,
        options: field.options.map((o) => (o.id === optionId ? { ...o, label: newLabel } : o)),
      },
    };
    notify();
  },

  updateOptionColor: (fieldKey: string, optionId: string, color: string) => {
    const field = selectOptionsStore.getField(fieldKey);
    store = {
      ...store,
      [fieldKey]: {
        ...field,
        options: field.options.map((o) => (o.id === optionId ? { ...o, color } : o)),
      },
    };
    notify();
  },

  updateOptionNote: (fieldKey: string, optionId: string, note: string) => {
    const field = selectOptionsStore.getField(fieldKey);
    store = {
      ...store,
      [fieldKey]: {
        ...field,
        options: field.options.map((o) => (o.id === optionId ? { ...o, note } : o)),
      },
    };
    notify();
  },

  reorderOptions: (fieldKey: string, orderedIds: string[]) => {
    const field = selectOptionsStore.getField(fieldKey);
    const ordered = orderedIds
      .map((id) => field.options.find((o) => o.id === id))
      .filter(Boolean) as SelectOption[];
    // Add any options not in orderedIds at the end
    const remaining = field.options.filter((o) => !orderedIds.includes(o.id));
    store = {
      ...store,
      [fieldKey]: { ...field, options: [...ordered, ...remaining], manualOrder: true },
    };
    notify();
  },

  addCustomColor: (fieldKey: string, color: string) => {
    const field = selectOptionsStore.getField(fieldKey);
    if (!field.customColors.includes(color)) {
      store = {
        ...store,
        [fieldKey]: { ...field, customColors: [...field.customColors, color] },
      };
      notify();
    }
  },

  removeCustomColor: (fieldKey: string, color: string) => {
    const field = selectOptionsStore.getField(fieldKey);
    store = {
      ...store,
      [fieldKey]: { ...field, customColors: field.customColors.filter((c) => c !== color) },
    };
    notify();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => store,

  /** Load assignee options from profiles + invitations in DB, respecting sort_order and frozen */
  loadAssignees: async () => {
    const [{ data: profiles }, { data: invitations }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("email, display_name, avatar_url, timezone, status_message"),
      supabase.from("invitations").select("email, role").is("accepted_at", null),
      supabase.from("member_translator_settings").select("email, note, no_fee, sort_order, frozen"),
    ]);

    const settingsMap = new Map<string, { note: string; no_fee: boolean; sort_order: number; frozen: boolean }>();
    (settings || []).forEach((s: any) => settingsMap.set(s.email, { note: s.note || "", no_fee: s.no_fee || false, sort_order: s.sort_order ?? 0, frozen: s.frozen || false }));

    const options: SelectOption[] = [];
    const registeredEmails = new Set<string>();

    // Registered members (exclude frozen)
    (profiles || []).forEach((p: any, i: number) => {
      registeredEmails.add(p.email);
      const s = settingsMap.get(p.email);
      if (s?.frozen) return;
      options.push({
        id: `assignee-${p.email}`,
        label: p.display_name || p.email,
        email: p.email,
        color: PRESET_COLORS[i % PRESET_COLORS.length],
        note: s?.note || "",
        avatarUrl: p.avatar_url || null,
        timezone: p.timezone || null,
        statusMessage: p.status_message || null,
      });
    });

    // Invited but not registered (exclude frozen)
    (invitations || []).forEach((inv: any, i: number) => {
      if (!registeredEmails.has(inv.email)) {
        const s = settingsMap.get(inv.email);
        if (s?.frozen) return; // Skip frozen members
        options.push({
          id: `assignee-${inv.email}`,
          label: inv.email,
          email: inv.email,
          color: PRESET_COLORS[(profiles?.length || 0 + i) % PRESET_COLORS.length],
          note: s?.note || "",
        });
      }
    });

    // Sort by sort_order from settings (0 = unsorted, keep original order among those)
    options.sort((a, b) => {
      const orderA = settingsMap.get(a.email || "")?.sort_order ?? 0;
      const orderB = settingsMap.get(b.email || "")?.sort_order ?? 0;
      return orderA - orderB;
    });

    store = {
      ...store,
      assignee: { ...store.assignee, options, manualOrder: true },
    };
    // Don't persist assignee to settings – just notify
    listeners.forEach((l) => l());
  },

  /** Load persisted settings from DB (non-assignee fields) */
  loadSettings: async () => {
    const saved = await loadSetting<Record<string, FieldOptions>>(SETTINGS_KEY);
    if (saved && typeof saved === "object") {
      for (const key of PERSISTED_FIELDS) {
        if (saved[key]) {
          store = { ...store, [key]: saved[key] };
        }
      }
      listeners.forEach((l) => l());
    }
  },
};

export function useSelectOptions(fieldKey: string) {
  useSyncExternalStore(selectOptionsStore.subscribe, selectOptionsStore.getSnapshot);
  return {
    options: selectOptionsStore.getSortedOptions(fieldKey),
    customColors: selectOptionsStore.getField(fieldKey).customColors,
  };
}
