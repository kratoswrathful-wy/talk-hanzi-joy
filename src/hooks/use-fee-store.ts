import { useSyncExternalStore } from "react";
import { feeStore } from "@/stores/fee-store";

export function useFees() {
  return useSyncExternalStore(feeStore.subscribe, feeStore.getFees);
}

export function useFee(id: string | undefined) {
  const fees = useFees();
  return id ? fees.find((f) => f.id === id) : undefined;
}

export { feeStore };
