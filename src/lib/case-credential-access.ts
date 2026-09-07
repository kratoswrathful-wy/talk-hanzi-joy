import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import { getCaseCredentials } from "@/lib/case-action-rpc";

export class CredentialLoadStaleError extends Error {
  constructor(message = "credential_load_stale") {
    super(message);
    this.name = "CredentialLoadStaleError";
  }
}

export interface CredentialScope {
  caseId: string;
  userId: string | null;
  /** 案件級代次：clear／切帳會遞增；load 成功後寫入世代戳 */
  generation: number;
}

export interface CaseCredentialAccess {
  setActiveUser(userId: string | null): void;
  getActiveUserId(): string | null;
  /** 目前案件已確認底稿的 scope；無則 undefined */
  scope(caseId: string): CredentialScope | undefined;
  /** 目前案件代次（即使尚未 load 成功也可讀） */
  generation(caseId: string): number;
  load(caseId: string): Promise<CaseCredentials>;
  /** 僅寫入「後端已確認」快取；須同案且不落後於既有世代 */
  putConfirmed(caseId: string, credentials: CaseCredentials, expectedGeneration?: number): boolean;
  peekConfirmed(caseId: string): CaseCredentials | undefined;
  /** @deprecated 使用 peekConfirmed */
  peek(caseId: string): CaseCredentials | undefined;
  /** @deprecated 使用 putConfirmed */
  put(caseId: string, credentials: CaseCredentials): void;
  /** UI 未確認草稿；不得當作下一次完整保存的唯一可信底稿來源 */
  putDraft(caseId: string, credentials: CaseCredentials): void;
  peekDraft(caseId: string): CaseCredentials | undefined;
  clearDraft(caseId: string): void;
  clear(caseId: string): void;
  clearAll(): void;
  subscribe(listener: (caseId: string | null) => void): () => void;
}

type ConfirmedEntry = {
  credentials: CaseCredentials;
  userId: string | null;
  generation: number;
  /** 單調遞增，防止舊 load／put 覆蓋新資料 */
  applySeq: number;
};

export function createCaseCredentialAccess(
  client: SupabaseClient,
): CaseCredentialAccess {
  const confirmed = new Map<string, ConfirmedEntry>();
  const drafts = new Map<string, CaseCredentials>();
  const listeners = new Set<(caseId: string | null) => void>();
  let activeUserId: string | null = null;
  let globalGeneration = 0;
  const caseGeneration = new Map<string, number>();
  /** 每案進行中的 load 序號 */
  const loadSeq = new Map<string, number>();
  let applySeqCounter = 0;

  const generationFor = (caseId: string) =>
    (caseGeneration.get(caseId) ?? 0) + globalGeneration * 1_000_000_000;

  const bumpCase = (caseId: string) => {
    caseGeneration.set(caseId, (caseGeneration.get(caseId) ?? 0) + 1);
  };

  const notify = (caseId: string | null) => {
    listeners.forEach((listener) => listener(caseId));
  };

  return {
    setActiveUser(userId) {
      if (userId === activeUserId) return;
      activeUserId = userId;
      globalGeneration += 1;
      confirmed.clear();
      drafts.clear();
      notify(null);
    },
    getActiveUserId() {
      return activeUserId;
    },
    scope(caseId) {
      const entry = confirmed.get(caseId);
      if (!entry) return undefined;
      return {
        caseId,
        userId: entry.userId,
        generation: entry.generation,
      };
    },
    generation(caseId) {
      return generationFor(caseId);
    },
    async load(caseId) {
      const genAtStart = generationFor(caseId);
      const userAtStart = activeUserId;
      const myLoad = (loadSeq.get(caseId) ?? 0) + 1;
      loadSeq.set(caseId, myLoad);

      const { data, error } = await getCaseCredentials(client, caseId);

      if (generationFor(caseId) !== genAtStart || activeUserId !== userAtStart) {
        throw new CredentialLoadStaleError();
      }
      if (loadSeq.get(caseId) !== myLoad) {
        throw new CredentialLoadStaleError("credential_load_superseded");
      }
      if (error || !data) {
        // 讀回失敗不得清掉既有已確認底稿（避免「已寫入、尚未確認讀回」後無法再編）
        throw error ?? new Error("credential_access_failed");
      }
      if (data.caseId && data.caseId !== caseId) {
        throw new Error("credential_case_mismatch");
      }
      const normalized: CaseCredentials = { ...data, caseId };
      applySeqCounter += 1;
      confirmed.set(caseId, {
        credentials: normalized,
        userId: userAtStart,
        generation: genAtStart,
        applySeq: applySeqCounter,
      });
      // 成功載入後清除同案草稿污染（重新載入以伺服器為準）
      drafts.delete(caseId);
      return normalized;
    },
    putConfirmed(caseId, credentials, expectedGeneration) {
      if (credentials.caseId !== caseId) return false;
      const gen = generationFor(caseId);
      if (expectedGeneration != null && expectedGeneration !== gen) return false;
      applySeqCounter += 1;
      confirmed.set(caseId, {
        credentials: { ...credentials, caseId },
        userId: activeUserId,
        generation: gen,
        applySeq: applySeqCounter,
      });
      notify(caseId);
      return true;
    },
    peekConfirmed(caseId) {
      const entry = confirmed.get(caseId);
      if (!entry) return undefined;
      if (entry.userId !== activeUserId) return undefined;
      if (entry.generation !== generationFor(caseId)) return undefined;
      if (entry.credentials.caseId !== caseId) return undefined;
      return entry.credentials;
    },
    peek(caseId) {
      const entry = confirmed.get(caseId);
      if (!entry) return undefined;
      if (entry.userId !== activeUserId) return undefined;
      if (entry.generation !== generationFor(caseId)) return undefined;
      if (entry.credentials.caseId !== caseId) return undefined;
      return entry.credentials;
    },
    put(caseId, credentials) {
      if (credentials.caseId !== caseId) return;
      const gen = generationFor(caseId);
      applySeqCounter += 1;
      confirmed.set(caseId, {
        credentials: { ...credentials, caseId },
        userId: activeUserId,
        generation: gen,
        applySeq: applySeqCounter,
      });
      notify(caseId);
    },
    putDraft(caseId, credentials) {
      if (credentials.caseId !== caseId) return;
      drafts.set(caseId, { ...credentials, caseId });
    },
    peekDraft(caseId) {
      const d = drafts.get(caseId);
      if (!d || d.caseId !== caseId) return undefined;
      return d;
    },
    clearDraft(caseId) {
      drafts.delete(caseId);
    },
    clear(caseId) {
      bumpCase(caseId);
      loadSeq.set(caseId, (loadSeq.get(caseId) ?? 0) + 1);
      confirmed.delete(caseId);
      drafts.delete(caseId);
      notify(caseId);
    },
    clearAll() {
      globalGeneration += 1;
      confirmed.clear();
      drafts.clear();
      notify(null);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
