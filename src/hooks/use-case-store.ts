import { useSyncExternalStore, useEffect } from "react";
import { caseStore } from "@/stores/case-store";
import type { CaseRecord } from "@/data/case-types";

export function useCases(): CaseRecord[] {
  useEffect(() => { caseStore.load(); }, []);
  return useSyncExternalStore(caseStore.subscribe, caseStore.getAll);
}

export { caseStore };
