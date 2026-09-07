import type { ToolEntry } from "@/data/case-types";
import type { CaseCredentials } from "@/lib/case-action-rpc";
import {
  mergeToolEntryUpdates,
  rejectMaskedFallbackWrite,
} from "@/lib/case-tool-credentials-guard";

export type ToolCredentialsBlock = "tools" | "questionTools";

export type ToolCredentialPersistStatus =
  | "ok"
  | "rejected"
  | "write_failed"
  | "write_ok_readback_pending"
  | "stale_session";

export interface ToolCredentialsPersistDeps {
  getActiveUserId: () => string | null;
  scope: (caseId: string) => { caseId: string; userId: string | null; generation: number } | undefined;
  peekConfirmed: (caseId: string) => CaseCredentials | undefined;
  putConfirmed: (caseId: string, credentials: CaseCredentials, expectedGeneration?: number) => boolean;
  putDraft: (caseId: string, credentials: CaseCredentials) => void;
  peekDraft: (caseId: string) => CaseCredentials | undefined;
  load: (caseId: string) => Promise<CaseCredentials>;
  updateCredentials: (
    caseId: string,
    patch: Partial<Pick<CaseCredentials, "tools" | "questionTools">>,
  ) => Promise<Error | null>;
}

export interface PersistToolBlockResult {
  status: ToolCredentialPersistStatus;
  error: Error | null;
  /** 供 UI 顯示的草稿（失敗或讀回未確認時） */
  draftCredentials: CaseCredentials | null;
  /** 僅 status=ok 時為後端確認值 */
  confirmedCredentials: CaseCredentials | null;
  caseId: string;
  userId: string | null;
  generation: number | null;
}

const queues = new Map<string, Promise<unknown>>();

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

function refuse(
  partial: Omit<PersistToolBlockResult, "status" | "error" | "confirmedCredentials"> & {
    message: string;
    status?: ToolCredentialPersistStatus;
  },
): PersistToolBlockResult {
  return {
    status: partial.status ?? "rejected",
    error: new Error(partial.message),
    draftCredentials: partial.draftCredentials,
    confirmedCredentials: null,
    caseId: partial.caseId,
    userId: partial.userId,
    generation: partial.generation,
  };
}

/**
 * 安全寫入工具區塊：底稿必須同案、同登入身分、同載入代次；
 * 未確認草稿與後端確認快取分開；佇列執行前再次核對。
 */
