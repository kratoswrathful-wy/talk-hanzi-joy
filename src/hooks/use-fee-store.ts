import { useSyncExternalStore, useEffect } from "react";
import { feeStore } from "@/stores/fee-store";

/** Hook only ensures load; auth / poll / realtime ownership lives in fee-store. */
function ensureLoaded() {
  void feeStore.ensureLoaded();
}

export function useFees() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(feeStore.subscribe, feeStore.getFees);
}

export function useFeesLoaded() {
  return useSyncExternalStore(feeStore.subscribe, feeStore.isLoaded);
}

export function useFee(id: string | undefined) {
  useFees();
  return id ? feeStore.getFeeById(id) : undefined;
}

export { feeStore };
