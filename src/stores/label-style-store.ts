import { useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";

type Listener = () => void;

export interface LabelStyle {
  textColor: string;
}

export interface StatusStyle {
  bgColor: string;
  textColor: string;
}

interface LabelStyleState {
  taskType: LabelStyle;
  billingUnit: LabelStyle;
  client: LabelStyle;
  dispatchRoute: LabelStyle;
  statusDraft: StatusStyle;
  statusFinalized: StatusStyle;
  invoicePending: StatusStyle;
  invoicePartial: StatusStyle;
  invoicePaid: StatusStyle;
}

const DEFAULT_STATE: LabelStyleState = {
  taskType: { textColor: "#FFFFFF" },
  billingUnit: { textColor: "#FFFFFF" },
  client: { textColor: "#FFFFFF" },
  dispatchRoute: { textColor: "#FFFFFF" },
  statusDraft: { bgColor: "#6B7280", textColor: "#FFFFFF" },
  statusFinalized: { bgColor: "#22C55E", textColor: "#FFFFFF" },
  invoicePending: { bgColor: "#6B7280", textColor: "#FFFFFF" },
  invoicePartial: { bgColor: "#EAB308", textColor: "#FFFFFF" },
  invoicePaid: { bgColor: "#22C55E", textColor: "#FFFFFF" },
};

let state: LabelStyleState = { ...DEFAULT_STATE };
const listeners = new Set<Listener>();

const SETTINGS_KEY = "label_styles";

function notify() {
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, state);
}

export const labelStyleStore = {
  getState: () => state,

  setTaskTypeTextColor: (color: string) => {
    state = { ...state, taskType: { ...state.taskType, textColor: color } };
    notify();
  },

  setBillingUnitTextColor: (color: string) => {
    state = { ...state, billingUnit: { ...state.billingUnit, textColor: color } };
    notify();
  },

  setClientTextColor: (color: string) => {
    state = { ...state, client: { ...state.client, textColor: color } };
    notify();
  },

  setDispatchRouteTextColor: (color: string) => {
    state = { ...state, dispatchRoute: { ...state.dispatchRoute, textColor: color } };
    notify();
  },

  setStatusDraftStyle: (updates: Partial<StatusStyle>) => {
    state = { ...state, statusDraft: { ...state.statusDraft, ...updates } };
    notify();
  },

  setStatusFinalizedStyle: (updates: Partial<StatusStyle>) => {
    state = { ...state, statusFinalized: { ...state.statusFinalized, ...updates } };
    notify();
  },

  setInvoicePendingStyle: (updates: Partial<StatusStyle>) => {
    state = { ...state, invoicePending: { ...state.invoicePending, ...updates } };
    notify();
  },

  setInvoicePartialStyle: (updates: Partial<StatusStyle>) => {
    state = { ...state, invoicePartial: { ...state.invoicePartial, ...updates } };
    notify();
  },

  setInvoicePaidStyle: (updates: Partial<StatusStyle>) => {
    state = { ...state, invoicePaid: { ...state.invoicePaid, ...updates } };
    notify();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => state,

  /** Load persisted label styles from DB */
  loadSettings: async () => {
    const saved = await loadSetting<LabelStyleState>(SETTINGS_KEY);
    if (saved && typeof saved === "object") {
      state = { ...DEFAULT_STATE, ...saved };
      listeners.forEach((l) => l());
    }
  },
};

export function useLabelStyles() {
  return useSyncExternalStore(labelStyleStore.subscribe, labelStyleStore.getSnapshot);
}
