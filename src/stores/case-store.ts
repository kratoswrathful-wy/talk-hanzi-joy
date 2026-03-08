import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import type { CaseRecord, ToolEntry } from "@/data/case-types";

type Listener = () => void;

let cases: CaseRecord[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

// ── DB ↔ App mapping ──

function fromDb(row: any): CaseRecord {
  return {
    id: row.id,
    title: row.title ?? "",
    status: (row.status === "finalized" ? "finalized" : row.status === "inquiry" ? "inquiry" : "draft") as any,
    category: row.category ?? "",
    workType: Array.isArray(row.work_type) ? row.work_type : [],
    processNote: row.process_note ?? "",
    billingUnit: row.billing_unit ?? "",
    unitCount: Number(row.unit_count) || 0,
    inquiryNote: row.inquiry_note ?? "",
    translator: Array.isArray(row.translator) ? row.translator as string[] : row.translator ? [row.translator as string] : [],
    translationDeadline: row.translation_deadline,
    reviewer: row.reviewer ?? "",
    reviewDeadline: row.review_deadline,
    taskStatus: row.task_status ?? "",
    executionTool: row.execution_tool ?? "",
    toolFieldValues: (row.tool_field_values && typeof row.tool_field_values === "object" && !Array.isArray(row.tool_field_values)) ? row.tool_field_values as Record<string, string> : {},
    tools: Array.isArray(row.tools) ? (row.tools as ToolEntry[]) : [],
    deliveryMethod: row.delivery_method ?? "",
    clientReceipt: row.client_receipt ?? "",
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
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDb(c: Partial<CaseRecord>): Record<string, any> {
  const map: Record<string, any> = {};
  if (c.title !== undefined) map.title = c.title;
  if (c.status !== undefined) map.status = c.status;
  if (c.category !== undefined) map.category = c.category;
  if (c.workType !== undefined) map.work_type = c.workType;
  if (c.processNote !== undefined) map.process_note = c.processNote;
  if (c.billingUnit !== undefined) map.billing_unit = c.billingUnit;
  if (c.unitCount !== undefined) map.unit_count = c.unitCount;
  if (c.inquiryNote !== undefined) map.inquiry_note = c.inquiryNote;
  if (c.translator !== undefined) map.translator = c.translator;
  if (c.translationDeadline !== undefined) map.translation_deadline = c.translationDeadline;
  if (c.reviewer !== undefined) map.reviewer = c.reviewer;
  if (c.reviewDeadline !== undefined) map.review_deadline = c.reviewDeadline;
  if (c.taskStatus !== undefined) map.task_status = c.taskStatus;
  if (c.executionTool !== undefined) map.execution_tool = c.executionTool;
  if (c.toolFieldValues !== undefined) map.tool_field_values = c.toolFieldValues;
  if (c.tools !== undefined) map.tools = c.tools;
  if (c.deliveryMethod !== undefined) map.delivery_method = c.deliveryMethod;
  if (c.clientReceipt !== undefined) map.client_receipt = c.clientReceipt;
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
  return map;
}

// ── Public API ──

async function load() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const env = getEnvironment();
    const { data } = await (supabase.from("cases").select("*") as any).eq("env", env).order("created_at", { ascending: false });
    cases = (data || []).map(fromDb);
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
  const payload = { ...toDb(partial), env };
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
  const { error } = await (supabase.from("cases").update(mapped as any).eq("id", id) as any);
  if (!error) {
    cases = cases.map((c) => (c.id === id ? { ...c, ...partial, updatedAt: mapped.updated_at } : c));
    notify();
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
}

// Listen for auth changes to reset cache
supabase.auth.onAuthStateChange(() => {
  reset();
});

async function duplicate(id: string): Promise<CaseRecord | null> {
  const source = cases.find((c) => c.id === id);
  if (!source) return null;
  const { id: _id, createdAt, updatedAt, createdBy, ...rest } = source;
  return create({ ...rest, title: `${source.title} (複製)` });
}

export const caseStore = { load, getAll, getById, create, update, remove, duplicate, subscribe, reset };
