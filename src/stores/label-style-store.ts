import { useSyncExternalStore } from "react";

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
  client: LabelStyle;
  dispatchRoute: LabelStyle;
  statusDraft: StatusStyle;
  statusFinalized: StatusStyle;
}

const DEFAULT_STATE: LabelStyleState = {
  taskType: { textColor: "#D1DAEA" },
  client: { textColor: "#D1DAEA" },
  dispatchRoute: { textColor: "#D1DAEA" },
  statusDraft: { bgColor: "#6B7280", textColor: "#D1DAEA" },
  statusFinalized: { bgColor: "#22C55E", textColor: "#D1DAEA" },
};

let state: LabelStyleState = { ...DEFAULT_STATE };
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export const labelStyleStore = {
  getState: () => state,

  setTaskTypeTextColor: (color: string) => {
    state = { ...state, taskType: { ...state.taskType, textColor: color } };
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

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => state,
};

export function useLabelStyles() {
  return useSyncExternalStore(labelStyleStore.subscribe, labelStyleStore.getSnapshot);
}
