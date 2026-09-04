import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import { getCaseCredentials } from "@/lib/case-action-rpc";

export interface CaseCredentialAccess {
  load(caseId: string): Promise<CaseCredentials>;
  peek(caseId: string): CaseCredentials | undefined;
  clear(caseId: string): void;
  clearAll(): void;
  subscribe(listener: (caseId: string | null) => void): () => void;
}

export function createCaseCredentialAccess(
  client: SupabaseClient,
): CaseCredentialAccess {
  const cache = new Map<string, CaseCredentials>();
  const listeners = new Set<(caseId: string | null) => void>();

  return {
    async load(caseId) {
      const { data, error } = await getCaseCredentials(client, caseId);
      if (error || !data) {
        cache.delete(caseId);
        throw error ?? new Error("credential_access_failed");
      }
      cache.set(caseId, data);
      return data;
    },
    peek(caseId) {
      return cache.get(caseId);
    },
    clear(caseId) {
      cache.delete(caseId);
      listeners.forEach((listener) => listener(caseId));
    },
    clearAll() {
      cache.clear();
      listeners.forEach((listener) => listener(null));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
