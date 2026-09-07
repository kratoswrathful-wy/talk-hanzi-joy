import type { ToolEntry } from "@/data/case-types";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import {
  mergeToolEntryUpdates,
  rejectMaskedFallbackWrite,
} from "@/lib/case-tool-credentials-guard";

export type ToolCredentialsBlock = "tools" | "questionTools";

export interface ToolCredentialsPersistDeps {
  peek: (caseId: string) => CaseCredentials | undefined;
  put: (caseId: string, credentials: CaseCredentials) => void;
  load: (caseId: string) => Promise<CaseCredentials>;
  updateCredentials: (
    caseId: string,
    patch: Partial<Pick<CaseCredentials, "tools" | "questionTools">>,
  ) => Promise<Error | null>;
}

/** 每案序列化工具憑證寫入，避免連打／失焦競態用舊底稿覆蓋。 */
const queues = new Map<string, Promise<unknown>>();

/** 測試用：清空序列佇列，避免失敗案例卡住後續。 */
export function resetToolCredentialPersistQueuesForTests() {
  queues.clear();
}

function enqueue<T>(caseId: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(caseId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  queues.set(
    caseId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export async function persistToolBlockPatch(input: {
  caseId: string;
  block: ToolCredentialsBlock;
  updater: (current: ToolEntry[]) => ToolEntry[];
  /** 畫面草稿；若 peek 空則可暫用，但仍須 credentialsReady */
  draftCredentials: CaseCredentials | null;
  credentialsReady: boolean;
  usedPublicFallback: boolean;
  deps: ToolCredentialsPersistDeps;
}): Promise<{ error: Error | null; nextCredentials: CaseCredentials | null }> {
  const blocked = rejectMaskedFallbackWrite({
    credentialsReady: input.credentialsReady,
    usedPublicFallback: input.usedPublicFallback,
  });
  if (blocked) {
    return { error: new Error(blocked), nextCredentials: input.draftCredentials };
  }

  return enqueue(input.caseId, async () => {
    const base =
      input.deps.peek(input.caseId)
      ?? input.draftCredentials
      ?? null;
    if (!base || !Array.isArray(base[input.block])) {
      return {
        error: new Error("完整工具資料尚未載入，無法儲存（避免以遮罩空值覆寫）。"),
        nextCredentials: input.draftCredentials,
      };
    }

    const currentBlock = base[input.block] as ToolEntry[];
    const nextBlock = input.updater(currentBlock);
    const optimistic: CaseCredentials = { ...base, [input.block]: nextBlock };
    input.deps.put(input.caseId, optimistic);

    const error = await input.deps.updateCredentials(input.caseId, {
      [input.block]: nextBlock,
    });
    if (error) {
      // 失敗保留樂觀草稿於 peek／呼叫端 state，不回滾為遮罩
      return { error, nextCredentials: optimistic };
    }

    const reloaded = input.deps.peek(input.caseId) ?? optimistic;
    return { error: null, nextCredentials: reloaded };
  });
}

export function applyToolEntryFieldPatch(
  tools: ToolEntry[],
  idx: number,
  updates: Partial<ToolEntry>,
): ToolEntry[] {
  return tools.map((t, i) => (i === idx ? mergeToolEntryUpdates(t, updates) : t));
}
