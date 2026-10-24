import type { CollabRow } from "@/data/case-types";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

function nullableStringFromJson(value: Json | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function booleanFromJson(value: Json | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function unitCountFromJson(value: Json | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** 讀回共用列：缺單位數或空審稿名不得整列丟掉，否則單列案會只剩表頭。 */
export function collabRowFromJson(x: Json): CollabRow | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.translator !== "string") return undefined;
  const rawTranslationDeadline = x.translationDeadline;
  const translationDeadline: string | null = typeof rawTranslationDeadline === "string" ? rawTranslationDeadline : null;
  const rawReviewDeadline = x.reviewDeadline;
  const reviewDeadline: string | null = typeof rawReviewDeadline === "string" ? rawReviewDeadline : null;
  return {
    id: x.id,
    segment: typeof x.segment === "string" ? x.segment : "",
    translator: x.translator,
    unitCount: unitCountFromJson(x.unitCount),
    accepted: booleanFromJson(x.accepted, false),
    translationDeadline,
    reviewer: typeof x.reviewer === "string" ? x.reviewer : "",
    reviewDeadline,
    taskCompleted: booleanFromJson(x.taskCompleted, false),
    delivered: booleanFromJson(x.delivered, false),
    ...(nullableStringFromJson(x.linkedCatFileId) !== undefined ? { linkedCatFileId: nullableStringFromJson(x.linkedCatFileId) } : {}),
    ...(nullableStringFromJson(x.linkedCatViewId) !== undefined ? { linkedCatViewId: nullableStringFromJson(x.linkedCatViewId) } : {}),
    ...(nullableStringFromJson(x.lineRange) !== undefined ? { lineRange: nullableStringFromJson(x.lineRange) } : {}),
    ...(nullableStringFromJson(x.scopeLabel) !== undefined ? { scopeLabel: nullableStringFromJson(x.scopeLabel) } : {}),
    ...(nullableStringFromJson(x.translatorUserId) !== undefined ? { translatorUserId: nullableStringFromJson(x.translatorUserId) } : {}),
    ...(nullableStringFromJson(x.reviewerUserId) !== undefined ? { reviewerUserId: nullableStringFromJson(x.reviewerUserId) } : {}),
    ...(typeof x.reviewTaskCompleted === "boolean" ? { reviewTaskCompleted: x.reviewTaskCompleted } : {}),
    ...(typeof x.reviewAssigned === "boolean" ? { reviewAssigned: x.reviewAssigned } : {}),
  };
}
