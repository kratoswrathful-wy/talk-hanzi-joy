import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
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
import type { CaseRecord, CaseStatus, ToolEntry } from "@/data/case-types";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";

type Listener = () => void;

let cases: CaseRecord[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;
let loadVersion = 0; // version counter to discard stale loads
const listeners = new Set<Listener>();

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

  const keepTools = current.tools.length > 0 && incoming.tools.length === 0;
  const keepQuestionTools = current.questionTools.length > 0 && incoming.questionTools.length === 0;

  if (!keepTools && !keepQuestionTools) return incoming;

  return {
    ...incoming,
    ...(keepTools ? { tools: current.tools } : {}),
    ...(keepQuestionTools ? { questionTools: current.questionTools } : {}),
  };
}

// ── DB ↔ App mapping ──

function fromDb(row: any): CaseRecord {
  // Build workGroups from DB or migrate from legacy fields
  const workGroupsRaw = Array.isArray(row.work_groups) ? row.work_groups : [];
  const workGroups = workGroupsRaw.length > 0 ? workGroupsRaw : (() => {
    // Migrate from legacy: one group per workType entry
    const legacyWorkTypes = Array.isArray(row.work_type) ? row.work_type : [];
    if (legacyWorkTypes.length > 0) {
      return legacyWorkTypes.map((wt: string, i: number) => ({
        id: `wg-migrate-${i}`,
        workType: wt,
        billingUnit: row.billing_unit ?? "",
        unitCount: i === 0 ? (Number(row.unit_count) || 0) : 0,
      }));
    }
    return [{ id: `wg-default`, workType: "", billingUnit: "", unitCount: 0 }];
  })();

  return {
    id: row.id,
    title: row.title ?? "",
    status: (row.status || "draft") as any,
    client: row.client ?? "",
    contact: row.contact ?? "",
    keyword: row.keyword ?? "",
    clientPoNumber: row.client_po_number ?? "",
    clientCaseLink: (row.client_case_link && typeof row.client_case_link === "object" && !Array.isArray(row.client_case_link))
      ? row.client_case_link as { url: string; label: string }
      : { url: "", label: "" },
    dispatchRoute: row.dispatch_route ?? "",
    category: row.category ?? "",
    workType: Array.isArray(row.work_type) ? row.work_type : [],
    workGroups,
    processNote: row.process_note ?? "",
    billingUnit: row.billing_unit ?? "",
    unitCount: Number(row.unit_count) || 0,
    inquiryNote: row.inquiry_note ?? "",
    translator: Array.isArray(row.translator) ? row.translator as string[] : row.translator ? [row.translator as string] : [],
    translationDeadline: row.translation_deadline,
    reviewer: row.reviewer ?? "",
    reviewDeadline: row.review_deadline,
    
    executionTool: row.execution_tool ?? "",
    toolFieldValues: (row.tool_field_values && typeof row.tool_field_values === "object" && !Array.isArray(row.tool_field_values)) ? row.tool_field_values as Record<string, string> : {},
    tools: Array.isArray(row.tools) ? (row.tools as ToolEntry[]) : [],
    questionTools: Array.isArray(row.question_tools) ? (row.question_tools as ToolEntry[]) : [],
    deliveryMethod: row.delivery_method ?? "",
    deliveryMethodFiles: Array.isArray(row.delivery_method_files) ? row.delivery_method_files : [],
    clientReceipt: row.client_receipt ?? "",
    clientReceiptFiles: Array.isArray(row.client_receipt_files) ? row.client_receipt_files : [],
    customGuidelinesUrl: Array.isArray(row.custom_guidelines_url) ? row.custom_guidelines_url : [],
    clientGuidelines: Array.isArray(row.client_guidelines) ? row.client_guidelines : [],
    commonInfo: Array.isArray(row.common_info) ? row.common_info : [],
    commonLinks: Array.isArray(row.common_links) ? row.common_links : [],
    internalNoteForm: row.internal_note_form ?? false,
    clientQuestionForm: row.client_question_form ?? false,
    workingFiles: Array.isArray(row.working_files) ? row.working_files : [],
    otherLoginInfo: row.other_login_info ?? "",
    loginAccount: row.login_account ?? "",
    loginPassword: row.login_password ?? "",
    onlineToolProject: row.online_tool_project ?? "",
    onlineToolFilename: row.online_tool_filename ?? "",
    sourceFiles: Array.isArray(row.source_files) ? row.source_files : [],
    seriesReferenceMaterials: Array.isArray(row.series_reference_materials) ? row.series_reference_materials : [],
    caseReferenceMaterials: Array.isArray(row.case_reference_materials) ? row.case_reference_materials : [],
    referenceMaterials: Array.isArray(row.reference_materials) ? row.reference_materials : [],
    questionForm: row.question_form ?? "",
    translatorFinal: Array.isArray(row.translator_final) ? row.translator_final : [],
    internalReviewFinal: Array.isArray(row.internal_review_final) ? row.internal_review_final : [],
    trackChanges: Array.isArray(row.track_changes) ? row.track_changes : [],
    feeEntry: row.fee_entry ?? "",
    internalRecords: Array.isArray(row.internal_records) ? row.internal_records : [],
    comments: Array.isArray(row.comments) ? row.comments : [],
    internalComments: Array.isArray(row.internal_comments) ? row.internal_comments : [],
    bodyContent: Array.isArray(row.body_content) ? row.body_content : [],
    multiCollab: row.multi_collab ?? false,
    collabCount: Number(row.collab_count) || 0,
    collabRows: Array.isArray(row.collab_rows) ? row.collab_rows : [],
    declineRecords: Array.isArray(row.decline_records) ? row.decline_records : [],
    iconUrl: row.icon_url ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDb(c: Partial<CaseRecord>): Record<string, any> {
  const map: Record<string, any> = {};
  if (c.title !== undefined) map.title = c.title;
  if (c.status !== undefined) map.status = c.status;
  if (c.client !== undefined) map.client = c.client;
  if (c.contact !== undefined) map.contact = c.contact;
  if (c.keyword !== undefined) map.keyword = c.keyword;
  if (c.clientPoNumber !== undefined) map.client_po_number = c.clientPoNumber;
  if (c.clientCaseLink !== undefined) map.client_case_link = c.clientCaseLink;
  if (c.dispatchRoute !== undefined) map.dispatch_route = c.dispatchRoute;
  if (c.category !== undefined) map.category = c.category;
  if (c.workType !== undefined) map.work_type = c.workType;
  if (c.workGroups !== undefined) {
    map.work_groups = c.workGroups;
    // Keep legacy columns in sync for backward compatibility
    map.work_type = c.workGroups.map((g) => g.workType).filter(Boolean);
    if (c.workGroups[0]) {
      map.billing_unit = c.workGroups[0].billingUnit || "";
      map.unit_count = Number(c.workGroups[0].unitCount) || 0;
    }
  }
  if (c.processNote !== undefined) map.process_note = c.processNote;
  if (c.billingUnit !== undefined) map.billing_unit = c.billingUnit;
  if (c.unitCount !== undefined) map.unit_count = c.unitCount;
  if (c.inquiryNote !== undefined) map.inquiry_note = c.inquiryNote;
  if (c.translator !== undefined) map.translator = c.translator;
  if (c.translationDeadline !== undefined) map.translation_deadline = c.translationDeadline;
  if (c.reviewer !== undefined) map.reviewer = c.reviewer;
  if (c.reviewDeadline !== undefined) map.review_deadline = c.reviewDeadline;
  
  if (c.executionTool !== undefined) map.execution_tool = c.executionTool;
  if (c.toolFieldValues !== undefined) map.tool_field_values = c.toolFieldValues;
  if (c.tools !== undefined) map.tools = c.tools;
  if (c.questionTools !== undefined) map.question_tools = c.questionTools;
  if (c.deliveryMethod !== undefined) map.delivery_method = c.deliveryMethod;
  if (c.deliveryMethodFiles !== undefined) map.delivery_method_files = c.deliveryMethodFiles;
  if (c.clientReceipt !== undefined) map.client_receipt = c.clientReceipt;
  if (c.clientReceiptFiles !== undefined) map.client_receipt_files = c.clientReceiptFiles;
  if (c.customGuidelinesUrl !== undefined) map.custom_guidelines_url = c.customGuidelinesUrl;
  if (c.clientGuidelines !== undefined) map.client_guidelines = c.clientGuidelines;
  if (c.commonInfo !== undefined) map.common_info = c.commonInfo;
  if (c.commonLinks !== undefined) map.common_links = c.commonLinks;
  if (c.internalNoteForm !== undefined) map.internal_note_form = c.internalNoteForm;
  if (c.clientQuestionForm !== undefined) map.client_question_form = c.clientQuestionForm;
  if (c.workingFiles !== undefined) map.working_files = c.workingFiles;
  if (c.otherLoginInfo !== undefined) map.other_login_info = c.otherLoginInfo;
  if (c.loginAccount !== undefined) map.login_account = c.loginAccount;
  if (c.loginPassword !== undefined) map.login_password = c.loginPassword;
  if (c.onlineToolProject !== undefined) map.online_tool_project = c.onlineToolProject;
  if (c.onlineToolFilename !== undefined) map.online_tool_filename = c.onlineToolFilename;
  if (c.sourceFiles !== undefined) map.source_files = c.sourceFiles;
  if (c.seriesReferenceMaterials !== undefined) map.series_reference_materials = c.seriesReferenceMaterials;
  if (c.caseReferenceMaterials !== undefined) map.case_reference_materials = c.caseReferenceMaterials;
  if (c.referenceMaterials !== undefined) map.reference_materials = c.referenceMaterials;
  if (c.questionForm !== undefined) map.question_form = c.questionForm;
  if (c.translatorFinal !== undefined) map.translator_final = c.translatorFinal;
  if (c.internalReviewFinal !== undefined) map.internal_review_final = c.internalReviewFinal;
  if (c.trackChanges !== undefined) map.track_changes = c.trackChanges;
  if (c.feeEntry !== undefined) map.fee_entry = c.feeEntry;
  if (c.internalRecords !== undefined) map.internal_records = c.internalRecords;
  if (c.comments !== undefined) map.comments = c.comments;
  if (c.internalComments !== undefined) map.internal_comments = c.internalComments;
  if (c.bodyContent !== undefined) map.body_content = c.bodyContent;
  if (c.multiCollab !== undefined) map.multi_collab = c.multiCollab;
  if (c.collabCount !== undefined) map.collab_count = c.collabCount;
  if (c.collabRows !== undefined) map.collab_rows = c.collabRows;
  if (c.declineRecords !== undefined) map.decline_records = c.declineRecords;
  if (c.iconUrl !== undefined) map.icon_url = c.iconUrl;
  if (c.createdBy !== undefined) map.created_by = c.createdBy;
  return map;
}

// ── Public API ──

async function load() {
  if (loadPromise) return loadPromise;
  const version = ++loadVersion;
  loadPromise = (async () => {
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
    const { data } = await (supabase.from("cases").select("*") as any).eq("env", env).order("created_at", { ascending: false });
    if (version !== loadVersion) return;

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
  })();
  return loadPromise;
}

function getAll(): CaseRecord[] {
  if (!loaded) load();
  return cases;
}

function getById(id: string): CaseRecord | undefined {
  return cases.find((c) => c.id === id);
}

async function create(partial: Partial<CaseRecord>): Promise<CaseRecord | null> {
  const env = getEnvironment();
  const { data: { user } } = await supabase.auth.getUser();
  const payload = { ...toDb(partial), env, created_by: user?.id || null };
  const { data, error } = await (supabase.from("cases").insert(payload as any).select().single() as any);
  if (error || !data) return null;
  const record = fromDb(data);
  cases = [record, ...cases];
  notify();
  return record;
}

async function update(id: string, partial: Partial<CaseRecord>) {
  const mapped = toDb(partial);
  mapped.updated_at = new Date().toISOString();

  // Optimistic update BEFORE DB write to prevent poll/realtime from overwriting
  const updatedAt = mapped.updated_at;
  cases = cases.map((c) => (c.id === id ? { ...c, ...partial, updatedAt } : c));

  // Merge with existing pending updates instead of replacing to avoid losing concurrent writes
  pendingUpdates.set(id, { ...pendingUpdates.get(id), ...partial });
  inFlightCount.set(id, (inFlightCount.get(id) || 0) + 1);

  // If a delayed cleanup was scheduled, cancel it because we have a new write.
  const cleanupTimer = pendingCleanupTimers.get(id);
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    pendingCleanupTimers.delete(id);
  }

  notify();

  const { error } = await (supabase.from("cases").update(mapped as any).eq("id", id) as any);

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

  return error;
}

async function remove(id: string) {
  const { error } = await (supabase.from("cases").delete().eq("id", id) as any);
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

  pendingUpdates.clear();
  inFlightCount.clear();
  pendingCleanupTimers.forEach((timer) => clearTimeout(timer));
  pendingCleanupTimers.clear();
}

// Listen for auth changes — only reload on sign-in to avoid race conditions
supabase.auth.onAuthStateChange((event) => {
  reset();
  // Only reload when a new session is available
  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
    load();
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
        const row = payload.new as any;
        if (row.env !== env) return;
        // Skip realtime updates for cases with pending optimistic writes
        if (pendingUpdates.has(row.id)) return;
        const updated = fromDb(row);
        cases = cases.map((c) => (c.id === updated.id ? mergeIncomingCase(c, updated) : c));
        notify();
      } else if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as any;
        if (row.env !== env) return;
        const exists = cases.some((c) => c.id === row.id);
        if (!exists) {
          cases = [fromDb(row), ...cases];
          notify();
        }
      } else if (payload.eventType === "DELETE" && payload.old) {
        const oldId = (payload.old as any).id;
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
  const source = cases.find((c) => c.id === id);
  if (!source) return null;
  const { id: _id, createdAt, updatedAt, createdBy, comments: _c, internalComments: _ic, ...rest } = source;

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
  };
}

// Polling fallback – ensures sync within 3s even if Realtime misses events
const casePoll = createPollFallback("cases", () => {
  if (loaded) {
    loadPromise = null;
    load();
  }
}, 3000);

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

export const caseStore = { load, getAll, getById, create, update, remove, duplicate, subscribe: subscribePoll, reset };
