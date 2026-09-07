import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import {
  syncCatWorkflowAssignmentsForCase,
  broadcastCatWorkflowAssignmentsSynced,
} from "@/lib/cat-workflow-dispatch";
import {
  planDuplicateCaseTitle,
  DEFAULT_DUPLICATE_SORT,
  type DuplicateSortKey,
  type DuplicateSortDir,
  type CaseForDuplicatePlan,
} from "@/lib/case-title-duplicate";
import {
  patchesForFeesAfterCaseRename,
  feeTitleChangeMap,
  patchesForTranslatorInvoicesAfterFeeRenames,
  patchesForClientInvoicesAfterFeeRenames,
  type FeeTitlePatch,
  type InvoiceTitlePatch,
} from "@/lib/case-rename-cascade";
import { feeStore } from "@/stores/fee-store";
import { invoiceStore } from "@/stores/invoice-store";
import { clientInvoiceStore } from "@/stores/client-invoice-store";
import type { CaseRecord, CaseStatus, ToolEntry, ToolEntryField, CaseComment, DeclineRecord, CollabRow, ReviewCollabRow, WorkGroup } from "@/data/case-types";
import { deriveReviewerSummary } from "@/lib/review-rows";
import type { Block } from "@blocknote/core";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import { createCasesVisiblePollFallback } from "@/lib/realtime-poll";
import { AuthRecoverableError, getAuthenticatedUser } from "@/lib/auth-ready";
import { applyCaseUpdate } from "@/lib/apply-case-update";
import {
  buildAdminCreateAssignmentMeta,
  splitDbCasePatch,
  wholeFileReviewerUserId,
} from "@/lib/case-assignment-patch";
import { pmUpdateCaseAssignments } from "@/lib/pm-case-assignment-rpc";
import { adminCreateCase, adminDeleteCase } from "@/lib/case-admin-rpc";
import { buildAdminCreateRpcPayload } from "@/lib/case-create-payload";
import {
  acceptPublicInquiryCase as acceptPublicInquiryCaseRpc,
  acceptInquiryCollabRow as acceptInquiryCollabRowRpc,
  completeCaseCollabRow as completeCaseCollabRowRpc,
  completeCaseReviewRow as completeCaseReviewRowRpc,
  completeCaseTranslation as completeCaseTranslationRpc,
  declinePublicInquiryCase as declinePublicInquiryCaseRpc,
  updateCaseCredentials as updateCaseCredentialsRpc,
  getCaseCredentials,
  updateCasePermittedFields,
  caseRpcErrorKind,
  type CaseCredentials,
  type DeclineInquiryInput,
} from "@/lib/case-action-rpc";
import { caseCredentialAccess } from "@/lib/case-credential-store";
import { CredentialLoadStaleError } from "@/lib/case-credential-access";
import {
  buildDuplicateCredentialPatch,
  credentialsMatchCopied,
  duplicateAbortMessage,
  evaluateSourceCredentials,
  shouldWriteCredentialPatch,
  type DuplicateCredentialPatch,
  type DuplicateToolsAbortReason,
} from "@/lib/case-duplicate-tools";
import { mergeCasePublicSnapshot } from "@/lib/case-public-snapshot";
import type { Database, Json } from "@/integrations/supabase/types";

type DbCase = Database["public"]["Tables"]["cases"]["Row"];
type DbCaseInsert = Database["public"]["Tables"]["cases"]["Insert"];
type DbCaseUpdate = Database["public"]["Tables"]["cases"]["Update"];
type DbCaseVisible = Database["public"]["Views"]["cases_visible"]["Row"];

function asDbCase(row: DbCaseVisible): DbCase {
  // cases_visible 欄位集合與 cases 對齊；view Row 在 generated types 中可為 nullable。
  return row as DbCase;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 將 DB jsonb 陣列逐筆以 `toItem` 驗證轉型為指定型別，不合法的項目略過（不經 as unknown as）。 */
function toTypedArray<T>(value: Json | null | undefined, toItem: (x: Json) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const converted = toItem(item);
    if (converted !== undefined) out.push(converted);
  }
  return out;
}

function nameUrlFromJson(x: Json): { name: string; url: string } | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.name !== "string" || typeof x.url !== "string") return undefined;
  return { name: x.name, url: x.url };
}

function labelUrlFromJson(x: Json): { label: string; url: string } | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.label !== "string" || typeof x.url !== "string") return undefined;
  return { label: x.label, url: x.url };
}

function stringFromJson(x: Json): string | undefined {
  return typeof x === "string" ? x : undefined;
}

/** 讀取 string｜null 欄位；非法型別回傳 undefined（供呼叫端判斷是否要帶入該欄位）。 */
function nullableStringFromJson(x: Json | undefined): string | null | undefined {
  if (x === null) return null;
  if (typeof x === "string") return x;
  return undefined;
}

function internalRecordFromJson(x: Json): { id: string; author: string; text: string; createdAt: string } | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.author !== "string" || typeof x.text !== "string" || typeof x.createdAt !== "string") return undefined;
  return { id: x.id, author: x.author, text: x.text, createdAt: x.createdAt };
}

function caseCommentFromJson(x: Json): CaseComment | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.author !== "string" || typeof x.content !== "string" || typeof x.createdAt !== "string") return undefined;
  const imageUrls = Array.isArray(x.imageUrls) ? x.imageUrls.filter((u): u is string => typeof u === "string") : undefined;
  const fileUrls = Array.isArray(x.fileUrls) ? toTypedArray(x.fileUrls, nameUrlFromJson) : undefined;
  return {
    id: x.id,
    author: x.author,
    content: x.content,
    createdAt: x.createdAt,
    ...(imageUrls && imageUrls.length ? { imageUrls } : {}),
    ...(fileUrls && fileUrls.length ? { fileUrls } : {}),
    ...(typeof x.replyTo === "string" ? { replyTo: x.replyTo } : {}),
  };
}

function declineRecordFromJson(x: Json): DeclineRecord | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.translator !== "string" || typeof x.createdAt !== "string") return undefined;
  return {
    id: x.id,
    translator: x.translator,
    createdAt: x.createdAt,
    ...(typeof x.proposedDeadline === "string" ? { proposedDeadline: x.proposedDeadline } : {}),
    ...(typeof x.availableCount === "number" ? { availableCount: x.availableCount } : {}),
    ...(typeof x.message === "string" ? { message: x.message } : {}),
  };
}

/**
 * BlockNote Block 結構深且多型（props/content/children 依 block type 各異），
 * 此處僅驗證最小必要欄位（id／type 皆為字串）即信任其餘形狀交給編輯器自行容錯，
 * 不做逐欄位重建；單層 `as` 而非 `as unknown as`，符合 check-forbidden-casts 規則。
 */
function blockFromJson(x: Json): Block | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.type !== "string") return undefined;
  return x as Block;
}

