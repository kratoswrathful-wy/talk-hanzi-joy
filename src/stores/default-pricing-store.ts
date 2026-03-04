import { useSyncExternalStore } from "react";

/**
 * Default pricing store for translators (assignees) and clients.
 * Each person can have a default unit price (for translator task items)
 * or a default client price (for client task items).
 */

export interface DefaultPricing {
  /** The person's label (must match a select option label) */
  name: string;
  /** Default unit price (譯者預設單價) or client price (客戶預設報價) */
  defaultPrice: number;
}

type Listener = () => void;

interface PricingStore {
  /** fieldKey → name → price */
  assignee: Record<string, number>; // 譯者 name → 預設單價
  client: Record<string, number>;   // 客戶 name → 預設報價
}

let store: PricingStore = {
  assignee: {},
  client: {},
};

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export const defaultPricingStore = {
  getPrice: (fieldKey: "assignee" | "client", name: string): number | undefined => {
    return store[fieldKey][name];
  },

  setPrice: (fieldKey: "assignee" | "client", name: string, price: number) => {
    store = {
      ...store,
      [fieldKey]: { ...store[fieldKey], [name]: price },
    };
    notify();
  },

  removePrice: (fieldKey: "assignee" | "client", name: string) => {
    const { [name]: _, ...rest } = store[fieldKey];
    store = { ...store, [fieldKey]: rest };
    notify();
  },

  getAllPrices: (fieldKey: "assignee" | "client"): Record<string, number> => {
    return store[fieldKey];
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => store,
};

export function useDefaultPricing(fieldKey: "assignee" | "client") {
  useSyncExternalStore(defaultPricingStore.subscribe, defaultPricingStore.getSnapshot);
  return {
    prices: defaultPricingStore.getAllPrices(fieldKey),
    getPrice: (name: string) => defaultPricingStore.getPrice(fieldKey, name),
    setPrice: (name: string, price: number) => defaultPricingStore.setPrice(fieldKey, name, price),
    removePrice: (name: string) => defaultPricingStore.removePrice(fieldKey, name),
  };
}
