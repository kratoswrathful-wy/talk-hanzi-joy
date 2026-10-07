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
