import { useSyncExternalStore } from "react";

export interface SelectOption {
  id: string;
  label: string;
  color: string; // hex color
}

export const PRESET_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#F59E0B", // amber
  "#EAB308", // yellow
  "#84CC16", // lime
  "#22C55E", // green
  "#14B8A6", // teal
  "#06B6D4", // cyan
  "#0EA5E9", // sky
  "#3B82F6", // blue
  "#6366F1", // indigo
  "#8B5CF6", // violet
  "#A855F7", // purple
  "#D946EF", // fuchsia
  "#EC4899", // pink
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
      options: [
        { id: "opt-a1", label: "王小明", color: PRESET_COLORS[0] },
        { id: "opt-a2", label: "李美玲", color: PRESET_COLORS[4] },
        { id: "opt-a3", label: "張大偉", color: PRESET_COLORS[8] },
        { id: "opt-a4", label: "陳雅婷", color: PRESET_COLORS[12] },
      ],
      customColors: [],
    },
    taskType: {
      options: [
        { id: "opt-t1", label: "翻譯", color: PRESET_COLORS[9] },
        { id: "opt-t2", label: "審稿", color: PRESET_COLORS[4] },
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
};

export function useSelectOptions(fieldKey: string) {
  useSyncExternalStore(selectOptionsStore.subscribe, selectOptionsStore.getSnapshot);
  return {
    options: selectOptionsStore.getSortedOptions(fieldKey),
    customColors: selectOptionsStore.getField(fieldKey).customColors,
  };
}