export async function persistToolBlockPatch(input: {
  caseId: string;
  userId: string | null;
  /** 發起時的案件代次；執行時必須仍一致 */
  generation: number | null;
  block: ToolCredentialsBlock;
  updater: (current: ToolEntry[]) => ToolEntry[];
  /** 畫面草稿；caseId 必須相符，且不可單獨在無 confirmed 時充當跨案底稿 */
  draftCredentials: CaseCredentials | null;
  credentialsReady: boolean;
  usedPublicFallback: boolean;
  deps: ToolCredentialsPersistDeps;
}): Promise<PersistToolBlockResult> {
  const blocked = rejectMaskedFallbackWrite({
    credentialsReady: input.credentialsReady,
    usedPublicFallback: input.usedPublicFallback,
  });
  if (blocked) {
    return refuse({
      message: blocked,
      draftCredentials: input.draftCredentials,
      caseId: input.caseId,
      userId: input.userId,
      generation: input.generation,
    });
  }

  if (input.draftCredentials && input.draftCredentials.caseId !== input.caseId) {
    return refuse({
      message: "工具草稿與目前案件不符，已拒絕寫入（避免跨案覆寫）。",
      draftCredentials: null,
      caseId: input.caseId,
      userId: input.userId,
      generation: input.generation,
    });
  }

  const captured = {
    caseId: input.caseId,
    userId: input.userId,
    generation: input.generation,
    block: input.block,
    updater: input.updater,
    draftCredentials: input.draftCredentials,
  };

  return enqueue(captured.caseId, async () => {
    // 執行前再次核對身分／代次
    if (input.deps.getActiveUserId() !== captured.userId) {
      return refuse({
        status: "stale_session",
        message: "登入身分已變更，取消此筆工具保存。",
        draftCredentials: captured.draftCredentials,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      });
    }
    const scopeNow = input.deps.scope(captured.caseId);
    if (!scopeNow) {
      return refuse({
        status: "stale_session",
        message: "完整工具資料已失效，取消此筆工具保存。",
        draftCredentials: captured.draftCredentials,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      });
    }
    if (
      captured.generation != null
      && scopeNow.generation !== captured.generation
    ) {
      return refuse({
        status: "stale_session",
        message: "案件憑證已重新載入，取消過期的工具保存。",
        draftCredentials: captured.draftCredentials,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      });
    }
    if (scopeNow.userId !== captured.userId) {
      return refuse({
        status: "stale_session",
        message: "憑證快取身分不符，取消工具保存。",
        draftCredentials: captured.draftCredentials,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      });
    }

    const confirmed = input.deps.peekConfirmed(captured.caseId);
    if (!confirmed || confirmed.caseId !== captured.caseId) {
      return refuse({
        message: "完整工具資料尚未載入，無法儲存（避免以遮罩空值覆寫）。",
        draftCredentials: captured.draftCredentials,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      });
    }

    // 同案草稿可作為「目前編輯視圖」輸入；不可用別案 draft。仍以 confirmed 校驗 caseId。
    const draftSameCase =
      captured.draftCredentials
      && captured.draftCredentials.caseId === captured.caseId
        ? captured.draftCredentials
        : null;
    const working = draftSameCase ?? confirmed;
    if (!Array.isArray(working[captured.block])) {
      return refuse({
        message: "完整工具資料尚未載入，無法儲存（避免以遮罩空值覆寫）。",
        draftCredentials: captured.draftCredentials,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      });
    }

    const currentBlock = working[captured.block] as ToolEntry[];
    const nextBlock = captured.updater(currentBlock);
    // 合併時以 confirmed 為骨架，只替換目標 block，避免草稿缺欄污染其他區塊
    const optimistic: CaseCredentials = {
      ...confirmed,
      ...draftSameCase,
      caseId: captured.caseId,
      [captured.block]: nextBlock,
    };
    input.deps.putDraft(captured.caseId, optimistic);

    const writeError = await input.deps.updateCredentials(captured.caseId, {
      [captured.block]: nextBlock,
    });
    if (writeError) {
      return {
        status: "write_failed",
        error: writeError,
        draftCredentials: optimistic,
        confirmedCredentials: null,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      };
    }

    try {
      const reloaded = await input.deps.load(captured.caseId);
      input.deps.putConfirmed(
        captured.caseId,
        reloaded,
        captured.generation ?? undefined,
      );
      return {
        status: "ok",
        error: null,
        draftCredentials: null,
        confirmedCredentials: reloaded,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      };
    } catch (loadErr) {
      return {
        status: "write_ok_readback_pending",
        error: new Error(
          `已寫入、尚未確認讀回${loadErr instanceof Error && loadErr.message ? `（${loadErr.message}）` : ""}`,
        ),
        draftCredentials: optimistic,
        confirmedCredentials: null,
        caseId: captured.caseId,
        userId: captured.userId,
        generation: captured.generation,
      };
    }
  });
}

export function applyToolEntryFieldPatch(
  tools: ToolEntry[],
  idx: number,
  updates: Partial<ToolEntry>,
): ToolEntry[] {
  return tools.map((t, i) => (i === idx ? mergeToolEntryUpdates(t, updates) : t));
}

/** 結果是否仍適用於目前畫面（防晚到更新另一案） */
export function isPersistResultCurrent(input: {
  result: PersistToolBlockResult;
  viewingCaseId: string | null | undefined;
  activeUserId: string | null;
  generation: number | null;
}): boolean {
  if (input.result.caseId !== input.viewingCaseId) return false;
  if (input.result.userId !== input.activeUserId) return false;
  if (
    input.result.generation != null
    && input.generation != null
    && input.result.generation !== input.generation
  ) {
    return false;
  }
  return true;
}
