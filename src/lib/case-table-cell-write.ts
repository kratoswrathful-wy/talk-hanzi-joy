import type { CaseRecord } from "@/data/case-types";
import type { CaseAssignmentMeta } from "@/lib/case-assignment-patch";
import { describeCaseWriteFailure } from "@/lib/case-write-queue";

export type CaseTableWriteKind = "success" | "failed" | "unchanged" | "unknown";

export type CaseTableCellValue = string | boolean | string[] | null;

export type CaseTableWriteItemResult = {
  id: string;
  title: string;
  kind: CaseTableWriteKind;
  reason?: string;
};

const UNKNOWN_WRITE_RE =
  /timed?\s*out|timeout|network|failed to fetch|fetch failed|abort|econnreset|etimedout|\b502\b|\b503\b|\b504\b/i;

export function comparableCellValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => String(item ?? "")));
  return String(value);
}

export function comparableUserId(value: unknown): string {
  return String(value ?? "").trim();
}

export function cellValuesEqual(a: unknown, b: unknown): boolean {
  return comparableCellValue(a) === comparableCellValue(b);
}

export function buildCaseTableCellPartial(
  field: string,
  value: CaseTableCellValue,
  meta?: CaseAssignmentMeta,
): Partial<CaseRecord> {
  if (field === "translator") {
    const names = Array.isArray(value)
      ? value.map((item) => String(item ?? "")).filter((item) => item.trim() !== "")
      : value
        ? [String(value)]
        : [];
    return {
      translator: names,
      translatorUserId: meta?.translatorUserId ?? null,
    };
  }
  if (field === "reviewer") {
    return {
      reviewer: value == null ? "" : String(value),
      reviewerUserId: meta?.reviewerUserId ?? null,
    };
  }
  return { [field]: value } as Partial<CaseRecord>;
}

function readCaseField(current: object, key: string): unknown {
  return (current as Record<string, unknown>)[key];
}

export function isCaseTableCellUnchanged(
  current: object,
  field: string,
  value: CaseTableCellValue,
  meta?: CaseAssignmentMeta,
): boolean {
  const next = buildCaseTableCellPartial(field, value, meta);
  for (const [key, nextValue] of Object.entries(next)) {
    const liveValue = readCaseField(current, key);
    if (key === "translatorUserId" || key === "reviewerUserId") {
      if (comparableUserId(liveValue) !== comparableUserId(nextValue)) return false;
      continue;
    }
    if (!cellValuesEqual(liveValue, nextValue)) return false;
  }
  return true;
}

export function liveRecordMatchesPatch(
  live: object | null | undefined,
  patch: Record<string, unknown>,
): boolean {
  if (!live) return false;
  const bag = live as Record<string, unknown>;
  for (const [key, nextValue] of Object.entries(patch)) {
    const liveValue = bag[key];
    if (key === "translatorUserId" || key === "reviewerUserId") {
      if (comparableUserId(liveValue) !== comparableUserId(nextValue)) return false;
      continue;
    }
    if (!cellValuesEqual(liveValue, nextValue)) return false;
  }
  return true;
}

export function isUnknownCaseWriteError(error: unknown): boolean {
  if (error == null) return false;
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  return UNKNOWN_WRITE_RE.test(message) || UNKNOWN_WRITE_RE.test(code);
}

export function classifyCaseTableWriteError(error: unknown): Exclude<CaseTableWriteKind, "unchanged" | "success"> {
  if (isUnknownCaseWriteError(error)) return "unknown";
  return "failed";
}

export function classifyCaseTableWriteResult(error: unknown | null | undefined): Exclude<CaseTableWriteKind, "unchanged"> {
  if (error == null) return "success";
  return classifyCaseTableWriteError(error);
}

export function classifyAfterReadback(input: {
  writeError: unknown | null | undefined;
  intended: Record<string, unknown>;
  live: object | null | undefined;
  readbackOk: boolean;
}): Exclude<CaseTableWriteKind, "unchanged"> {
  const first = classifyCaseTableWriteResult(input.writeError);
  if (first === "success" || first === "failed") return first;
  if (!input.readbackOk) return "unknown";
  if (liveRecordMatchesPatch(input.live, input.intended)) return "success";
  return "unknown";
}

export function buildCaseTableUndoFieldChanges(
  field: string,
  current: object,
  value: CaseTableCellValue,
  meta?: CaseAssignmentMeta,
): Record<string, { oldValue: unknown; newValue: unknown }> {
  const next = buildCaseTableCellPartial(field, value, meta);
  const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
  for (const [key, newValue] of Object.entries(next)) {
    changes[key] = { oldValue: readCaseField(current, key) ?? null, newValue };
  }
  return changes;
}

export function summarizeCaseTableBatchWrites(items: CaseTableWriteItemResult[]): {
  successCount: number;
  failedCount: number;
  unchangedCount: number;
  unknownCount: number;
} {
  return {
    successCount: items.filter((item) => item.kind === "success").length,
    failedCount: items.filter((item) => item.kind === "failed").length,
    unchangedCount: items.filter((item) => item.kind === "unchanged").length,
    unknownCount: items.filter((item) => item.kind === "unknown").length,
  };
}

export function caseTableBatchDialogTitle(summary: {
  successCount: number;
  failedCount: number;
  unknownCount: number;
  lockedCount?: number;
}): string {
  const blocked = summary.failedCount + summary.unknownCount + (summary.lockedCount ?? 0);
  if (blocked === 0 && summary.successCount > 0) {
    return "批次編輯完成";
  }
  if (summary.successCount === 0 && blocked > 0) {
    return "批次編輯未完成";
  }
  return "批次編輯結果";
}

export function describeCaseTableItemReason(kind: CaseTableWriteKind, error?: unknown): string {
  if (kind === "unchanged") return "內容相同，未重複寫入";
  if (kind === "success") return "已儲存";
  if (kind === "unknown") {
    return "結果不明，請重整後確認，不要再送一次同一變更";
  }
  return describeCaseWriteFailure(error).description;
}

export { describeCaseWriteFailure };
