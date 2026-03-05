import { useSyncExternalStore } from "react";

/**
 * Default pricing store — translator tiers are per taskType + billingUnit.
 *
 * Client pricing: clientName → taskType → price
 * Translator tiers: taskType + billingUnit + clientPrice range → translatorPrice
 *   maxPrice = 0 means infinity (no upper bound)
 */

export interface TranslatorTier {
  id: string;
  taskType: string;
  billingUnit: string;
  minPrice: number;
  maxPrice: number; // 0 = infinity
  translatorPrice: number;
}

type Listener = () => void;

interface PricingStore {
  /** clientName → taskType → clientPrice */
  clientPricing: Record<string, Record<string, number>>;
  /** Translator price tiers based on client price ranges, per taskType+billingUnit */
  translatorTiers: TranslatorTier[];
}

let store: PricingStore = {
  clientPricing: {},
  translatorTiers: [],
};

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export const defaultPricingStore = {
  // --- Client pricing ---
  getClientPrice: (client: string, taskType: string): number | undefined => {
    return store.clientPricing[client]?.[taskType];
  },

  setClientPrice: (client: string, taskType: string, price: number) => {
    store = {
      ...store,
      clientPricing: {
        ...store.clientPricing,
        [client]: { ...(store.clientPricing[client] || {}), [taskType]: price },
      },
    };
    notify();
  },

  removeClientPrice: (client: string, taskType: string) => {
    const { [taskType]: _, ...rest } = store.clientPricing[client] || {};
    store = {
      ...store,
      clientPricing: { ...store.clientPricing, [client]: rest },
    };
    notify();
  },

  getClientPricing: (client: string): Record<string, number> => {
    return store.clientPricing[client] || {};
  },

  getAllClientPricing: (): Record<string, Record<string, number>> => {
    return store.clientPricing;
  },

  // --- Translator tiers ---
  getTranslatorTiers: (): TranslatorTier[] => store.translatorTiers,

  addTier: (taskType: string, billingUnit: string, minPrice: number, maxPrice: number, translatorPrice: number) => {
    const tier: TranslatorTier = {
      id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      taskType,
      billingUnit,
      minPrice,
      maxPrice,
      translatorPrice,
    };
    store = { ...store, translatorTiers: [...store.translatorTiers, tier] };
    notify();
    return tier.id;
  },

  updateTier: (id: string, updates: Partial<Omit<TranslatorTier, "id">>) => {
    store = {
      ...store,
      translatorTiers: store.translatorTiers.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    };
    notify();
  },

  removeTier: (id: string) => {
    store = {
      ...store,
      translatorTiers: store.translatorTiers.filter((t) => t.id !== id),
    };
    notify();
  },

  /** Look up translator price from a given client price, taskType and billingUnit using tiers.
   *  maxPrice = 0 means infinity (no upper bound). */
  getTranslatorPrice: (clientPrice: number, taskType?: string, billingUnit?: string): number | undefined => {
    const matchingTiers = store.translatorTiers.filter((t) => {
      if (taskType && t.taskType !== taskType) return false;
      if (billingUnit && t.billingUnit !== billingUnit) return false;
      const aboveMin = clientPrice > t.minPrice;
      const belowMax = t.maxPrice === 0 || clientPrice <= t.maxPrice;
      return aboveMin && belowMax;
    });
    return matchingTiers.length > 0 ? matchingTiers[0].translatorPrice : undefined;
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => store,
};

export function useClientPricing() {
  useSyncExternalStore(defaultPricingStore.subscribe, defaultPricingStore.getSnapshot);
  return {
    getAllClientPricing: defaultPricingStore.getAllClientPricing,
    getClientPrice: defaultPricingStore.getClientPrice,
    setClientPrice: defaultPricingStore.setClientPrice,
    removeClientPrice: defaultPricingStore.removeClientPrice,
    getClientPricing: defaultPricingStore.getClientPricing,
  };
}

export function useTranslatorTiers() {
  useSyncExternalStore(defaultPricingStore.subscribe, defaultPricingStore.getSnapshot);
  return {
    tiers: defaultPricingStore.getTranslatorTiers(),
    addTier: defaultPricingStore.addTier,
    updateTier: defaultPricingStore.updateTier,
    removeTier: defaultPricingStore.removeTier,
    getTranslatorPrice: defaultPricingStore.getTranslatorPrice,
  };
}