function collabRowFromJson(x: Json): CollabRow | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (
    typeof x.id !== "string" || typeof x.segment !== "string" || typeof x.translator !== "string" ||
    typeof x.unitCount !== "number" || typeof x.accepted !== "boolean" ||
    typeof x.reviewer !== "string" ||
    typeof x.taskCompleted !== "boolean" || typeof x.delivered !== "boolean"
  ) return undefined;
  const rawTranslationDeadline = x.translationDeadline;
  const translationDeadline: string | null = typeof rawTranslationDeadline === "string" ? rawTranslationDeadline : null;
  const rawReviewDeadline = x.reviewDeadline;
  const reviewDeadline: string | null = typeof rawReviewDeadline === "string" ? rawReviewDeadline : null;
  return {
    id: x.id,
    segment: x.segment,
    translator: x.translator,
    unitCount: x.unitCount,
    accepted: x.accepted,
    translationDeadline,
    reviewer: x.reviewer,
    reviewDeadline,
    taskCompleted: x.taskCompleted,
    delivered: x.delivered,
    ...(nullableStringFromJson(x.linkedCatFileId) !== undefined ? { linkedCatFileId: nullableStringFromJson(x.linkedCatFileId) } : {}),
    ...(nullableStringFromJson(x.linkedCatViewId) !== undefined ? { linkedCatViewId: nullableStringFromJson(x.linkedCatViewId) } : {}),
    ...(nullableStringFromJson(x.lineRange) !== undefined ? { lineRange: nullableStringFromJson(x.lineRange) } : {}),
    ...(nullableStringFromJson(x.scopeLabel) !== undefined ? { scopeLabel: nullableStringFromJson(x.scopeLabel) } : {}),
    ...(nullableStringFromJson(x.translatorUserId) !== undefined ? { translatorUserId: nullableStringFromJson(x.translatorUserId) } : {}),
    ...(nullableStringFromJson(x.reviewerUserId) !== undefined ? { reviewerUserId: nullableStringFromJson(x.reviewerUserId) } : {}),
  };
}

function reviewCollabRowFromJson(x: Json): ReviewCollabRow | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.reviewer !== "string") return undefined;
  const rawReviewDeadline = x.reviewDeadline;
  const reviewDeadline: string | null = typeof rawReviewDeadline === "string" ? rawReviewDeadline : null;
  return {
    id: x.id,
    segment: typeof x.segment === "string" ? x.segment : "",
    reviewer: x.reviewer,
    reviewDeadline,
    taskCompleted: typeof x.taskCompleted === "boolean" ? x.taskCompleted : false,
    ...(typeof x.accepted === "boolean" ? { accepted: x.accepted } : {}),
    ...(typeof x.migratedFromCaseReviewer === "boolean" ? { migratedFromCaseReviewer: x.migratedFromCaseReviewer } : {}),
    ...(nullableStringFromJson(x.linkedCatFileId) !== undefined ? { linkedCatFileId: nullableStringFromJson(x.linkedCatFileId) } : {}),
    ...(nullableStringFromJson(x.linkedCatViewId) !== undefined ? { linkedCatViewId: nullableStringFromJson(x.linkedCatViewId) } : {}),
    ...(nullableStringFromJson(x.lineRange) !== undefined ? { lineRange: nullableStringFromJson(x.lineRange) } : {}),
    ...(nullableStringFromJson(x.scopeLabel) !== undefined ? { scopeLabel: nullableStringFromJson(x.scopeLabel) } : {}),
    ...(nullableStringFromJson(x.reviewerUserId) !== undefined ? { reviewerUserId: nullableStringFromJson(x.reviewerUserId) } : {}),
  };
}

function toolEntryFieldFromJson(f: Json): ToolEntryField | undefined {
  if (!f || typeof f !== "object" || Array.isArray(f)) return undefined;
  if (typeof f.id !== "string" || typeof f.label !== "string") return undefined;
  return { id: f.id, label: f.label, ...(f.type === "text" || f.type === "file" ? { type: f.type } : {}) };
}

function toolEntryFromJson(x: Json): ToolEntry | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.tool !== "string" || typeof x.fieldValues !== "object" || x.fieldValues === null || Array.isArray(x.fieldValues)) return undefined;
  const fieldValues = jsonRecordOfStrings(x.fieldValues);
  const fields = Array.isArray(x.fields) ? toTypedArray(x.fields, toolEntryFieldFromJson) : undefined;
  const fileValues = (x.fileValues && typeof x.fileValues === "object" && !Array.isArray(x.fileValues))
    ? (() => {
        const out: Record<string, { name: string; url: string }[]> = {};
        for (const [k, v] of Object.entries(x.fileValues as { [key: string]: Json | undefined })) {
          out[k] = Array.isArray(v) ? toTypedArray(v, nameUrlFromJson) : [];
        }
        return out;
      })()
    : undefined;
  return {
    id: x.id,
    tool: x.tool,
    fieldValues,
    ...(fields && fields.length ? { fields } : {}),
    ...(fileValues ? { fileValues } : {}),
  };
}

function simplePersistedLogFromJson(x: Json): SimplePersistedLog | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.changedBy !== "string" || typeof x.description !== "string" || typeof x.timestamp !== "string") return undefined;
  return {
    id: x.id,
    changedBy: x.changedBy,
    description: x.description,
    timestamp: x.timestamp,
    ...(typeof x.fieldKey === "string" ? { fieldKey: x.fieldKey } : {}),
  };
}

function workGroupFromJson(x: Json): WorkGroup | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.id !== "string" || typeof x.workType !== "string" || typeof x.billingUnit !== "string" || typeof x.unitCount !== "number") return undefined;
  return { id: x.id, workType: x.workType, billingUnit: x.billingUnit, unitCount: x.unitCount };
}

/** 將 app 內部型別安全轉為 DB jsonb 可接受的 `Json`（走一次 JSON 序列化／反序列化，確保結構為純 Json）。 */
function toJson<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value ?? null));
}

function jsonRecordOfStrings(value: Json | null | undefined): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

type Listener = () => void;

