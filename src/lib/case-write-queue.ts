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
