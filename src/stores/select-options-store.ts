import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SelectOption {
  id: string;
  label: string;
  email?: string; // for assignee options: the member's email
  color: string; // hex color
  note?: string; // optional note (e.g. translator fee note)
  avatarUrl?: string | null; // for assignee options: profile avatar
}

export const PRESET_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#F59E0B", // amber
  "#EAB308", // yellow
  "#84CC16", // lime
  "#22C55E", // green
  "#3B82F6", // blue
  "#6366F1", // indigo
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#6B7280", // dark gray
  "#9CA3AF", // gray
];

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

function notify() {
  listeners.forEach((l) => l());
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
        { id: "opt-t4", label: "LQA", color: PRESET_COLORS[12] },
      ],
      customColors: [],
    },
    billingUnit: {
      options: [
        { id: "opt-b1", label: "字", color: PRESET_COLORS[8] },
        { id: "opt-b2", label: "小時", color: PRESET_COLORS[1] },
      ],
      customColors: [],
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
    clientTaskType: {
      options: [
        { id: "opt-ct1", label: "翻譯", color: PRESET_COLORS[9] },
        { id: "opt-ct2", label: "校對", color: PRESET_COLORS[4] },
        { id: "opt-ct3", label: "MTPE", color: PRESET_COLORS[6] },
        { id: "opt-ct4", label: "LQA", color: PRESET_COLORS[12] },
      ],
      customColors: [],
      manualOrder: true,
    },
    dispatchRoute: {
      options: [
        { id: "opt-dr1", label: "V 信箱", color: PRESET_COLORS[6] },
        { id: "opt-dr2", label: "Teams", color: PRESET_COLORS[8] },
      ],
      customColors: [],
    },
    clientBillingUnit: {
      options: [
        { id: "opt-cb1", label: "字", color: PRESET_COLORS[8] },
        { id: "opt-cb2", label: "小時", color: PRESET_COLORS[1] },
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

  /** Load assignee options from profiles + invitations in DB */
  loadAssignees: async () => {
    const [{ data: profiles }, { data: invitations }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("email, display_name, avatar_url"),
      supabase.from("invitations").select("email, role").is("accepted_at", null),
      supabase.from("member_translator_settings").select("email, note, no_fee"),
    ]);

    const settingsMap = new Map<string, { note: string; no_fee: boolean }>();
    (settings || []).forEach((s: any) => settingsMap.set(s.email, { note: s.note || "", no_fee: s.no_fee || false }));

    const options: SelectOption[] = [];
    const registeredEmails = new Set<string>();

    // Registered members
    (profiles || []).forEach((p: any, i: number) => {
      registeredEmails.add(p.email);
      const s = settingsMap.get(p.email);
      options.push({
        id: `assignee-${p.email}`,
        label: p.display_name || p.email,
        email: p.email,
        color: PRESET_COLORS[i % PRESET_COLORS.length],
        note: s?.note || "",
      });
    });

    // Invited but not registered
    (invitations || []).forEach((inv: any, i: number) => {
      if (!registeredEmails.has(inv.email)) {
        const s = settingsMap.get(inv.email);
        options.push({
          id: `assignee-${inv.email}`,
          label: inv.email,
          email: inv.email,
          color: PRESET_COLORS[(profiles?.length || 0 + i) % PRESET_COLORS.length],
          note: s?.note || "",
        });
      }
    });

    store = {
      ...store,
      assignee: { ...store.assignee, options },
    };
    notify();
  },
};

export function useSelectOptions(fieldKey: string) {
  useSyncExternalStore(selectOptionsStore.subscribe, selectOptionsStore.getSnapshot);
  return {
    options: selectOptionsStore.getSortedOptions(fieldKey),
    customColors: selectOptionsStore.getField(fieldKey).customColors,
  };
}