let cases: CaseRecord[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;
let loadVersion = 0; // version counter to discard stale loads
const listeners = new Set<Listener>();
let currentUserId: string | null = null;

// Track in-flight optimistic updates to prevent poll/realtime from overwriting
const pendingUpdates = new Map<string, Partial<CaseRecord>>();
// Count concurrent in-flight writes per case to avoid premature pending cleanup
const inFlightCount = new Map<string, number>();
// Keep pending patches for a short grace window after successful write (handles replica lag)
const pendingCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PENDING_CLEANUP_DELAY_MS = 5000;

function notify() {
  listeners.forEach((l) => l());
}

/**
 * P0-A：公開 view 快照以較新者完整取代；禁止用本地「較豐富」tools／憑證補回遮罩空值。
 * （PR #80 Auth 的 loadVersion／TOKEN_REFRESHED 短路另見 load／onAuthStateChange。）
 */
function mergeIncomingCase(current: CaseRecord | undefined, incoming: CaseRecord): CaseRecord {
  return mergeCasePublicSnapshot(current, incoming);
}

// ── DB ↔ App mapping ──

function fromDb(row: DbCase): CaseRecord {
  // Build workGroups from DB or migrate from legacy fields
  const workGroupsRaw = toTypedArray(row.work_groups, workGroupFromJson);
  const legacyWorkTypes = toTypedArray(row.work_type, stringFromJson);
  const workGroups: WorkGroup[] = workGroupsRaw.length > 0
    ? workGroupsRaw
    : legacyWorkTypes.length > 0
      ? legacyWorkTypes.map((wt, i) => ({
          id: `wg-migrate-${i}`,
          workType: wt,
          billingUnit: row.billing_unit ?? "",
          unitCount: i === 0 ? (Number(row.unit_count) || 0) : 0,
        }))
      : [{ id: `wg-default`, workType: "", billingUnit: "", unitCount: 0 }];

  const clientCaseLinkRaw = row.client_case_link;
  const clientCaseLink =
    clientCaseLinkRaw && typeof clientCaseLinkRaw === "object" && !Array.isArray(clientCaseLinkRaw) &&
    typeof clientCaseLinkRaw.url === "string" && typeof clientCaseLinkRaw.label === "string"
      ? { url: clientCaseLinkRaw.url, label: clientCaseLinkRaw.label }
      : { url: "", label: "" };

  // revision：migration 驗證前 types 可能尚無此欄；暫以窄化讀取（R1-E 重生 types 後可改回 row.revision）
  const rowRevision = (row as DbCase & { revision?: number | null }).revision;

  return {
    id: row.id,
    revision: typeof rowRevision === "number" ? rowRevision : 0,
    title: row.title ?? "",
    status: (row.status || "draft") as CaseStatus,
    client: row.client ?? "",
    contact: row.contact ?? "",
    keyword: row.keyword ?? "",
    clientPoNumber: row.client_po_number ?? "",
    clientCaseLink,
    dispatchRoute: row.dispatch_route ?? "",
    category: row.category ?? "",
    workType: legacyWorkTypes,
    workGroups,
    processNote: row.process_note ?? "",
    billingUnit: row.billing_unit ?? "",
    unitCount: Number(row.unit_count) || 0,
    inquiryNote: row.inquiry_note ?? "",
    translator: toTypedArray(row.translator, stringFromJson),
    translationDeadline: row.translation_deadline,
    reviewDeadline: row.review_deadline,

    executionTool: row.execution_tool ?? "",
    toolFieldValues: jsonRecordOfStrings(row.tool_field_values),
    catToolEnabled: row.cat_tool_enabled ?? false,
    tools: toTypedArray(row.tools, toolEntryFromJson),
    questionTools: toTypedArray(row.question_tools, toolEntryFromJson),
    deliveryMethod: row.delivery_method ?? "",
    deliveryMethodFiles: toTypedArray(row.delivery_method_files, nameUrlFromJson),
    clientReceipt: row.client_receipt ?? "",
    clientReceiptFiles: toTypedArray(row.client_receipt_files, nameUrlFromJson),
    customGuidelinesUrl: toTypedArray(row.custom_guidelines_url, nameUrlFromJson),
    clientGuidelines: toTypedArray(row.client_guidelines, nameUrlFromJson),
    commonInfo: toTypedArray(row.common_info, labelUrlFromJson),
    commonLinks: toTypedArray(row.common_links, stringFromJson),
    internalNoteForm: row.internal_note_form ?? false,
    clientQuestionForm: row.client_question_form ?? false,
    workingFiles: toTypedArray(row.working_files, nameUrlFromJson),
    otherLoginInfo: row.other_login_info ?? "",
    loginAccount: row.login_account ?? "",
    loginPassword: row.login_password ?? "",
    onlineToolProject: row.online_tool_project ?? "",
    onlineToolFilename: row.online_tool_filename ?? "",
    sourceFiles: toTypedArray(row.source_files, nameUrlFromJson),
    seriesReferenceMaterials: toTypedArray(row.series_reference_materials, nameUrlFromJson),
    caseReferenceMaterials: toTypedArray(row.case_reference_materials, nameUrlFromJson),
    referenceMaterials: toTypedArray(row.reference_materials, nameUrlFromJson),
    questionForm: row.question_form ?? "",
    translatorFinal: toTypedArray(row.translator_final, nameUrlFromJson),
    internalReviewFinal: toTypedArray(row.internal_review_final, nameUrlFromJson),
    trackChanges: toTypedArray(row.track_changes, nameUrlFromJson),
    feeEntry: row.fee_entry ?? "",
    internalRecords: toTypedArray(row.internal_records, internalRecordFromJson),
    comments: toTypedArray(row.comments, caseCommentFromJson),
    internalComments: toTypedArray(row.internal_comments, caseCommentFromJson),
    bodyContent: toTypedArray(row.body_content, blockFromJson),
    multiCollab: row.multi_collab ?? false,
    collabCount: Number(row.collab_count) || 0,
    collabRows: toTypedArray(row.collab_rows, collabRowFromJson),
    reviewRows: toTypedArray(row.review_rows, reviewCollabRowFromJson),
    // reviewer：優先由 review_rows 衍生；遷移前／空列時 fallback DB 欄
    reviewer: (() => {
      const fromRows = deriveReviewerSummary(toTypedArray(row.review_rows, reviewCollabRowFromJson));
      return fromRows || (row.reviewer ?? "");
    })(),
    declineRecords: toTypedArray(row.decline_records, declineRecordFromJson),
    iconUrl: row.icon_url ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    inquirySlackRecords: toTypedArray(row.inquiry_slack_records, stringFromJson),
    updatedAt: row.updated_at,
    edit_logs: toTypedArray(row.edit_logs, simplePersistedLogFromJson),
    changeLogEnabledAt: row.change_log_enabled_at ?? undefined,
  };
}

function toDb(c: Partial<CaseRecord>): DbCaseUpdate {
  const map: DbCaseUpdate = {};
  if (c.title !== undefined) map.title = c.title;
  if (c.status !== undefined) map.status = c.status;
  if (c.client !== undefined) map.client = c.client;
  if (c.contact !== undefined) map.contact = c.contact;
  if (c.keyword !== undefined) map.keyword = c.keyword;
  if (c.clientPoNumber !== undefined) map.client_po_number = c.clientPoNumber;
  if (c.clientCaseLink !== undefined) map.client_case_link = toJson(c.clientCaseLink);
  if (c.dispatchRoute !== undefined) map.dispatch_route = c.dispatchRoute;
  if (c.category !== undefined) map.category = c.category;
  if (c.workType !== undefined) map.work_type = toJson(c.workType);
  if (c.workGroups !== undefined) {
    map.work_groups = toJson(c.workGroups);
    // Keep legacy columns in sync for backward compatibility
    map.work_type = toJson(c.workGroups.map((g) => g.workType).filter(Boolean));
    if (c.workGroups[0]) {
      map.billing_unit = c.workGroups[0].billingUnit || "";
      map.unit_count = Number(c.workGroups[0].unitCount) || 0;
    }
  }
  if (c.processNote !== undefined) map.process_note = c.processNote;
  if (c.billingUnit !== undefined) map.billing_unit = c.billingUnit;
  if (c.unitCount !== undefined) map.unit_count = c.unitCount;
  if (c.inquiryNote !== undefined) map.inquiry_note = c.inquiryNote;
  if (c.translator !== undefined) map.translator = toJson(c.translator);
  if (c.translationDeadline !== undefined) map.translation_deadline = c.translationDeadline;
  if (c.reviewer !== undefined) map.reviewer = c.reviewer;
  if (c.reviewDeadline !== undefined) map.review_deadline = c.reviewDeadline;

  if (c.executionTool !== undefined) map.execution_tool = c.executionTool;
  // 敏感工具值／憑證：禁止經一般 toDb／apply_case_update 回寫；只走 updateCredentials RPC。
  if (c.catToolEnabled !== undefined) map.cat_tool_enabled = c.catToolEnabled;
  if (c.deliveryMethod !== undefined) map.delivery_method = c.deliveryMethod;
  if (c.deliveryMethodFiles !== undefined) map.delivery_method_files = toJson(c.deliveryMethodFiles);
  if (c.clientReceipt !== undefined) map.client_receipt = c.clientReceipt;
  if (c.clientReceiptFiles !== undefined) map.client_receipt_files = toJson(c.clientReceiptFiles);
  if (c.customGuidelinesUrl !== undefined) map.custom_guidelines_url = toJson(c.customGuidelinesUrl);
  if (c.clientGuidelines !== undefined) map.client_guidelines = toJson(c.clientGuidelines);
  if (c.commonInfo !== undefined) map.common_info = toJson(c.commonInfo);
  if (c.commonLinks !== undefined) map.common_links = toJson(c.commonLinks);
  if (c.internalNoteForm !== undefined) map.internal_note_form = c.internalNoteForm;
  if (c.clientQuestionForm !== undefined) map.client_question_form = c.clientQuestionForm;
  if (c.workingFiles !== undefined) map.working_files = toJson(c.workingFiles);
  // loginAccount／loginPassword／otherLoginInfo：禁止經一般 patch 回寫
  if (c.onlineToolProject !== undefined) map.online_tool_project = c.onlineToolProject;
  if (c.onlineToolFilename !== undefined) map.online_tool_filename = c.onlineToolFilename;
  if (c.sourceFiles !== undefined) map.source_files = toJson(c.sourceFiles);
  if (c.seriesReferenceMaterials !== undefined) map.series_reference_materials = toJson(c.seriesReferenceMaterials);
  if (c.caseReferenceMaterials !== undefined) map.case_reference_materials = toJson(c.caseReferenceMaterials);
  if (c.referenceMaterials !== undefined) map.reference_materials = toJson(c.referenceMaterials);
  if (c.questionForm !== undefined) map.question_form = c.questionForm;
  if (c.translatorFinal !== undefined) map.translator_final = toJson(c.translatorFinal);
  if (c.internalReviewFinal !== undefined) map.internal_review_final = toJson(c.internalReviewFinal);
  if (c.trackChanges !== undefined) map.track_changes = toJson(c.trackChanges);
  if (c.feeEntry !== undefined) map.fee_entry = c.feeEntry;
  if (c.internalRecords !== undefined) map.internal_records = toJson(c.internalRecords);
  if (c.comments !== undefined) map.comments = toJson(c.comments);
  if (c.internalComments !== undefined) map.internal_comments = toJson(c.internalComments);
  if (c.bodyContent !== undefined) map.body_content = toJson(c.bodyContent);
  if (c.multiCollab !== undefined) map.multi_collab = c.multiCollab;
  if (c.collabCount !== undefined) map.collab_count = c.collabCount;
  if (c.collabRows !== undefined) map.collab_rows = toJson(c.collabRows);
  if (c.reviewRows !== undefined) {
    map.review_rows = toJson(c.reviewRows);
    // 寫入 review_rows 時同步衍生 cases.reviewer（清單／舊欄相容；不再驅動 sync）
    map.reviewer = deriveReviewerSummary(c.reviewRows);
  }
  if (c.declineRecords !== undefined) map.decline_records = toJson(c.declineRecords);
  if (c.iconUrl !== undefined) map.icon_url = c.iconUrl;
  // createdBy：僅供本地/UI；建案 RPC 由 server 依 session 寫入，不得經 p_payload 傳送。
  if (c.inquirySlackRecords !== undefined) map.inquiry_slack_records = toJson(c.inquirySlackRecords);
  if (c.edit_logs !== undefined) map.edit_logs = toJson(c.edit_logs);
  if (c.changeLogEnabledAt !== undefined) map.change_log_enabled_at = c.changeLogEnabledAt;
  return map;
}

// ── Public API ──

/**
 * 僅載入單一案件（詳情頁優先路徑，避免等待全表 `select("*")` 逾時／阻塞）。
 * 若記憶體已有該筆則立即回傳；否則向 DB 取一列並合入 `cases`。
 */
async function loadCaseIfMissing(id: string): Promise<CaseRecord | undefined> {
  const existing = getById(id);
  if (existing) return existing;

  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof AuthRecoverableError) return undefined;
    throw e;
  }
  if (!user) return undefined;

  const env = getEnvironment();
  const { data, error } = await supabase
    .from("cases_visible")
    .select("*")
    .eq("id", id)
    .eq("env", env)
    .maybeSingle();

  if (error) {
    console.error("[case-store] loadCaseIfMissing", errorMessage(error));
    return undefined;
  }
  if (!data) return undefined;

  const incoming = fromDb(asDbCase(data));
  const current = getById(id);
  const merged = mergeIncomingCase(current, incoming);
  const idx = cases.findIndex((c) => c.id === id);
  if (idx >= 0) {
    cases = cases.map((c, i) => (i === idx ? merged : c));
  } else {
    cases = [merged, ...cases];
  }
  notify();
  return merged;
}

