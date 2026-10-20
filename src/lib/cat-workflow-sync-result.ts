export type CatWorkflowSyncReport = {
  found: boolean;
  unresolvedTranslators: string[];
  unresolvedReviewers?: string[];
  rowsWithoutFile: number;
  reviewRowsWithoutFile?: number;
  written: number;
  reviewWritten?: number;
};

export type CatWorkflowSyncParseFailure = {
  ok: false;
  reason: "rpc_error" | "unknown" | "not_found";
};

export type CatWorkflowSyncParseSuccess = {
  ok: true;
  report: CatWorkflowSyncReport;
};

export type CatWorkflowSyncParseResult =
  | CatWorkflowSyncParseSuccess
  | CatWorkflowSyncParseFailure;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** RPC 失敗、缺欄或 found 不明一律不算成功，避免空物件被當成已同步。 */
export function parseCatWorkflowSyncPayload(
  data: unknown,
  error?: { message?: string } | null,
): CatWorkflowSyncParseResult {
  if (error) return { ok: false, reason: "rpc_error" };
  if (!data || typeof data !== "object") return { ok: false, reason: "unknown" };
  const row = data as Record<string, unknown>;
  if (row.found !== true && row.found !== false) return { ok: false, reason: "unknown" };
  if (row.found !== true) return { ok: false, reason: "not_found" };
  if (typeof row.written !== "number") return { ok: false, reason: "unknown" };

  return {
    ok: true,
    report: {
      found: true,
      unresolvedTranslators: asStringArray(row.unresolvedTranslators),
      unresolvedReviewers: asStringArray(row.unresolvedReviewers),
      rowsWithoutFile: typeof row.rowsWithoutFile === "number" ? row.rowsWithoutFile : 0,
      reviewRowsWithoutFile:
        typeof row.reviewRowsWithoutFile === "number" ? row.reviewRowsWithoutFile : 0,
      written: row.written,
      reviewWritten: typeof row.reviewWritten === "number" ? row.reviewWritten : 0,
    },
  };
}

/** 儲存後給使用者看的部分失敗說明；沒有問題就回空陣列。 */
export function describeCatWorkflowSyncIssues(
  report: CatWorkflowSyncReport | null | undefined,
): string[] {
  if (!report) return [];
  const parts: string[] = [];
  if (report.unresolvedTranslators.length) {
    parts.push(`譯者無法對應帳號：${report.unresolvedTranslators.join("、")}`);
  }
  if ((report.unresolvedReviewers ?? []).length) {
    parts.push(`審稿無法對應帳號：${(report.unresolvedReviewers ?? []).join("、")}`);
  }
  if ((report.reviewRowsWithoutFile ?? 0) > 0) {
    parts.push(`有 ${report.reviewRowsWithoutFile} 筆審稿尚未對到 CAT 檔案`);
  }
  if ((report.rowsWithoutFile ?? 0) > 0) {
    parts.push(`有 ${report.rowsWithoutFile} 筆翻譯列尚未對到 CAT 檔案`);
  }
  return parts;
}

/** 有綁定 CAT 檔卻寫入 0 筆，與後端承接同步失敗條件一致。 */
export function acceptCatSyncShouldFail(input: {
  found: boolean;
  written: number;
  linkedFileCount: number;
}): boolean {
  if (!input.found) return true;
  if (input.linkedFileCount > 0 && input.written === 0) return true;
  return false;
}

export type CollabFileAssignRow = {
  accepted?: boolean;
  translatorUserId?: string | null;
  translator?: string | null;
  linkedCatFileId?: string | null;
};

export type CollabFileAssignPair = {
  userId?: string;
  name?: string;
  fileId: string;
};

/** 詢案／草稿只寫已承接列；已派出寫全部列。多人不得把譯者交叉掛到別人的檔。 */
export function collabFileAssignmentPairs(input: {
  status: string;
  rows: CollabFileAssignRow[];
}): CollabFileAssignPair[] {
  const requireAccepted = input.status === "draft" || input.status === "inquiry";
  const pairs: CollabFileAssignPair[] = [];
  for (const row of input.rows) {
    if (requireAccepted && !row.accepted) continue;
    const fileId = row.linkedCatFileId?.trim() ?? "";
    if (!fileId) continue;
    const userId = row.translatorUserId?.trim() ?? "";
    const name = row.translator?.trim() ?? "";
    if (userId) pairs.push({ userId, fileId });
    else if (name) pairs.push({ name, fileId });
  }
  return pairs;
}
