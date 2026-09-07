import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import { getCaseCredentials } from "@/lib/case-action-rpc";

export class CredentialLoadStaleError extends Error {
  constructor(message = "credential_load_stale") {
    super(message);
    this.name = "CredentialLoadStaleError";
  }
}

export interface CaseCredentialAccess {
  load(caseId: string): Promise<CaseCredentials>;
  /** 以已知完整資料覆寫快取（保存成功後用）；不視為清除。 */
  put(caseId: string, credentials: CaseCredentials): void;
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
  let globalGeneration = 0;
  const caseGeneration = new Map<string, number>();

  const tokenFor = (caseId: string) =>
    `${globalGeneration}:${caseGeneration.get(caseId) ?? 0}`;

  const bumpCase = (caseId: string) => {
    caseGeneration.set(caseId, (caseGeneration.get(caseId) ?? 0) + 1);
  };

  return {
    async load(caseId) {
      const token = tokenFor(caseId);
      const { data, error } = await getCaseCredentials(client, caseId);
      if (tokenFor(caseId) !== token) {
        throw new CredentialLoadStaleError();
      }
      if (error || !data) {
        cache.delete(caseId);
        throw error ?? new Error("credential_access_failed");
      }
      cache.set(caseId, data);
      return data;
    },
    put(caseId, credentials) {
      cache.set(caseId, credentials);
      listeners.forEach((listener) => listener(caseId));
    },
    peek(caseId) {
      return cache.get(caseId);
    },
    clear(caseId) {
      bumpCase(caseId);
      cache.delete(caseId);
      listeners.forEach((listener) => listener(caseId));
    },
    clearAll() {
      globalGeneration += 1;
      cache.clear();
      listeners.forEach((listener) => listener(null));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