async function load() {
  if (loadPromise) return loadPromise;
  const version = ++loadVersion;
  loadPromise = (async () => {
    try {
      const user = await getAuthenticatedUser();
      if (version !== loadVersion) return;

      if (!user) {
        cases = [];
        loaded = false;
        loadPromise = null;
        notify();
        return;
      }

      const env = getEnvironment();
      // 工項 D：讀取一律走遮罩 view；寫入仍走 cases 原表。
      const { data, error } = await supabase
        .from("cases_visible")
        .select("*")
        .eq("env", env)
        .order("created_at", { ascending: false });
      if (version !== loadVersion) return;

      if (error) {
        console.error("[case-store] full load failed", errorMessage(error));
        cases = [];
        loaded = true;
        loadPromise = null;
        notify();
        return;
      }

      const currentById = new Map(cases.map((c) => [c.id, c] as const));
      let fetched = (data || [])
        .map((row) => fromDb(asDbCase(row)))
        .map((incoming) => mergeIncomingCase(currentById.get(incoming.id), incoming));

      if (pendingUpdates.size > 0) {
        fetched = fetched.map((c) => {
          const pending = pendingUpdates.get(c.id);
          return pending ? { ...c, ...pending } : c;
        });
        // 剛 create、尚未進本次 SELECT 的列：保留本地，避免整表覆寫「找不到案件」
        for (const [id, pending] of pendingUpdates) {
          if (fetched.some((c) => c.id === id)) continue;
          const local = currentById.get(id);
          if (local) {
            fetched = [{ ...local, ...pending }, ...fetched];
          }
        }
      }
      cases = fetched;
      loaded = true;
      notify();
    } catch (e) {
      console.error("[case-store] load", e);
      loadPromise = null;
      notify();
    }
  })();
  return loadPromise;
}

