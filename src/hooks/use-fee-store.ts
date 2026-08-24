import { useSyncExternalStore, useEffect } from "react";
import { feeStore } from "@/stores/fee-store";

/** Hook only ensures load; auth / poll / realtime ownership lives in fee-store. */
function ensureLoaded() {
  void feeStore.loadFees();
}

export function useFees() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(feeStore.subscribe, feeStore.getFees);
}

export function useFeesLoaded() {
  return useSyncExternalStore(feeStore.subscribe, feeStore.isLoaded);
}

export function useFee(id: string | undefined) {
  const fees = useFees();
  return id ? fees.find((f) => f.id === id) : undefined;
}

export { feeStore };
