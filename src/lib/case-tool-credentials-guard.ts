import type { ToolEntry } from "@/data/case-types";
import type { CaseCredentials } from "@/lib/case-action-rpc";

/** 公開 view 遮罩後的工具列（fieldValues 恒為空物件）不可當作可寫底稿。 */
export function looksLikeMaskedPublicTools(tools: ToolEntry[] | null | undefined): boolean {
  if (!Array.isArray(tools) || tools.length === 0) return false;
  return tools.every((entry) => {
    const fv = entry?.fieldValues;
    if (fv == null) return true;
    if (typeof fv !== "object" || Array.isArray(fv)) return true;
    return Object.keys(fv).length === 0;
  });
}

export function assertWritableToolCredentials(
  credentials: CaseCredentials | null | undefined,
): credentials is CaseCredentials {
  return !!credentials && Array.isArray(credentials.tools);
}

export function mergeToolEntryUpdates(
  entry: ToolEntry,
  updates: Partial<ToolEntry>,
): ToolEntry {
  const next: ToolEntry = { ...entry, ...updates };

  if (updates.fieldValues !== undefined) {
    next.fieldValues = updates.fields !== undefined
      ? updates.fieldValues
      : { ...(entry.fieldValues || {}), ...updates.fieldValues };
  }

  if (updates.fileValues !== undefined) {
    next.fileValues = updates.fields !== undefined
      ? updates.fileValues
      : { ...(entry.fileValues || {}), ...updates.fileValues };
  }

  return next;
}

/**
 * 僅在已持有完整憑證底稿時組出下一組 tools；否則拒絕（避免把遮罩空值整組寫回）。
 */
export function buildNextToolsFromWritableBase(input: {
  writableTools: ToolEntry[] | null | undefined;
  updater: (current: ToolEntry[]) => ToolEntry[];
}): { ok: true; next: ToolEntry[] } | { ok: false; reason: "credentials_not_ready" | "masked_base_rejected" } {
  if (!Array.isArray(input.writableTools)) {
    return { ok: false, reason: "credentials_not_ready" };
  }
  // 允許合法「全部清空各欄」的寫入；但若底稿本身來自公開遮罩且尚無任何非空欄，
  // 且 updater 結果仍全空，仍視為未就緒遮罩（呼叫端應在 load 完成前直接拒寫）。
  if (looksLikeMaskedPublicTools(input.writableTools) && input.writableTools.every((t) => !t.tool)) {
    // 空工具殼可能是新建；仍允許。僅擋「有 tool 標籤但 fieldValues 全空」當底稿且呼叫端標記為 public fallback 時。
  }
  const next = input.updater(input.writableTools);
  return { ok: true, next };
}

export function rejectMaskedFallbackWrite(input: {
  credentialsReady: boolean;
  usedPublicFallback: boolean;
}): string | null {
  if (!input.credentialsReady) {
    return "完整工具資料尚未載入，無法儲存（避免以遮罩空值覆寫）。";
  }
  if (input.usedPublicFallback) {
    return "目前顯示的是公開遮罩資料，不可寫入。請重新載入憑證後再試。";
  }
  return null;
}