function getAll(): CaseRecord[] {
  if (!loaded) load();
  return cases;
}

/** True after the first full load attempt for the current session (success or failure). */
function isLoaded(): boolean {
  return loaded;
}

function getById(id: string): CaseRecord | undefined {
  return cases.find((c) => c.id === id);
}

async function create(partial: Partial<CaseRecord>): Promise<CaseRecord | null> {
  const user = await getAuthenticatedUser().catch((e) => {
    if (e instanceof AuthRecoverableError) return null;
    throw e;
  });
  if (!user) return null;
  const id = crypto.randomUUID();
  const rpcPayload = buildAdminCreateRpcPayload(toDb(partial));
  const createMeta = buildAdminCreateAssignmentMeta(partial as Record<string, unknown>);
  if (createMeta.translatorUserId) {
    rpcPayload.translator_user_id = createMeta.translatorUserId;
  }
  const reviewerUid =
    createMeta.reviewerUserId ?? wholeFileReviewerUserId(partial.reviewRows);
  if (reviewerUid) {
    rpcPayload.reviewer_user_id = reviewerUid;
  }
  // P0-C：建案走 admin_create_case RPC；p_case_id 獨立參數，env/created_by 由 server 產生。
  const { error: createError } = await adminCreateCase(supabase, id, rpcPayload);
  if (createError) {
    console.error("[case-store] create failed", errorMessage(createError), {
      payloadKeys: Object.keys(rpcPayload),
    });
    return null;
  }
  const { data, error } = await supabase
    .from("cases_visible")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) {
    console.error("[case-store] create readback failed", errorMessage(error), { id });
    return null;
  }
  const record = fromDb(asDbCase(data));
  cases = [record, ...cases];
  pendingUpdates.set(record.id, { title: record.title, status: record.status });
  const existingTimer = pendingCleanupTimers.get(record.id);
  if (existingTimer) clearTimeout(existingTimer);
  pendingCleanupTimers.set(
    record.id,
    setTimeout(() => {
      pendingUpdates.delete(record.id);
      pendingCleanupTimers.delete(record.id);
    }, PENDING_CLEANUP_DELAY_MS),
  );
  notify();
  return record;
}

async function update(id: string, partial: Partial<CaseRecord>) {
  const prev = getById(id);
  const shouldSyncCatAssignments =
    !!prev &&
    prev.status !== "dispatched" &&
    partial.status === "dispatched";
  const nextStatus = partial.status ?? prev?.status;
  const revertWorkflowStatuses = ["draft", "inquiry", "dispatched"] as const;
  const shouldSyncCatWorkflowOnStatusRevert =
    !!prev &&
    partial.status !== undefined &&
    partial.status !== prev.status &&
    (revertWorkflowStatuses as readonly string[]).includes(partial.status);
  // 派案重構：過度同步策略──任一派案相關欄位變動即重跑（同步函式冪等，寧可多跑不漏跑）。
  void shouldSyncCatWorkflowOnStatusRevert;
  void nextStatus;
  const shouldSyncCatWorkflowAssignments =
    !!prev &&
    (partial.collabRows !== undefined ||
      partial.reviewRows !== undefined ||
      partial.reviewer !== undefined ||
      partial.translator !== undefined ||
      partial.multiCollab !== undefined ||
      (partial.status !== undefined && partial.status !== prev.status));
  let merged: Partial<CaseRecord> = partial;
  if (
    prev &&
    partial.status === "dispatched" &&
    prev.status !== "dispatched" &&
    !prev.changeLogEnabledAt
  ) {
    merged = { ...partial, changeLogEnabledAt: new Date().toISOString() };
  }

  const mapped = toDb(merged);
  mapped.updated_at = new Date().toISOString();

  // Optimistic update BEFORE DB write to prevent poll/realtime from overwriting
  const updatedAt = mapped.updated_at;
  cases = cases.map((c) => (c.id === id ? { ...c, ...merged, updatedAt } : c));

  // Merge with existing pending updates instead of replacing to avoid losing concurrent writes
  pendingUpdates.set(id, { ...pendingUpdates.get(id), ...merged });
  inFlightCount.set(id, (inFlightCount.get(id) || 0) + 1);

  // If a delayed cleanup was scheduled, cancel it because we have a new write.
  const cleanupTimer = pendingCleanupTimers.get(id);
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    pendingCleanupTimers.delete(id);
  }

  notify();

  const user = await getAuthenticatedUser().catch((e) => {
    if (e instanceof AuthRecoverableError) return null;
    throw e;
  });
  const { data: roleRows } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
    : { data: null };
  const isAdmin = (roleRows ?? []).some(
    (row) => row.role === "pm" || row.role === "executive",
  );

  let error: Error | { message: string } | null;
  let nextRevision: number | undefined;
  if (isAdmin) {
    let revision = prev?.revision ?? 0;
    const assignmentMeta = {
      translatorUserId: (partial as { translatorUserId?: string | null }).translatorUserId,
      reviewerUserId: (partial as { reviewerUserId?: string | null }).reviewerUserId,
    };
    const { assignment, general } = splitDbCasePatch(
      mapped as Record<string, unknown>,
      assignmentMeta,
    );

    if (Object.keys(assignment).length > 0) {
      const assignResult = await pmUpdateCaseAssignments(
        supabase,
        id,
        assignment,
        revision,
      );
      error = assignResult.error;
      if (!error && typeof assignResult.data?.revision === "number") {
        revision = assignResult.data.revision;
        nextRevision = revision;
      }
    }

    if (!error && Object.keys(general).length > 0) {
      const result = await applyCaseUpdate(
        supabase,
        id,
        general,
        revision,
      );
      error = result.error;
      nextRevision = error
        ? undefined
        : (typeof result.data?.revision === "number"
            ? result.data.revision
            : revision + 1);
    } else if (!error && Object.keys(assignment).length > 0 && nextRevision === undefined) {
      nextRevision = revision;
    }
  } else {
    const permittedKeys = new Set<keyof CaseRecord>([
      "title", "bodyContent", "category", "workType", "workGroups",
      "client", "contact", "keyword", "clientPoNumber", "clientCaseLink",
      "dispatchRoute", "processNote", "billingUnit", "unitCount", "inquiryNote",
      "deliveryMethod", "deliveryMethodFiles", "clientReceipt",
      "clientReceiptFiles", "customGuidelinesUrl", "clientGuidelines",
      "commonInfo", "commonLinks", "workingFiles", "sourceFiles",
      "seriesReferenceMaterials", "caseReferenceMaterials", "referenceMaterials",
      "questionForm", "translatorFinal", "internalReviewFinal", "trackChanges",
      "internalComments",
    ]);
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(merged)) {
      if (permittedKeys.has(key as keyof CaseRecord) && value !== undefined) {
        changes[key] = JSON.parse(JSON.stringify(value));
      }
    }
    const result = await updateCasePermittedFields(
      supabase,
      id,
      prev?.revision ?? -1,
      changes,
    );
    error = result.error;
    nextRevision = result.data?.revision;
  }

  if (!error && nextRevision !== undefined) {
    cases = cases.map((c) => (c.id === id ? { ...c, revision: nextRevision } : c));
  }

  const remaining = (inFlightCount.get(id) || 1) - 1;
  if (remaining <= 0) {
    inFlightCount.delete(id);

    // Keep pending patch briefly after success to guard against stale poll/realtime snapshots.
    const timer = setTimeout(() => {
      pendingUpdates.delete(id);
      pendingCleanupTimers.delete(id);
    }, PENDING_CLEANUP_DELAY_MS);
    pendingCleanupTimers.set(id, timer);
  } else {
    inFlightCount.set(id, remaining);
  }

  if (error) {
    // On failure, clear pending state then reload to restore correct state.
    const timer = pendingCleanupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      pendingCleanupTimers.delete(id);
    }
    pendingUpdates.delete(id);
    inFlightCount.delete(id);

    loadPromise = null;
    await load();
  }

  if (!error && shouldSyncCatAssignments) {
    try {
      await supabase.rpc("lms_sync_cat_file_assignments_for_case", { p_case_id: id });
    } catch (e) {
      console.warn("[case-store] sync CAT assignments skipped:", e);
    }
  }

  if (!error && shouldSyncCatWorkflowAssignments) {
    try {
      await syncCatWorkflowAssignmentsForCase(supabase, id);
      broadcastCatWorkflowAssignmentsSynced(id);
    } catch (e) {
      console.warn("[case-store] sync CAT workflow assignments skipped:", e);
    }
  }

  return error;
}

