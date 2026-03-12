import { useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";

export interface CurrencyOption {
  id: string;
  code: string;       // e.g. "USD", "EUR", "TWD"
  label: string;      // e.g. "美元", "歐元", "新台幣"
  twdRate: number;     // exchange rate to TWD, e.g. USD=30 means 1 USD = 30 TWD. TWD=1.
}

type Listener = () => void;

const SETTINGS_KEY = "currencies";

let currencies: CurrencyOption[] = [
  { id: "cur-twd", code: "TWD", label: "新台幣", twdRate: 1 },
];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, currencies);
}

export const currencyStore = {
  getCurrencies: () => currencies,

  addCurrency: (code: string, label: string, twdRate: number) => {
    const id = `cur-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    currencies = [...currencies, { id, code, label, twdRate }];
    notify();
    return id;
  },

  updateCurrency: (id: string, updates: Partial<Omit<CurrencyOption, "id">>) => {
    currencies = currencies.map((c) => (c.id === id ? { ...c, ...updates } : c));
    notify();
  },

  deleteCurrency: (id: string) => {
    currencies = currencies.filter((c) => c.id !== id);
    notify();
  },

  reorderCurrencies: (orderedIds: string[]) => {
    const ordered = orderedIds.map((id) => currencies.find((c) => c.id === id)).filter(Boolean) as CurrencyOption[];
    const remaining = currencies.filter((c) => !orderedIds.includes(c.id));
    currencies = [...ordered, ...remaining];
    notify();
  },

  /** Get TWD exchange rate for a currency code */
  getTwdRate: (code: string): number => {
    const c = currencies.find((c) => c.code === code);
    return c?.twdRate ?? 1;
  },

  /** Get currency info by code */
  getByCode: (code: string): CurrencyOption | undefined => {
    return currencies.find((c) => c.code === code);
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => currencies,

  loadSettings: async () => {
    const saved = await loadSetting<CurrencyOption[]>(SETTINGS_KEY);
    if (saved && Array.isArray(saved)) {
      currencies = saved;
      listeners.forEach((l) => l());
    }
  },
};

export function useCurrencies() {
  useSyncExternalStore(currencyStore.subscribe, currencyStore.getSnapshot);
  return {
    currencies: currencyStore.getCurrencies(),
    addCurrency: currencyStore.addCurrency,
    updateCurrency: currencyStore.updateCurrency,
    deleteCurrency: currencyStore.deleteCurrency,
    reorderCurrencies: currencyStore.reorderCurrencies,
    getTwdRate: currencyStore.getTwdRate,
    getByCode: currencyStore.getByCode,
  };
}
