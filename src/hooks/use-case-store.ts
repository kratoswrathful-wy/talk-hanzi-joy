import { useSyncExternalStore, useEffect } from "react";
import { caseStore } from "@/stores/case-store";
import type { CaseRecord } from "@/data/case-types";

export function useCases(): CaseRecord[] {
  useEffect(() => { caseStore.load(); }, []);
  return useSyncExternalStore(caseStore.subscribe, caseStore.getAll);
}

/** True after first full cases load for this session — any role; avoids painting huge table before fetch completes. */
export function useCaseStoreReady(): boolean {
  return useSyncExternalStore(
    caseStore.subscribe,
    () => caseStore.isLoaded(),
    () => false,
  );
}

export { caseStore };
