import { useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";

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

/** Helper to build composite key for client pricing: taskType::billingUnit */
export function clientPricingKey(taskType: string, billingUnit: string): string {
  return `${taskType}::${billingUnit}`;
}

/** Parse composite key back to { taskType, billingUnit } */
export function parseClientPricingKey(key: string): { taskType: string; billingUnit: string } {
  const idx = key.lastIndexOf("::");
  if (idx === -1) return { taskType: key, billingUnit: "字" }; // legacy fallback
  return { taskType: key.slice(0, idx), billingUnit: key.slice(idx + 2) };
}

interface PricingStore {
  clientPricing: Record<string, Record<string, number>>;
  translatorTiers: TranslatorTier[];
}

const defaultClientPricing: Record<string, Record<string, number>> = {
  CCJK: {
    [clientPricingKey("翻譯", "字")]: 1.2,
    [clientPricingKey("校對", "字")]: 0.6,
    [clientPricingKey("MTPE", "字")]: 0.9,
    [clientPricingKey("LQA", "小時")]: 450,
  },
};

const grpTranslation = "grp-default-translation";
const grpProofreading = "grp-default-proofreading";
const grpHourly = "grp-default-hourly";

const defaultTranslatorTiers: TranslatorTier[] = [
  // 翻譯 / 字
  { id: "tier-d1", groupId: grpTranslation, taskType: "翻譯", billingUnit: "字", minPrice: 0, maxPrice: 1.8, translatorPrice: 0.8 },
  { id: "tier-d2", groupId: grpTranslation, taskType: "翻譯", billingUnit: "字", minPrice: 1.8, maxPrice: 2.25, translatorPrice: 0.9 },
  { id: "tier-d3", groupId: grpTranslation, taskType: "翻譯", billingUnit: "字", minPrice: 2.25, maxPrice: 0, translatorPrice: 1 },
  // 校對 / 字
  { id: "tier-d4", groupId: grpProofreading, taskType: "校對", billingUnit: "字", minPrice: 0, maxPrice: 0.9, translatorPrice: 0.4 },
  { id: "tier-d5", groupId: grpProofreading, taskType: "校對", billingUnit: "字", minPrice: 0.9, maxPrice: 1.2, translatorPrice: 0.5 },
  { id: "tier-d6", groupId: grpProofreading, taskType: "校對", billingUnit: "字", minPrice: 1.2, maxPrice: 0, translatorPrice: 0.6 },
  // 翻譯+校對+MTPE+LQA / 小時
  { id: "tier-d7", groupId: grpHourly, taskType: "翻譯", billingUnit: "小時", minPrice: 0, maxPrice: 0, translatorPrice: 350 },
  { id: "tier-d8", groupId: grpHourly, taskType: "校對", billingUnit: "小時", minPrice: 0, maxPrice: 0, translatorPrice: 350 },
  { id: "tier-d9", groupId: grpHourly, taskType: "MTPE", billingUnit: "小時", minPrice: 0, maxPrice: 0, translatorPrice: 350 },
  { id: "tier-d10", groupId: grpHourly, taskType: "LQA", billingUnit: "小時", minPrice: 0, maxPrice: 0, translatorPrice: 350 },
];

let store: PricingStore = {
  clientPricing: { ...defaultClientPricing },
  translatorTiers: [...defaultTranslatorTiers],
};

const listeners = new Set<Listener>();

const SETTINGS_KEY = "default_pricing";

function notify() {
  listeners.forEach((l) => l());
  saveSetting(SETTINGS_KEY, store);
}

function generateGroupId() {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}

export const defaultPricingStore = {
  // --- Client pricing ---
  getClientPrice: (client: string, taskType: string, billingUnit?: string): number | undefined => {
    if (billingUnit) {
      return store.clientPricing[client]?.[clientPricingKey(taskType, billingUnit)];
    }
    // fallback: try both units, prefer 字
    return store.clientPricing[client]?.[clientPricingKey(taskType, "字")]
      ?? store.clientPricing[client]?.[clientPricingKey(taskType, "小時")]
      ?? store.clientPricing[client]?.[taskType]; // legacy key fallback
  },

  setClientPrice: (client: string, taskType: string, billingUnit: string, price: number) => {
    const key = clientPricingKey(taskType, billingUnit);
    store = {
      ...store,
      clientPricing: {
        ...store.clientPricing,
        [client]: { ...(store.clientPricing[client] || {}), [key]: price },
      },
    };
    notify();
  },

  removeClientPrice: (client: string, taskType: string, billingUnit: string) => {
    const key = clientPricingKey(taskType, billingUnit);
    const { [key]: _, ...rest } = store.clientPricing[client] || {};
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

  /** Load persisted pricing from DB */
  loadSettings: async () => {
    const saved = await loadSetting<PricingStore>(SETTINGS_KEY);
    if (saved && typeof saved === "object") {
      if (saved.clientPricing) store = { ...store, clientPricing: saved.clientPricing };
      if (saved.translatorTiers && Array.isArray(saved.translatorTiers)) {
        store = { ...store, translatorTiers: saved.translatorTiers };
      }
      listeners.forEach((l) => l());
    }
  },
};

export function useClientPricing() {
  useSyncExternalStore(defaultPricingStore.subscribe, defaultPricingStore.getSnapshot);
  return {
    getAllClientPricing: defaultPricingStore.getAllClientPricing,
    getClientPrice: defaultPricingStore.getClientPrice,
    setClientPrice: defaultPricingStore.setClientPrice,
    removeClientPrice: defaultPricingStore.removeClientPrice,
    getClientPricing: defaultPricingStore.getClientPricing,
    parseKey: parseClientPricingKey,
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
