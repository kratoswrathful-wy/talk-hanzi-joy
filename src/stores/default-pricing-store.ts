import { useSyncExternalStore } from "react";

/**
 * Default pricing store
 *
 * Client pricing: clientName → taskType → price
 * Translator tiers: breakpoint-based pricing per group.
 *   Each tier has a `threshold` (≥) and `translatorPrice`.
 *   The lowest threshold covers [0, threshold).
 *   Each subsequent threshold covers [threshold, nextThreshold).
 *   The highest threshold covers [threshold, ∞).
 *   groupId groups tiers created together (same billingUnit, multiple taskTypes sharing same breakpoints).
 */

export interface TranslatorTier {
  id: string;
  groupId: string;
  taskType: string;
  billingUnit: string;
  threshold: number;      // client price breakpoint (≥)
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

  addTier: (taskType: string, billingUnit: string, threshold: number, translatorPrice: number, groupId?: string) => {
    const tier: TranslatorTier = {
      id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      groupId: groupId || generateGroupId(),
      taskType,
      billingUnit,
      threshold,
      translatorPrice,
    };
    store = { ...store, translatorTiers: [...store.translatorTiers, tier] };
    notify();
    return tier.id;
  },

  /** Add a tier row to ALL task types within a group */
  addTierToGroup: (groupId: string, threshold: number, translatorPrice: number) => {
    const groupTiers = store.translatorTiers.filter((t) => t.groupId === groupId);
    if (groupTiers.length === 0) return;
    const billingUnit = groupTiers[0].billingUnit;
    const taskTypes = [...new Set(groupTiers.map((t) => t.taskType))];
    const newTiers = taskTypes.map((tt) => ({
      id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-${tt}`,
      groupId,
      taskType: tt,
      billingUnit,
      threshold,
      translatorPrice,
    }));
    store = { ...store, translatorTiers: [...store.translatorTiers, ...newTiers] };
    notify();
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

  /** Update a field for all tiers in a group that share the same threshold+price (same "row") */
  updateTierRow: (id: string, updates: Partial<Pick<TranslatorTier, "threshold" | "translatorPrice">>) => {
    const target = store.translatorTiers.find((t) => t.id === id);
    if (!target) return;
    store = {
      ...store,
      translatorTiers: store.translatorTiers.map((t) => {
        if (t.groupId === target.groupId && t.threshold === target.threshold && t.translatorPrice === target.translatorPrice) {
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
        !(t.groupId === target.groupId && t.threshold === target.threshold && t.translatorPrice === target.translatorPrice)
      ),
    };
    notify();
  },

  /** Look up translator price from a given client price, taskType and billingUnit.
   *  Uses breakpoint logic: finds the lowest threshold ≥ clientPrice (threshold means ≤). 
   *  threshold=0 means unlimited (covers all prices). */
  getTranslatorPrice: (clientPrice: number, taskType?: string, billingUnit?: string): number | undefined => {
    const candidates = store.translatorTiers.filter((t) => {
      if (taskType && t.taskType !== taskType) return false;
      if (billingUnit && t.billingUnit !== billingUnit) return false;
      return t.threshold === 0 || t.threshold >= clientPrice;
    });
    if (candidates.length === 0) return undefined;
    // Pick the one with the lowest non-zero threshold that is still ≥ clientPrice
    // threshold=0 is "catch-all / unlimited", so it should be last resort
    candidates.sort((a, b) => {
      if (a.threshold === 0) return 1;
      if (b.threshold === 0) return -1;
      return a.threshold - b.threshold;
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