function applyActionResult(
  id: string,
  result: { revision: number; status?: string } | null | undefined,
) {
  if (!result) return;
  cases = cases.map((c) =>
    c.id === id
      ? {
          ...c,
          revision: result.revision,
          ...(result.status ? { status: result.status as CaseStatus } : {}),
        }
      : c,
  );
  notify();
}

async function refreshAfterCaseAction(id: string) {
  loadPromise = null;
  await load();
  return getById(id);
}

async function acceptPublicInquiry(id: string) {
  const current = getById(id);
  const result = await acceptPublicInquiryCaseRpc(
    supabase,
    id,
    current?.revision ?? -1,
  );
  if (!result.error) {
    applyActionResult(id, result.data);
    await refreshAfterCaseAction(id);
  }
  return result.error;
}

async function declinePublicInquiry(id: string, decline: DeclineInquiryInput) {
  const current = getById(id);
  const result = await declinePublicInquiryCaseRpc(
    supabase,
    id,
    current?.revision ?? -1,
    decline,
  );
  if (!result.error) {
    applyActionResult(id, result.data);
    await refreshAfterCaseAction(id);
  }
  return result.error;
}

async function acceptInquiryCollabRow(id: string, rowId: string) {
  const current = getById(id);
  const result = await acceptInquiryCollabRowRpc(
    supabase,
    id,
    rowId,
    current?.revision ?? -1,
  );
  if (!result.error) {
    applyActionResult(id, result.data);
    await refreshAfterCaseAction(id);
  }
  return result.error;
}

async function completeCaseCollabRow(id: string, rowId: string) {
  const current = getById(id);
  const result = await completeCaseCollabRowRpc(
    supabase,
    id,
    rowId,
    current?.revision ?? -1,
  );
  if (!result.error) {
    applyActionResult(id, result.data);
    await refreshAfterCaseAction(id);
  }
  return result.error;
}

async function completeCaseTranslation(id: string) {
  const current = getById(id);
  const result = await completeCaseTranslationRpc(
    supabase,
    id,
    current?.revision ?? -1,
  );
  if (!result.error) {
    applyActionResult(id, result.data);
    await refreshAfterCaseAction(id);
  }
  return result.error;
}

async function completeCaseReviewRow(id: string, rowId: string) {
  const current = getById(id);
  const result = await completeCaseReviewRowRpc(
    supabase,
    id,
    rowId,
    current?.revision ?? -1,
  );
  if (!result.error) {
    applyActionResult(id, result.data);
    await refreshAfterCaseAction(id);
  }
  return result.error;
}

async function updateCredentials(id: string, credentials: Record<string, unknown>) {
  const current = getById(id);
  const result = await updateCaseCredentialsRpc(
    supabase,
    id,
    current?.revision ?? -1,
    credentials,
  );
  if (!result.error) {
    applyActionResult(id, result.data);
    // 讀回由 persist 層負責；此處只刷新公開 view，不 clear 憑證快取。
    await refreshAfterCaseAction(id);
  }
  return result.error;
}

async function remove(id: string) {
  const current = getById(id);
  const { error } = await adminDeleteCase(supabase, id, current?.revision ?? 0);
  if (!error) {
    cases = cases.filter((c) => c.id !== id);
    caseCredentialAccess.clear(id);
    notify();
  }
  return error;
}

function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function reset() {
  loaded = false;
  loadPromise = null;
  cases = [];
  currentUserId = null;

  pendingUpdates.clear();
  inFlightCount.clear();
  pendingCleanupTimers.forEach((timer) => clearTimeout(timer));
  pendingCleanupTimers.clear();
  caseCredentialAccess.clearAll();
  pendingToolCopies.clear();
}

// Listen for auth changes — only reload on sign-in to avoid race conditions
supabase.auth.onAuthStateChange((event, session) => {
  const nextUserId = session?.user?.id ?? null;

  // Token refresh (common when tab regains focus) does not change the user; resetting would
  // clear `loaded` and flash the full-page loader on CasesPage. For UX, skip reload on refresh.
  if (event === "TOKEN_REFRESHED") {
    loadPromise = null;
    return;
  }

  // If user didn't actually change (e.g. INITIAL_SESSION firing again), avoid reset/load.
  if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && loaded && currentUserId && nextUserId && currentUserId === nextUserId) {
    return;
  }

  // For real session transitions, reset then reload.
  reset();
  currentUserId = nextUserId;
  if (event === "SIGNED_OUT") return;
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    void load();
  }
});

// Realtime subscription – sync changes from other users.
// 工項 D：禁止訂閱 cases 原表（WS payload 含未遮罩敏感欄）。改訂閱 case_change_signals
//（僅 case_id／env／op），再重查 cases_visible；DELETE 信號則從本地移除。
async function requeryCaseFromView(id: string) {
  const env = getEnvironment();
  const { data, error } = await supabase
    .from("cases_visible")
    .select("*")
    .eq("id", id)
    .eq("env", env)
    .maybeSingle();
  if (error) {
    console.error("[case-store] Failed to re-query case from cases_visible:", errorMessage(error));
    return;
  }
  if (!data) {
    if (cases.some((c) => c.id === id)) {
      cases = cases.filter((c) => c.id !== id);
      notify();
    }
    return;
  }
  if (pendingUpdates.has(id)) return;
  const incoming = fromDb(asDbCase(data));
  const current = getById(id);
  const merged = mergeIncomingCase(current, incoming);
  if (cases.some((c) => c.id === id)) {
    cases = cases.map((c) => (c.id === id ? merged : c));
  } else {
    cases = [merged, ...cases];
  }
  notify();
}

