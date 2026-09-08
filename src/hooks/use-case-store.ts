import { useSyncExternalStore, useEffect } from "react";
import { caseStore } from "@/stores/case-store";
import type { CaseRecord } from "@/data/case-types";
import type { PendingDuplicateToolsRecord } from "@/lib/case-duplicate-tools";

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

export function useCaseStoreLoadError(): string | null {
  return useSyncExternalStore(
    caseStore.subscribe,
    () => caseStore.getLoadError(),
    () => null,
  );
}

/** 部分完成複製工具：訂閱 pending 版本，核實／衝突後橫幅會立刻更新。 */
export function usePendingDuplicateTools(caseId: string | undefined): PendingDuplicateToolsRecord | undefined {
  const version = useSyncExternalStore(
    caseStore.subscribe,
    caseStore.getPendingToolsVersion,
    () => 0,
  );
  void version;
  return caseId ? caseStore.peekPendingDuplicateTools(caseId) : undefined;
}

export { caseStore };
