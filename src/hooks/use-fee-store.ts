import { useSyncExternalStore, useEffect } from "react";
import { feeStore } from "@/stores/fee-store";

// Load fees from DB once
let loadPromise: Promise<any> | null = null;
function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = feeStore.loadFees();
  }
}

export function useFees() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(feeStore.subscribe, feeStore.getFees);
}

export function useFee(id: string | undefined) {
  const fees = useFees();
  return id ? fees.find((f) => f.id === id) : undefined;
}

export { feeStore };
