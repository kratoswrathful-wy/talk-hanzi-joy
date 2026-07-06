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
import type { CaseRecord, CaseStatus, ToolEntry, ToolEntryField, CaseComment, DeclineRecord, CollabRow, WorkGroup } from "@/data/case-types";
import type { Block } from "@blocknote/core";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import type { Database, Json } from "@/integrations/supabase/types";

type DbCase = Database["public"]["Tables"]["cases"]["Row"];
type DbCaseInsert = Database["public"]["Tables"]["cases"]["Insert"];
type DbCaseUpdate = Database["public"]["Tables"]["cases"]["Update"];

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
const PENDING_CLEANUP_DELAY_MS = 2000;

function notify() {
  listeners.forEach((l) => l());
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function mergeIncomingCase(current: CaseRecord | undefined, incoming: CaseRecord): CaseRecord {
  if (!current) return incoming;

  const currentTs = parseTimestamp(current.updatedAt);
  const incomingTs = parseTimestamp(incoming.updatedAt);

  // Never let older snapshots overwrite newer local data.
  if (incomingTs > 0 && currentTs > 0 && incomingTs < currentTs) {
    return current;
  }

  // 防呆：舊快取或異常資料可能缺 tools／questionTools，避免讀 .length 拋錯導致整頁崩潰
  const curToolsLen = current.tools?.length ?? 0;
  const incToolsLen = incoming.tools?.length ?? 0;
  const curQtLen = current.questionTools?.length ?? 0;
  const incQtLen = incoming.questionTools?.length ?? 0;
  const keepTools = curToolsLen > 0 && incToolsLen === 0;
  const keepQuestionTools = curQtLen > 0 && incQtLen === 0;

  if (!keepTools && !keepQuestionTools) return incoming;

  return {
    ...incoming,
    ...(keepTools ? { tools: current.tools ?? [] } : {}),
    ...(keepQuestionTools ? { questionTools: current.questionTools ?? [] } : {}),
  };
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

  return {
    id: row.id,
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
    reviewer: row.reviewer ?? "",
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
  if (c.toolFieldValues !== undefined) map.tool_field_values = toJson(c.toolFieldValues);
  if (c.catToolEnabled !== undefined) map.cat_tool_enabled = c.catToolEnabled;
  if (c.tools !== undefined) map.tools = toJson(c.tools);
  if (c.questionTools !== undefined) map.question_tools = toJson(c.questionTools);
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
  if (c.otherLoginInfo !== undefined) map.other_login_info = c.otherLoginInfo;
  if (c.loginAccount !== undefined) map.login_account = c.loginAccount;
  if (c.loginPassword !== undefined) map.login_password = c.loginPassword;
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
  if (c.declineRecords !== undefined) map.decline_records = toJson(c.declineRecords);
  if (c.iconUrl !== undefined) map.icon_url = c.iconUrl;
  if (c.createdBy !== undefined) map.created_by = c.createdBy;
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

  const user = await getAuthenticatedUser();
  if (!user) return undefined;

  const env = getEnvironment();
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .eq("env", env)
    .maybeSingle();

  if (error) {
    console.error("[case-store] loadCaseIfMissing", errorMessage(error));
    return undefined;
  }
  if (!data) return undefined;

  const incoming = fromDb(data);
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
      const { data, error } = await supabase
        .from("cases")
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
        .map(fromDb)
        .map((incoming) => mergeIncomingCase(currentById.get(incoming.id), incoming));

      if (pendingUpdates.size > 0) {
        fetched = fetched.map((c) => {
          const pending = pendingUpdates.get(c.id);
          return pending ? { ...c, ...pending } : c;
        });
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
  const env = getEnvironment();
  const { data: { user } } = await supabase.auth.getUser();
  const payload: DbCaseInsert = { ...toDb(partial), env, created_by: user?.id || null };
  const { data, error } = await supabase.from("cases").insert(payload).select().single();
  if (error || !data) {
    console.error("[case-store] create failed", errorMessage(error), { payloadKeys: Object.keys(payload || {}) });
    return null;
  }
  const record = fromDb(data);
  cases = [record, ...cases];
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

  const { error } = await supabase.from("cases").update(mapped).eq("id", id);

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
      await supabase.rpc("sync_cat_file_assignments_for_case", { p_case_id: id });
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

async function remove(id: string) {
  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (!error) {
    cases = cases.filter((c) => c.id !== id);
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

// Realtime subscription – sync changes from other users
supabase
  .channel("cases-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "cases" },
    (payload) => {
      const env = getEnvironment();
      if (payload.eventType === "UPDATE" && payload.new) {
        const row = payload.new as DbCase;
        if (row.env !== env) return;
        // Skip realtime updates for cases with pending optimistic writes
        if (pendingUpdates.has(row.id)) return;
        const updated = fromDb(row);
        cases = cases.map((c) => (c.id === updated.id ? mergeIncomingCase(c, updated) : c));
        notify();
      } else if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as DbCase;
        if (row.env !== env) return;
        const exists = cases.some((c) => c.id === row.id);
        if (!exists) {
          cases = [fromDb(row), ...cases];
          notify();
        }
      } else if (payload.eventType === "DELETE" && payload.old) {
        const oldId = (payload.old as Partial<DbCase>).id;
        if (cases.some((c) => c.id === oldId)) {
          cases = cases.filter((c) => c.id !== oldId);
          notify();
        }
      }
    }
  )
  .subscribe();

export type CaseDuplicateSort = { key: DuplicateSortKey; dir: DuplicateSortDir };

export interface CaseDuplicateResult {
  newCase: CaseRecord;
  renames: { oldTitle: string; newTitle: string }[];
  feePatches: FeeTitlePatch[];
  translatorInvoicePatches: InvoiceTitlePatch[];
  clientInvoicePatches: InvoiceTitlePatch[];
}

async function duplicate(
  id: string,
  sort: CaseDuplicateSort = DEFAULT_DUPLICATE_SORT
): Promise<CaseDuplicateResult | null> {
  try {
    const source = cases.find((c) => c.id === id);
    if (!source) return null;
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
    if (!newCase) return null;

    return {
      newCase,
      renames: plan.renames,
      feePatches: allFeePatches,
      translatorInvoicePatches,
      clientInvoicePatches,
    };
  } catch (e) {
    console.error("[case-store] duplicate failed", e);
    return null;
  }
}

/** Fields to clear when duplicating a case */
function clearDuplicateFields(data: Partial<CaseRecord>): Partial<CaseRecord> {
  return {
    ...data,
    status: "draft" as CaseStatus,
    multiCollab: false,
    collabCount: 0,
    collabRows: [],
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
const casePoll = createPollFallback("cases", () => {
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
  subscribe: subscribePoll,
  reset,
};
