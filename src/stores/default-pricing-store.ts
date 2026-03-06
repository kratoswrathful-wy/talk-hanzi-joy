import { useSyncExternalStore } from "react";

/**
 * Default pricing store
 *
 * Client pricing: clientName → taskType → price
 * Translator tiers: range-based pricing per group.
 *   Each tier has minPrice (lower bound) and maxPrice (upper bound).
 *   maxPrice=0 means ∞ (unlimited).
 *   groupId groups tiers created together (same billingUnit, multiple taskTypes sharing same ranges).
 */

export interface TranslatorTier {
  id: string;
  groupId: string;
  taskType: string;
  billingUnit: string;
  minPrice: number;       // range lower bound (exclusive, >)
  maxPrice: number;       // range upper bound (inclusive, <=), 0 = ∞
  translatorPrice: number;
}

type Listener = () => void;

interface PricingStore {
  clientPricing: Record<string, Record<string, number>>;
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

function generateGroupId() {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
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

  addTier: (taskType: string, billingUnit: string, minPrice: number, maxPrice: number, translatorPrice: number, groupId?: string) => {
    const tier: TranslatorTier = {
      id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      groupId: groupId || generateGroupId(),
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

  /** Add a tier row to ALL task types within a group. Returns new tier IDs. */
  addTierToGroup: (groupId: string, minPrice: number, maxPrice: number, translatorPrice: number): string[] => {
    const groupTiers = store.translatorTiers.filter((t) => t.groupId === groupId);
    if (groupTiers.length === 0) return [];
    const billingUnit = groupTiers[0].billingUnit;
    const taskTypes = [...new Set(groupTiers.map((t) => t.taskType))];
    const newTiers = taskTypes.map((tt) => ({
      id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-${tt}`,
      groupId,
      taskType: tt,
      billingUnit,
      minPrice,
      maxPrice,
      translatorPrice,
    }));
    store = { ...store, translatorTiers: [...store.translatorTiers, ...newTiers] };
    notify();
    return newTiers.map((t) => t.id);
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

  /** Update a field for all tiers in a group that share the same min/max/price (same "row") */
  updateTierRow: (id: string, updates: Partial<Pick<TranslatorTier, "minPrice" | "maxPrice" | "translatorPrice">>) => {
    const target = store.translatorTiers.find((t) => t.id === id);
    if (!target) return;
    store = {
      ...store,
      translatorTiers: store.translatorTiers.map((t) => {
        if (t.groupId === target.groupId && t.minPrice === target.minPrice && t.maxPrice === target.maxPrice && t.translatorPrice === target.translatorPrice) {
          return { ...t, ...updates };
        }
        return t;
      }),
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

  /** Remove an entire "row" from a group */
  removeTierRow: (id: string) => {
    const target = store.translatorTiers.find((t) => t.id === id);
    if (!target) return;
    store = {
      ...store,
      translatorTiers: store.translatorTiers.filter((t) =>
        !(t.groupId === target.groupId && t.minPrice === target.minPrice && t.maxPrice === target.maxPrice && t.translatorPrice === target.translatorPrice)
      ),
    };
    notify();
  },

  /** Look up translator price from a given client price, taskType and billingUnit.
   *  Finds the range where minPrice < clientPrice <= maxPrice (maxPrice=0 means ∞). */
  getTranslatorPrice: (clientPrice: number, taskType?: string, billingUnit?: string): number | undefined => {
    const candidates = store.translatorTiers.filter((t) => {
      if (taskType && t.taskType !== taskType) return false;
      if (billingUnit && t.billingUnit !== billingUnit) return false;
      const effectiveMax = t.maxPrice === 0 ? Infinity : t.maxPrice;
      return clientPrice > t.minPrice && clientPrice <= effectiveMax;
    });
    if (candidates.length === 0) return undefined;
    // If multiple match (shouldn't happen with valid config), pick most specific (smallest range)
    candidates.sort((a, b) => {
      const rangeA = (a.maxPrice === 0 ? Infinity : a.maxPrice) - a.minPrice;
      const rangeB = (b.maxPrice === 0 ? Infinity : b.maxPrice) - b.minPrice;
      return rangeA - rangeB;
    });
    return candidates[0].translatorPrice;
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
    addTierToGroup: defaultPricingStore.addTierToGroup,
    updateTier: defaultPricingStore.updateTier,
    updateTierRow: defaultPricingStore.updateTierRow,
    removeTier: defaultPricingStore.removeTier,
    removeTierRow: defaultPricingStore.removeTierRow,
    getTranslatorPrice: defaultPricingStore.getTranslatorPrice,
  };
}