type CaseChangeSignalRow = {
  case_id: string;
  env?: string;
  op?: string;
};

supabase
  .channel("case-change-signals")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "case_change_signals" },
    (payload) => {
      const env = getEnvironment();
      const row = payload.new as CaseChangeSignalRow;
      if (!row?.case_id || row.env !== env) return;
      if (row.op === "DELETE") {
        if (cases.some((c) => c.id === row.case_id)) {
          cases = cases.filter((c) => c.id !== row.case_id);
          notify();
        }
        return;
      }
      void requeryCaseFromView(row.case_id);
    }
  )
  .subscribe();

export type CaseDuplicateSort = { key: DuplicateSortKey; dir: DuplicateSortDir };

export interface CaseDuplicateShared {
  newCase: CaseRecord;
  sourceCaseId: string;
  renames: { oldTitle: string; newTitle: string }[];
  feePatches: FeeTitlePatch[];
  translatorInvoicePatches: InvoiceTitlePatch[];
  clientInvoicePatches: InvoiceTitlePatch[];
}

export type CaseDuplicateOutcome =
  | {
      ok: false;
      created: false;
      reason: DuplicateToolsAbortReason;
      message: string;
    }
  | ({
      ok: true;
      created: true;
      toolsStatus: "copied" | "skipped_empty";
    } & CaseDuplicateShared)
  | ({
      ok: false;
      created: true;
      toolsStatus: "pending";
      message: string;
    } & CaseDuplicateShared);

/** @deprecated 使用 CaseDuplicateOutcome */
export type CaseDuplicateResult = CaseDuplicateOutcome;

type PendingToolCopy = { sourceCaseId: string; message: string };

const pendingToolCopies = new Map<string, PendingToolCopy>();

export type SourceCredentialsLoadResult =
  | { ok: true; credentials: CaseCredentials }
  | { ok: false; created: false; reason: DuplicateToolsAbortReason; message: string };

function abortDuplicate(reason: DuplicateToolsAbortReason): CaseDuplicateOutcome {
  return { ok: false, created: false, reason, message: duplicateAbortMessage(reason) };
}

function peekPendingDuplicateTools(caseId: string): PendingToolCopy | undefined {
  return pendingToolCopies.get(caseId);
}

function setPendingToolCopy(caseId: string, pending: PendingToolCopy | null) {
  if (pending) pendingToolCopies.set(caseId, pending);
  else pendingToolCopies.delete(caseId);
  notify();
}

async function loadSourceCredentialsForCopy(
  sourceCaseId: string,
  userId: string,
): Promise<SourceCredentialsLoadResult> {
  let loaded: CaseCredentials | undefined;
  try {
    loaded = await caseCredentialAccess.load(sourceCaseId);
  } catch (e) {
    if (e instanceof CredentialLoadStaleError) {
      loaded = caseCredentialAccess.peekConfirmed(sourceCaseId);
    }
    if (!loaded) {
      return {
        ok: false,
        created: false,
        reason: "source_credentials_unavailable",
        message: duplicateAbortMessage("source_credentials_unavailable"),
      };
    }
  }
  const evaluated = evaluateSourceCredentials({
    sourceCaseId,
    credentials: loaded,
    sourceChannel: "credentials_rpc",
    activeUserId: userId,
  });
  if (evaluated.ok === false) {
    return { ok: false, created: false, reason: evaluated.reason, message: evaluated.message };
  }
  return { ok: true, credentials: evaluated.credentials };
}

async function writeCopiedCredentials(
  targetId: string,
  patch: DuplicateCredentialPatch,
  expectedRevision: number,
): Promise<{ status: "ok" | "already_present" | "failed"; message?: string }> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { status: "failed", message: "新案件版本號不明，未寫入工具、未再建案。" };
  }
  const result = await updateCaseCredentialsRpc(
    supabase,
    targetId,
    expectedRevision,
    patch,
  );
  const verifyLoaded = async () => {
    const { data, error } = await getCaseCredentials(supabase, targetId);
    if (error || !data) throw error ?? new Error("credential_access_failed");
    return credentialsMatchCopied(patch, { ...data, caseId: targetId });
  };

  if (result.error) {
    const kind = caseRpcErrorKind(result.error);
    try {
      if (await verifyLoaded()) {
        if (result.data) applyActionResult(targetId, result.data);
        await refreshAfterCaseAction(targetId);
        return { status: "already_present" };
      }
    } catch {
      // 讀回也失敗：結果未知，不盲目重送
    }
    return {
      status: "failed",
      message:
        kind === "unknown"
          ? "工具保存結果未知，已先查證、未重送。可用新案識別重試，不會再建一筆。"
          : `新案件已建立，但工具尚未寫入：${errorMessage(result.error)}`,
    };
  }

  applyActionResult(targetId, result.data);
  try {
    if (!(await verifyLoaded())) {
      return { status: "failed", message: "工具已寫入、讀回不一致，未重送。可用新案識別重試。" };
    }
  } catch {
    return { status: "failed", message: "工具已寫入、尚未確認讀回，未重送。可用新案識別重試。" };
  }
  await refreshAfterCaseAction(targetId);
  return { status: "ok" };
}

