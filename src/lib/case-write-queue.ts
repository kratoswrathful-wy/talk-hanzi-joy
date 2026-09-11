/**
 * 同一案件的寫入依序執行，避免多筆 update 共用同一個舊 revision。
 * 前一筆失敗仍繼續下一筆，不讓整條鏈停住。
 */
export function createKeyedQueue() {
  const tails = new Map<string, Promise<void>>();

  return {
    enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve();
      const run = prev.then(task, task);
      tails.set(
        key,
        run.then(
          () => undefined,
          () => undefined,
        ),
      );
      return run;
    },
  };
}

export function adminWriteAccessFromRoles(
  rows: Array<{ role?: string | null }> | null | undefined,
  error: unknown,
): { ok: true; isAdmin: boolean } | { ok: false; message: string } {
  if (error) {
    return {
      ok: false,
      message: "無法確認身分，指派與公布尚未寫入。請稍後再試。",
    };
  }
  const isAdmin = (rows ?? []).some(
    (row) => row.role === "pm" || row.role === "executive",
  );
  return { ok: true, isAdmin };
}

/** 身分表失敗時仍送後端 RPC，不得在前端把公布／改欄請求吞掉。 */
export function shouldUseAdminCaseWritePath(
  access: ReturnType<typeof adminWriteAccessFromRoles>,
  hasAssignment: boolean,
): boolean {
  if (access.ok) return access.isAdmin;
  return hasAssignment;
}

export function shouldBlockNonAdminAssignmentWrite(
  access: ReturnType<typeof adminWriteAccessFromRoles>,
  hasAssignment: boolean,
): boolean {
  return access.ok && !access.isAdmin && hasAssignment;
}

/** 公布／收回的正式 status 在後端確認前不得樂觀套到畫面。 */
export function mergeOptimisticCaseWrite<T extends { status?: unknown }>(
  prevStatus: T["status"] | undefined,
  merged: T,
  wroteStatus: boolean,
): T {
  if (!wroteStatus) return merged;
  return { ...merged, status: prevStatus };
}

export const CASE_SAVE_NOT_READY_MESSAGE = "案件畫面尚未就緒，尚未寫入。";

/**
 * 使用者已送出寫入意圖時，不得因畫面快照暫時缺失就當成功。
 * 本地或 store 缺列時，仍送出有值的 partial。
 */
export function resolveIntendedCaseWrite<T extends object>(
  localPrev: T | null | undefined,
  storePrev: T | null | undefined,
  partial: Partial<T>,
):
  | { status: "ready"; base: T | null; write: Partial<T> }
  | { status: "not_ready"; message: string } {
  const writeKeys = Object.keys(partial).filter((key) => partial[key as keyof T] !== undefined);
  if (writeKeys.length === 0) {
    return { status: "not_ready", message: CASE_SAVE_NOT_READY_MESSAGE };
  }
  return {
    status: "ready",
    base: localPrev ?? storePrev ?? null,
    write: partial,
  };
}

export function describeCaseWriteFailure(error: unknown): {
  kind: "conflict" | "identity" | "failed";
  title: string;
  description: string;
} {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error ?? "儲存失敗");
  if (/stale_revision|case_revision_conflict|40001/.test(message)) {
    return {
      kind: "conflict",
      title: "版本衝突",
      description: "其他變更已寫入。已保留你剛輸入的內容，請核對後再存。",
    };
  }
  if (message.includes("無法確認身分")) {
    return {
      kind: "identity",
      title: "無法確認身分",
      description: message,
    };
  }
  return {
    kind: "failed",
    title: "儲存失敗",
    description: message,
  };
}