async function duplicate(
  id: string,
  sort: CaseDuplicateSort = DEFAULT_DUPLICATE_SORT
): Promise<CaseDuplicateOutcome> {
  try {
    const source = cases.find((c) => c.id === id);
    if (!source) return abortDuplicate("source_not_found");

    const user = await getAuthenticatedUser().catch((e) => {
      if (e instanceof AuthRecoverableError) return null;
      throw e;
    });
    if (!user) return abortDuplicate("session_mismatch");

    const sourceReady = await loadSourceCredentialsForCopy(id, user.id);
    if (sourceReady.ok === false) return sourceReady;
    const credentialPatch = buildDuplicateCredentialPatch(sourceReady.credentials);
    const needsToolWrite = shouldWriteCredentialPatch(credentialPatch);

    const {
      id: _id, createdAt, updatedAt, createdBy, comments: _c, internalComments: _ic,
      // Important: duplicate should not inherit Slack inquiry lock history.
      // Excluding here (rather than deleting later) ensures DB default ([]) is used.
      inquirySlackRecords: _isr,
      ...rest
    } = source;

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const todayStr = `${yy}${mm}${dd}`;
  const createdAtIso = now.toISOString();

  const casePlans: CaseForDuplicatePlan[] = cases.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    translationDeadline: c.translationDeadline,
    reviewDeadline: c.reviewDeadline,
  }));

  const plan = planDuplicateCaseTitle(source.title, id, todayStr, casePlans, sort, createdAtIso);

  const oldTitles = new Map<string, string>();
  for (const u of plan.titleUpdates) {
    const c = cases.find((x) => x.id === u.caseId);
    if (c) oldTitles.set(u.caseId, c.title);
  }

  for (const u of plan.titleUpdates) {
    await update(u.caseId, { title: u.newTitle });
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const feesBefore = feeStore.getFees();
  const allFeePatches: FeeTitlePatch[] = [];
  for (const u of plan.titleUpdates) {
    const old = oldTitles.get(u.caseId);
    if (!old) continue;
    allFeePatches.push(...patchesForFeesAfterCaseRename(u.caseId, old, u.newTitle, origin, feesBefore));
  }

  for (const p of allFeePatches) {
    const partial: { title?: string; internalNote?: string } = {};
    if (p.title !== undefined) partial.title = p.title;
    if (p.internalNote !== undefined) partial.internalNote = p.internalNote;
    if (Object.keys(partial).length > 0) feeStore.updateFee(p.feeId, partial);
  }

  const feeMap = feeTitleChangeMap(feesBefore, allFeePatches);
  const translatorInvoicePatches = patchesForTranslatorInvoicesAfterFeeRenames(
    invoiceStore.getInvoices(),
    feeMap
  );
  const clientInvoicePatches = patchesForClientInvoicesAfterFeeRenames(
    clientInvoiceStore.getInvoices(),
    feeMap
  );

  for (const ip of translatorInvoicePatches) {
    invoiceStore.updateInvoice(ip.invoiceId, { title: ip.newTitle });
  }
  for (const ip of clientInvoicePatches) {
    clientInvoiceStore.updateInvoice(ip.invoiceId, { title: ip.newTitle });
  }

    const cleaned = clearDuplicateFields(rest);
    const newCase = await create({ ...cleaned, title: plan.newTitle });
    if (!newCase) return abortDuplicate("create_failed");

    const shared: CaseDuplicateShared = {
      newCase,
      sourceCaseId: id,
      renames: plan.renames,
      feePatches: allFeePatches,
      translatorInvoicePatches,
      clientInvoicePatches,
    };

    if (!needsToolWrite) {
      setPendingToolCopy(newCase.id, null);
      return { ok: true, created: true, toolsStatus: "skipped_empty", ...shared };
    }

    const written = await writeCopiedCredentials(
      newCase.id,
      credentialPatch,
      newCase.revision ?? 0,
    );
    if (written.status === "ok" || written.status === "already_present") {
      setPendingToolCopy(newCase.id, null);
      return { ok: true, created: true, toolsStatus: "copied", ...shared };
    }

    const pendingMessage = written.message ?? "新案件已建立，工具尚未確認寫入。";
    setPendingToolCopy(newCase.id, { sourceCaseId: id, message: pendingMessage });
    return {
      ok: false,
      created: true,
      toolsStatus: "pending",
      message: pendingMessage,
      ...shared,
    };
  } catch (e) {
    console.error("[case-store] duplicate failed", e);
    return abortDuplicate("create_failed");
  }
}

async function retryDuplicateTools(newCaseId: string): Promise<{
  ok: boolean;
  created: false;
  message: string;
}> {
  const pending = pendingToolCopies.get(newCaseId);
  if (!pending) {
    return { ok: false, created: false, message: "沒有可重試的部分完成複製；不會再建新案。" };
  }
  if (!getById(newCaseId)) {
    return { ok: false, created: false, message: "找不到已建立的新案，未重送、未再建案。" };
  }
  const user = await getAuthenticatedUser().catch((e) => {
    if (e instanceof AuthRecoverableError) return null;
    throw e;
  });
  if (!user) {
    return { ok: false, created: false, message: duplicateAbortMessage("session_mismatch") };
  }
  const sourceReady = await loadSourceCredentialsForCopy(pending.sourceCaseId, user.id);
  if (sourceReady.ok === false) {
    return { ok: false, created: false, message: sourceReady.message };
  }
  const patch = buildDuplicateCredentialPatch(sourceReady.credentials);
  const written = await writeCopiedCredentials(
    newCaseId,
    patch,
    getById(newCaseId)?.revision ?? 0,
  );
  if (written.status === "ok" || written.status === "already_present") {
    setPendingToolCopy(newCaseId, null);
    return { ok: true, created: false, message: "工具已寫入既有新案。" };
  }
  setPendingToolCopy(newCaseId, {
    sourceCaseId: pending.sourceCaseId,
    message: written.message ?? "工具重試仍未確認，未再建案。",
  });
  return { ok: false, created: false, message: written.message ?? "工具重試仍未確認，未再建案。" };
}

/** Fields to clear when duplicating a case */
function clearDuplicateFields(data: Partial<CaseRecord>): Partial<CaseRecord> {
  return {
    ...data,
    status: "draft" as CaseStatus,
    multiCollab: false,
    collabCount: 0,
    collabRows: [],
    reviewRows: [],
    reviewer: "",
    translator: [],
    translationDeadline: null,
    reviewDeadline: null,
    workGroups: (data.workGroups || []).map(g => ({ ...g, unitCount: 0 })),
    unitCount: 0,
    keyword: "",
    clientPoNumber: "",
    feeEntry: "",
    clientCaseLink: { url: "", label: "" },
    internalNoteForm: false,
    clientQuestionForm: false,
    translatorFinal: [],
    internalReviewFinal: [],
    trackChanges: [],
    caseReferenceMaterials: [],
    sourceFiles: [],
    declineRecords: [],
    // do not inherit the original case's change log or its recording trigger
    edit_logs: [],
    changeLogEnabledAt: undefined,
  };
}

// Polling fallback – ensures sync within 3s even if Realtime misses events
// 工項 D：譯者對 cases 基表無 SELECT，改偵測 cases_visible.updated_at
const casePoll = createCasesVisiblePollFallback(() => {
  if (loaded) {
    loadPromise = null;
    load();
  }
}, 15000);

// Start polling when first listener subscribes
const _origSubscribe = subscribe;
function subscribePoll(fn: Listener) {
  const unsub = _origSubscribe(fn);
  if (listeners.size === 1) casePoll.start();
  return () => {
    unsub();
    if (listeners.size === 0) casePoll.stop();
  };
}

export const caseStore = {
  load,
  loadCaseIfMissing,
  getAll,
  getById,
  isLoaded,
  create,
  update,
  remove,
  duplicate,
  retryDuplicateTools,
  peekPendingDuplicateTools,
  acceptPublicInquiry,
  declinePublicInquiry,
  acceptInquiryCollabRow,
  completeCaseCollabRow,
  completeCaseTranslation,
  completeCaseReviewRow,
  updateCredentials,
  subscribe: subscribePoll,
  reset,
};

/** 供契約測試：partial → snake_case DB 欄位（不含 RPC 禁止鍵過濾）。 */
export function mapPartialCaseToDb(c: Partial<CaseRecord>): DbCaseUpdate {
  return toDb(c);
}
