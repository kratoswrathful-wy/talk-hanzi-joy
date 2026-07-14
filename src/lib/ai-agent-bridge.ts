/**
 * LMS AI 操作切入點：掛載 window.__lmsAgent / window.__tmsAgent。
 * 複用 store 寫入路徑；下拉合法值讀 selectOptionsStore。
 */
import { caseStore } from "@/stores/case-store";
import { feeStore } from "@/stores/fee-store";
import { invoiceStore } from "@/stores/invoice-store";
import { clientInvoiceStore } from "@/stores/client-invoice-store";
import { selectOptionsStore } from "@/stores/select-options-store";
import type {
  CaseRecord,
  CaseStatus,
  CaseComment,
  CollabRow,
  ToolEntry,
  WorkGroup,
} from "@/data/case-types";
import type { ClientInfo, FeeTaskItem, TranslatorFee } from "@/data/fee-mock-data";
import { defaultClientInfo } from "@/data/fee-mock-data";
import type { Invoice, InvoiceStatus, PaymentRecord } from "@/data/invoice-types";
import type {
  ClientInvoice,
  ClientInvoiceStatus,
  ClientInvoiceAdjustmentLine,
  ClientPaymentRecord,
} from "@/data/client-invoice-types";
import { generateFeesForCase } from "@/lib/generate-case-fees";
import { uploadFromBytes, type UploadFromBytesInput, type UploadedFileItem } from "@/lib/ai-agent-upload";
import { mergeArrayById, resolveArrayPatch } from "@/lib/ai-agent-array-merge";
import {
  buildToolFieldWritePatch,
  finalizeToolSetFieldResult,
  getEffectiveToolEntries,
  pickToolEntryIndex,
  readToolFieldFromRecord,
  type ToolBlockKey,
  type ToolFieldSchema,
  type ToolSetFieldInput,
  type ToolSetFieldResult,
} from "@/lib/ai-agent-tool-field";
import {
  type AgentResult,
  agentOk as ok,
  agentFail as fail,
  agentFailFrom as failFrom,
} from "@/lib/ai-agent-types";
import {
  STORE_READBACK_INTERVAL_MS,
  STORE_READBACK_TIMEOUT_MS,
  awaitStoreReadback,
  awaitStoreReadbackMatch,
  failReadbackTimedOut,
  failWriteFailed,
  readbackAfterWrite,
} from "@/lib/ai-agent-readback";
import {
  assertPmPlusFromRoles,
  computeAdjustmentSumInClientCurrency,
  computeClientInvoiceAdjustmentLine,
  computeFeeTotalsByCurrency,
  isValidDateOnlyOrIso,
  normalizeExpectedCollectionDate,
  planClientInvoiceAddFees,
  resolveClientCurrency,
  verifyFeeIdsOnInvoice,
  type ClientInvoiceAddFeeSkip,
  type ClientInvoiceAdjustAmountInput,
  type ClientInvoiceAdjustMode,
} from "@/lib/ai-agent-client-invoice-bridge";
import { currencyStore } from "@/stores/currency-store";
import { supabase } from "@/integrations/supabase/client";

export type { AgentResult } from "@/lib/ai-agent-types";

const ALL_CASE_STATUSES: readonly CaseStatus[] = [
  "draft",
  "inquiry",
  "dispatched",
  "task_completed",
  "delivered",
  "feedback",
  "feedback_completed",
];

const FEE_STATUSES = ["draft", "finalized"] as const;
const INVOICE_STATUSES: InvoiceStatus[] = ["pending", "partial", "paid"];
const CLIENT_INVOICE_STATUSES: ClientInvoiceStatus[] = ["pending", "partial_collected", "collected"];

type FieldKind =
  | "text"
  | "number"
  | "boolean"
  | "isoDate"
  | "select"
  | "status"
  | "stringArray"
  | "fileItems"
  | "linkObject"
  | "json";

interface FieldMeta {
  kind: FieldKind;
  optionsKey?: string;
  statusAllowed?: readonly string[];
}

interface FileItemShape {
  name: string;
  url: string;
  size?: number;
}

const CASE_TOP_FIELDS: Record<string, FieldMeta> = {
  title: { kind: "text" },
  status: { kind: "status", statusAllowed: ALL_CASE_STATUSES },
  client: { kind: "select", optionsKey: "client" },
  contact: { kind: "select", optionsKey: "contact" },
  keyword: { kind: "text" },
  clientPoNumber: { kind: "text" },
  clientCaseLink: { kind: "linkObject" },
  dispatchRoute: { kind: "select", optionsKey: "dispatchRoute" },
  category: { kind: "select", optionsKey: "caseCategory" },
  processNote: { kind: "text" },
  inquiryNote: { kind: "text" },
  billingUnit: { kind: "select", optionsKey: "billingUnit" },
  unitCount: { kind: "number" },
  translator: { kind: "stringArray", optionsKey: "assignee" },
  translationDeadline: { kind: "isoDate" },
  reviewer: { kind: "select", optionsKey: "assignee" },
  reviewDeadline: { kind: "isoDate" },
  executionTool: { kind: "select", optionsKey: "executionTool" },
  toolFieldValues: { kind: "json" },
  deliveryMethod: { kind: "text" },
  deliveryMethodFiles: { kind: "fileItems" },
  clientReceipt: { kind: "text" },
  clientReceiptFiles: { kind: "fileItems" },
  customGuidelinesUrl: { kind: "fileItems" },
  clientGuidelines: { kind: "fileItems" },
  commonInfo: { kind: "json" },
  commonLinks: { kind: "json" },
  feeEntry: { kind: "text" },
  multiCollab: { kind: "boolean" },
  collabCount: { kind: "number" },
  internalNoteForm: { kind: "boolean" },
  clientQuestionForm: { kind: "boolean" },
  catToolEnabled: { kind: "boolean" },
  workingFiles: { kind: "fileItems" },
  sourceFiles: { kind: "fileItems" },
  seriesReferenceMaterials: { kind: "fileItems" },
  caseReferenceMaterials: { kind: "fileItems" },
  referenceMaterials: { kind: "fileItems" },
  translatorFinal: { kind: "fileItems" },
  internalReviewFinal: { kind: "fileItems" },
  trackChanges: { kind: "fileItems" },
  questionForm: { kind: "text" },
  otherLoginInfo: { kind: "text" },
  loginAccount: { kind: "text" },
  loginPassword: { kind: "text" },
  onlineToolProject: { kind: "text" },
  onlineToolFilename: { kind: "text" },
  iconUrl: { kind: "text" },
  bodyContent: { kind: "json" },
  internalRecords: { kind: "json" },
  declineRecords: { kind: "json" },
  inquirySlackRecords: { kind: "json" },
};

const FEE_TOP_FIELDS: Record<string, FieldMeta> = {
  title: { kind: "text" },
  assignee: { kind: "select", optionsKey: "assignee" },
  status: { kind: "status", statusAllowed: FEE_STATUSES },
  internalNote: { kind: "text" },
  internalNoteUrl: { kind: "text" },
};

const CLIENT_INFO_FIELDS: Record<string, FieldMeta> = {
  client: { kind: "select", optionsKey: "client" },
  contact: { kind: "select", optionsKey: "contact" },
  clientCaseId: { kind: "text" },
  eciKeywords: { kind: "text" },
  clientPoNumber: { kind: "text" },
  dispatchRoute: { kind: "select", optionsKey: "dispatchRoute" },
  sameCase: { kind: "boolean" },
  isFirstFee: { kind: "boolean" },
  notFirstFee: { kind: "boolean" },
  reconciled: { kind: "boolean" },
  rateConfirmed: { kind: "boolean" },
  invoiced: { kind: "boolean" },
};

const WORK_GROUP_FIELDS: Record<string, FieldMeta> = {
  workType: { kind: "select", optionsKey: "taskType" },
  billingUnit: { kind: "select", optionsKey: "billingUnit" },
  unitCount: { kind: "number" },
};

const COLLAB_ROW_FIELDS: Record<string, FieldMeta> = {
  segment: { kind: "text" },
  translator: { kind: "select", optionsKey: "assignee" },
  unitCount: { kind: "number" },
  accepted: { kind: "boolean" },
  translationDeadline: { kind: "isoDate" },
  reviewer: { kind: "select", optionsKey: "assignee" },
  reviewDeadline: { kind: "isoDate" },
  taskCompleted: { kind: "boolean" },
  delivered: { kind: "boolean" },
};

const FEE_TASK_ITEM_FIELDS: Record<string, FieldMeta> = {
  taskType: { kind: "select", optionsKey: "taskType" },
  billingUnit: { kind: "select", optionsKey: "billingUnit" },
  unitCount: { kind: "number" },
  unitPrice: { kind: "number" },
};

const FEE_CLIENT_TASK_FIELDS: Record<string, FieldMeta> = {
  taskType: { kind: "select", optionsKey: "taskType" },
  billingUnit: { kind: "select", optionsKey: "billingUnit" },
  unitCount: { kind: "number" },
  clientPrice: { kind: "number" },
};

const INVOICE_FIELDS: Record<string, FieldMeta> = {
  title: { kind: "text" },
  translator: { kind: "select", optionsKey: "assignee" },
  status: { kind: "status", statusAllowed: INVOICE_STATUSES },
  transferDate: { kind: "text" },
  note: { kind: "text" },
  payments: { kind: "json" },
};

const CLIENT_INVOICE_FIELDS: Record<string, FieldMeta> = {
  title: { kind: "text" },
  invoiceNumber: { kind: "text" },
  client: { kind: "select", optionsKey: "client" },
  status: { kind: "status", statusAllowed: CLIENT_INVOICE_STATUSES },
  transferDate: { kind: "text" },
  note: { kind: "text" },
  payments: { kind: "json" },
  isRecordOnly: { kind: "boolean" },
  recordAmount: { kind: "number" },
  recordCurrency: { kind: "text" },
  billingChannel: { kind: "select", optionsKey: "billingChannel" },
  expectedCollectionDate: { kind: "text" },
  adjustmentLines: { kind: "json" },
};

function getOptionLabels(fieldKey: string): string[] {
  return selectOptionsStore.getSortedOptions(fieldKey).map((o) => o.label);
}

function isValidIsoDate(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(Date.parse(value));
}

function validateFileItems(path: string, value: unknown): AgentResult<FileItemShape[]> {
  if (!Array.isArray(value)) return fail(`${path} 必須為陣列`);
  const out: FileItemShape[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!row || typeof row !== "object") return fail(`${path}[${i}] 必須為物件`);
    const o = row as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.url !== "string") {
      return fail(`${path}[${i}] 需含 name 與 url 字串`);
    }
    out.push({
      name: o.name,
      url: o.url,
      size: typeof o.size === "number" ? o.size : undefined,
    });
  }
  return ok(out);
}

function validateLinkObject(path: string, value: unknown): AgentResult<{ url: string; label: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(`${path} 必須為 { url, label } 物件`);
  }
  const o = value as Record<string, unknown>;
  if (typeof o.url !== "string" || typeof o.label !== "string") {
    return fail(`${path}.url 與 .label 必須為字串`);
  }
  return ok({ url: o.url, label: o.label });
}

function validateScalar(path: string, meta: FieldMeta, value: unknown): AgentResult<unknown> {
  switch (meta.kind) {
    case "text":
      if (typeof value !== "string") return fail(`${path} 必須為字串`);
      return ok(value);
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) return fail(`${path} 必須為數字`);
      return ok(value);
    case "boolean":
      if (typeof value !== "boolean") return fail(`${path} 必須為布林值`);
      return ok(value);
    case "isoDate":
      if (!isValidIsoDate(value)) return fail(`${path} 必須為合法 ISO 時間字串或 null`);
      return ok(value);
    case "select": {
      if (typeof value !== "string") return fail(`${path} 必須為字串`);
      const allowed = getOptionLabels(meta.optionsKey!);
      if (value !== "" && allowed.length > 0 && !allowed.includes(value)) {
        return fail(`${path} 的值「${value}」不在合法選項中`, allowed);
      }
      return ok(value);
    }
    case "stringArray": {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        return fail(`${path} 必須為字串陣列`);
      }
      if (meta.optionsKey) {
        const allowed = getOptionLabels(meta.optionsKey);
        for (const v of value) {
          if (v !== "" && allowed.length > 0 && !allowed.includes(v)) {
            return fail(`${path} 含不合法值「${v}」`, allowed);
          }
        }
      }
      return ok(value);
    }
    case "status": {
      if (typeof value !== "string") return fail(`${path} 必須為字串`);
      const allowed = [...(meta.statusAllowed ?? [])];
      if (!allowed.includes(value)) {
        return fail(`${path} 不允許設為「${value}」`, allowed);
      }
      return ok(value);
    }
    case "fileItems":
      return validateFileItems(path, value);
    case "linkObject":
      return validateLinkObject(path, value);
    case "json":
      return ok(value);
    default:
      return fail(`${path} 未知欄位型別`);
  }
}

function validateRecordFields(
  prefix: string,
  fields: Record<string, FieldMeta>,
  patch: Record<string, unknown>,
  allowUnknown = false,
): AgentResult<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const meta = fields[key];
    if (!meta) {
      if (allowUnknown) {
        out[key] = value;
        continue;
      }
      return fail(`${prefix}${key} 不是可寫入欄位`);
    }
    const result = validateScalar(`${prefix}${key}`, meta, value);
    if (result.ok === false) return failFrom(result);
    out[key] = result.data;
  }
  return ok(out);
}

function resolveToolFieldsForEntry(entry: ToolEntry, toolFieldKey: ToolBlockKey): ToolFieldSchema[] {
  const opts = selectOptionsStore.getSortedOptions(toolFieldKey);
  const match = opts.find((o) => o.label === entry.tool);
  if (match?.toolFields?.length) {
    return match.toolFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: (f.type ?? "text") as "text" | "file",
    }));
  }
  if (entry.fields?.length) {
    return entry.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: (f.type ?? "text") as "text" | "file",
    }));
  }
  return [];
}

function validateToolEntries(
  path: string,
  value: unknown,
  toolOptionsKey: string,
): AgentResult<ToolEntry[]> {
  if (!Array.isArray(value)) return fail(`${path} 必須為陣列`);
  const toolLabels = getOptionLabels(toolOptionsKey);
  const out: ToolEntry[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!row || typeof row !== "object") return fail(`${path}[${i}] 必須為物件`);
    const obj = row as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : `te-${Date.now()}-${i}`;
    const tool = typeof obj.tool === "string" ? obj.tool : "";
    if (tool && toolLabels.length > 0 && !toolLabels.includes(tool)) {
      return fail(`${path}[${i}].tool「${tool}」不在合法選項中`, toolLabels);
    }
    const fieldValues =
      obj.fieldValues && typeof obj.fieldValues === "object" && !Array.isArray(obj.fieldValues)
        ? (obj.fieldValues as Record<string, string>)
        : {};
    const fileValues: ToolEntry["fileValues"] = {};
    if (obj.fileValues && typeof obj.fileValues === "object" && !Array.isArray(obj.fileValues)) {
      for (const [fk, fv] of Object.entries(obj.fileValues as Record<string, unknown>)) {
        const fi = validateFileItems(`${path}[${i}].fileValues.${fk}`, fv);
        if (fi.ok === false) return failFrom(fi);
        fileValues[fk] = fi.data;
      }
    }
    out.push({
      id,
      tool,
      fieldValues,
      fileValues,
      fields: Array.isArray(obj.fields) ? (obj.fields as ToolEntry["fields"]) : undefined,
    });
  }
  return ok(out);
}

function validateComments(value: unknown): AgentResult<CaseComment[]> {
  if (!Array.isArray(value)) return fail("comments 必須為陣列");
  const out: CaseComment[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!row || typeof row !== "object") return fail(`comments[${i}] 必須為物件`);
    const o = row as Record<string, unknown>;
    if (typeof o.content !== "string" || typeof o.author !== "string") {
      return fail(`comments[${i}] 需含 author 與 content`);
    }
    out.push({
      id: typeof o.id === "string" ? o.id : `cmt-${Date.now()}-${i}`,
      author: o.author,
      content: o.content,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
      imageUrls: Array.isArray(o.imageUrls) ? (o.imageUrls as string[]) : undefined,
      fileUrls: Array.isArray(o.fileUrls) ? (o.fileUrls as CaseComment["fileUrls"]) : undefined,
      replyTo: typeof o.replyTo === "string" ? o.replyTo : undefined,
    });
  }
  return ok(out);
}

function validateWorkGroups(value: unknown, existing?: WorkGroup[]): AgentResult<WorkGroup[]> {
  const resolved = resolveArrayPatch(existing ?? [], value);
  if (!resolved) return fail("workGroups 必須為陣列或 { mergeById: true, items: [...] }");
  const out: WorkGroup[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    if (!row || typeof row !== "object") return fail(`workGroups[${i}] 必須為物件`);
    const obj = row as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : `wg-${Date.now()}-${i}`;
    const validated = validateRecordFields(`workGroups[${i}].`, WORK_GROUP_FIELDS, obj);
    if (validated.ok === false) return failFrom(validated);
    out.push({ id, workType: "", billingUnit: "", unitCount: 0, ...validated.data } as WorkGroup);
  }
  return ok(out);
}

function validateCollabRows(value: unknown, existing?: CollabRow[]): AgentResult<CollabRow[]> {
  const resolved = resolveArrayPatch(existing ?? [], value);
  if (!resolved) return fail("collabRows 必須為陣列或 { mergeById: true, items: [...] }");
  const out: CollabRow[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    if (!row || typeof row !== "object") return fail(`collabRows[${i}] 必須為物件`);
    const obj = row as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : `cr-${Date.now()}-${i}`;
    const validated = validateRecordFields(`collabRows[${i}].`, COLLAB_ROW_FIELDS, obj);
    if (validated.ok === false) return failFrom(validated);
    out.push({
      id,
      segment: "",
      translator: "",
      unitCount: 0,
      accepted: false,
      translationDeadline: null,
      reviewer: "",
      reviewDeadline: null,
      taskCompleted: false,
      delivered: false,
      ...validated.data,
    } as CollabRow);
  }
  return ok(out);
}

function validateFeeTaskItems(value: unknown, existing?: FeeTaskItem[]): AgentResult<FeeTaskItem[]> {
  const resolved = resolveArrayPatch(existing ?? [], value);
  if (!resolved) return fail("taskItems 必須為陣列或 { mergeById: true, items: [...] }");
  const out: FeeTaskItem[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    if (!row || typeof row !== "object") return fail(`taskItems[${i}] 必須為物件`);
    const obj = row as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : `item-${Date.now()}-${i}`;
    const validated = validateRecordFields(`taskItems[${i}].`, FEE_TASK_ITEM_FIELDS, obj);
    if (validated.ok === false) return failFrom(validated);
    out.push({
      id,
      taskType: "翻譯",
      billingUnit: "字",
      unitCount: 0,
      unitPrice: 0,
      ...validated.data,
    } as FeeTaskItem);
  }
  return ok(out);
}

function validateClientTaskItemsArray(
  value: unknown,
  existing?: ClientInfo["clientTaskItems"],
): AgentResult<ClientInfo["clientTaskItems"]> {
  const resolved = resolveArrayPatch(existing ?? [], value);
  if (!resolved) return fail("clientInfo.clientTaskItems 必須為陣列或 { mergeById: true, items: [...] }");
  const items: ClientInfo["clientTaskItems"] = [];
  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    if (!row || typeof row !== "object") return fail(`clientInfo.clientTaskItems[${i}] 必須為物件`);
    const itemObj = row as Record<string, unknown>;
    const itemId = typeof itemObj.id === "string" ? itemObj.id : `ci-${Date.now()}-${i}`;
    const itemValidated = validateRecordFields(
      `clientInfo.clientTaskItems[${i}].`,
      FEE_CLIENT_TASK_FIELDS,
      itemObj,
    );
    if (itemValidated.ok === false) return failFrom(itemValidated);
    items.push({
      id: itemId,
      taskType: "翻譯",
      billingUnit: "字",
      unitCount: 0,
      clientPrice: 0,
      ...itemValidated.data,
    } as ClientInfo["clientTaskItems"][number]);
  }
  return ok(items);
}

/** 將 clientInfo patch 深層合併到既有值（供 fee.update / 測試使用） */
export function mergeClientInfoPatch(
  existing: ClientInfo,
  patch: Record<string, unknown>,
): AgentResult<ClientInfo> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return fail("clientInfo 必須為物件");
  }

  const {
    clientTaskItems: patchTaskItems,
    clientCaseLink: patchLink,
    ...scalarPatch
  } = patch;

  const validated = validateRecordFields("clientInfo.", CLIENT_INFO_FIELDS, scalarPatch);
  if (validated.ok === false) return failFrom(validated);

  const base: ClientInfo = {
    ...existing,
    ...validated.data,
    clientCaseLink: { ...existing.clientCaseLink },
    clientTaskItems: existing.clientTaskItems.map((item) => ({ ...item })),
  };

  if (patchLink !== undefined) {
    if (typeof patchLink !== "object" || patchLink === null || Array.isArray(patchLink)) {
      return fail("clientInfo.clientCaseLink 必須為物件");
    }
    const linkObj = patchLink as Record<string, unknown>;
    if (linkObj.url !== undefined && typeof linkObj.url !== "string") {
      return fail("clientInfo.clientCaseLink.url 必須為字串");
    }
    if (linkObj.label !== undefined && typeof linkObj.label !== "string") {
      return fail("clientInfo.clientCaseLink.label 必須為字串");
    }
    base.clientCaseLink = {
      url: typeof linkObj.url === "string" ? linkObj.url : existing.clientCaseLink.url,
      label: typeof linkObj.label === "string" ? linkObj.label : existing.clientCaseLink.label,
    };
  }

  if (patchTaskItems !== undefined) {
    const itemsResult = validateClientTaskItemsArray(patchTaskItems, existing.clientTaskItems);
    if (itemsResult.ok === false) return failFrom(itemsResult);
    base.clientTaskItems = itemsResult.data;
  }

  return ok(base);
}

function validateCasePatch(
  patch: Record<string, unknown>,
  existing?: CaseRecord,
): AgentResult<Partial<CaseRecord>> {
  const out: Partial<CaseRecord> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "workGroups") {
      const wg = validateWorkGroups(value, existing?.workGroups);
      if (wg.ok === false) return failFrom(wg);
      out.workGroups = wg.data;
      continue;
    }
    if (key === "collabRows") {
      const cr = validateCollabRows(value, existing?.collabRows);
      if (cr.ok === false) return failFrom(cr);
      out.collabRows = cr.data;
      continue;
    }
    if (key === "tools") {
      const t = validateToolEntries("case.tools", value, "executionTool");
      if (t.ok === false) return failFrom(t);
      out.tools = t.data;
      continue;
    }
    if (key === "questionTools") {
      const t = validateToolEntries("case.questionTools", value, "questionTool");
      if (t.ok === false) return failFrom(t);
      out.questionTools = t.data;
      continue;
    }
    if (key === "comments" || key === "internalComments") {
      const c = validateComments(value);
      if (c.ok === false) return failFrom(c);
      (out as Record<string, unknown>)[key] = c.data;
      continue;
    }
    const meta = CASE_TOP_FIELDS[key];
    if (!meta) {
      return fail(`案件欄位「${key}」不是 AI 切入點可寫入欄位`);
    }
    const result = validateScalar(`case.${key}`, meta, value);
    if (result.ok === false) return failFrom(result);
    (out as Record<string, unknown>)[key] = result.data;
  }
  return ok(out);
}

function validateFeePatch(
  patch: Record<string, unknown>,
  existingFee?: Partial<TranslatorFee>,
): AgentResult<Partial<TranslatorFee>> {
  const out: Partial<TranslatorFee> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "taskItems") {
      const ti = validateFeeTaskItems(value, existingFee?.taskItems);
      if (ti.ok === false) return failFrom(ti);
      out.taskItems = ti.data;
      continue;
    }
    if (key === "clientInfo") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return fail("clientInfo 必須為物件");
      }
      const existingCi = existingFee?.clientInfo ?? defaultClientInfo;
      const ci = mergeClientInfoPatch(existingCi, value as Record<string, unknown>);
      if (ci.ok === false) return failFrom(ci);
      out.clientInfo = ci.data;
      continue;
    }
    const meta = FEE_TOP_FIELDS[key];
    if (!meta) {
      return fail(`費用欄位「${key}」不是 AI 切入點可寫入欄位`);
    }
    const result = validateScalar(`fee.${key}`, meta, value);
    if (result.ok === false) return failFrom(result);
    (out as Record<string, unknown>)[key] = result.data;
  }
  return ok(out);
}

function validateInvoicePatch(patch: Record<string, unknown>): AgentResult<Record<string, unknown>> {
  return validateRecordFields("invoice.", INVOICE_FIELDS, patch, true);
}

function validateClientInvoicePatch(patch: Record<string, unknown>): AgentResult<Record<string, unknown>> {
  return validateRecordFields("clientInvoice.", CLIENT_INVOICE_FIELDS, patch, true);
}

function buildFieldCatalog() {
  const selectFields = (fields: Record<string, FieldMeta>) =>
    Object.entries(fields)
      .filter(([, m]) => m.kind === "select" || m.kind === "stringArray")
      .map(([name, m]) => ({
        field: name,
        kind: m.kind,
        optionsKey: m.optionsKey,
        allowed: m.optionsKey ? getOptionLabels(m.optionsKey) : [],
      }));

  const statusFields = (fields: Record<string, FieldMeta>) =>
    Object.entries(fields)
      .filter(([, m]) => m.kind === "status")
      .map(([name, m]) => ({ field: name, allowed: [...(m.statusAllowed ?? [])] }));

  const scalarFields = (fields: Record<string, FieldMeta>) =>
    Object.entries(fields).map(([name, m]) => ({ field: name, kind: m.kind }));

  return {
    governance: [
      "API 能力完整；實際任務範圍以 Slack／驗收提示為準",
      "仍依賴 Supabase RLS 與登入 session",
      "元件層副作用（Slack、部分 edit_logs）可能不會自動觸發",
    ],
    case: {
      topLevel: scalarFields(CASE_TOP_FIELDS),
      selectFields: selectFields(CASE_TOP_FIELDS),
      statusFields: statusFields(CASE_TOP_FIELDS),
      nested: {
        workGroups: scalarFields(WORK_GROUP_FIELDS),
        collabRows: scalarFields(COLLAB_ROW_FIELDS),
        tools: "ToolEntry[]（tool, fieldValues, fileValues）",
        questionTools: "ToolEntry[]",
        comments: "CaseComment[]",
      },
      fileArrayFields: [
        "workingFiles",
        "sourceFiles",
        "deliveryMethodFiles",
        "clientReceiptFiles",
        "clientGuidelines",
        "customGuidelinesUrl",
        "referenceMaterials",
        "translatorFinal",
        "internalReviewFinal",
        "trackChanges",
      ],
      arrayMerge: "workGroups / collabRows 可傳 { mergeById: true, items: [...] }",
      limitations: [
        "變更紀錄（edit_logs）與 Slack 通知等元件層副作用不會自動觸發",
        "重複標題檢查僅在 UI 公布流程執行",
      ],
    },
    fee: {
      topLevel: scalarFields(FEE_TOP_FIELDS),
      selectFields: selectFields(FEE_TOP_FIELDS),
      statusFields: statusFields(FEE_TOP_FIELDS),
      nested: {
        taskItems: scalarFields(FEE_TASK_ITEM_FIELDS),
        clientInfo: scalarFields(CLIENT_INFO_FIELDS),
        clientTaskItems: scalarFields(FEE_CLIENT_TASK_FIELDS),
      },
      arrayMerge: "taskItems / clientInfo.clientTaskItems 可傳 { mergeById: true, items: [...] }",
      limitations: ["連結案件自動帶入等 UI 連動需手動填欄位"],
    },
    invoice: {
      fields: scalarFields(INVOICE_FIELDS),
      statusFields: statusFields(INVOICE_FIELDS),
    },
    clientInvoice: {
      fields: scalarFields(CLIENT_INVOICE_FIELDS),
      statusFields: statusFields(CLIENT_INVOICE_FIELDS),
      bridgeMethods: [
        "clientInvoice.create({ client, title?, feeIds? })",
        "clientInvoice.addFees(invoiceId, feeIds[]) → { added, skipped, verified }",
        "clientInvoice.adjustAmount(invoiceId, { mode, currency, targetAmount })",
        "clientInvoice.setChannel(invoiceId, channel)",
        "clientInvoice.setExpectedDate(invoiceId, isoDate)",
      ],
      addFeeSkipReasons: [
        "not_found",
        "already_on_invoice",
        "linked_to_other_invoice",
        "client_mismatch",
        "not_reconciled",
      ],
      permissions: "寫入須 PM 以上（is_admin／user_roles pm|executive）；譯者呼叫回 ok:false",
    },
    upload: {
      method: "upload.fromBytes({ fileName, base64|bytes, contentType?, bucket?, pathPrefix? })",
    },
    navigate: {
      method: "navigate.urlFor({ type, id })",
    },
    datetimeFormat: "ISO 8601 字串，例如 2026-06-30T14:30:00.000Z；null 表示清空",
    usage: [
      "先呼叫 describe() 或 options.get(fieldKey) 查合法值",
      "工具多行欄位先 options.getToolSchema(toolLabel) 查 field id／label，再 tool.setField 寫入並回讀驗證",
      "檔案先 upload.fromBytes，再將 { name, url } 寫入欄位",
      "再呼叫 case.update / fee.update / invoice.update 等",
    ],
  };
}

export interface LmsAgentApi {
  describe: () => AgentResult<ReturnType<typeof buildFieldCatalog>>;
  options: {
    get: (fieldKey: string) => AgentResult<{ fieldKey: string; labels: string[] }>;
    listKeys: () => AgentResult<string[]>;
    getToolSchema: (toolLabel: string, toolFieldKey?: string) => AgentResult<{
      toolLabel: string;
      toolFields: { id: string; label: string; type?: string }[];
    }>;
  };
  upload: {
    fromBytes: (input: UploadFromBytesInput) => Promise<AgentResult<UploadedFileItem>>;
  };
  navigate: {
    urlFor: (input: {
      type: "case" | "fee" | "invoice" | "clientInvoice";
      id: string;
    }) => AgentResult<{ path: string; fullUrl: string }>;
  };
  case: {
    list: (filter?: { search?: string; status?: string; limit?: number }) => AgentResult<CaseRecord[]>;
    get: (id: string) => AgentResult<CaseRecord>;
    create: (initial?: Partial<CaseRecord>) => Promise<AgentResult<CaseRecord>>;
    update: (id: string, patch: Partial<CaseRecord>) => Promise<AgentResult<CaseRecord>>;
    getCurrentId: () => AgentResult<{
      urlCaseId: string | null;
      renderedCaseId: string | null;
      matches: boolean;
    }>;
    generateFees: (caseId: string) => Promise<
      AgentResult<{
        caseId: string;
        caseUrl: string;
        fees: { id: string; title: string; path: string; fullUrl: string }[];
      }>
    >;
  };
  fee: {
    list: (filter?: { search?: string; status?: string; limit?: number }) => AgentResult<TranslatorFee[]>;
    get: (id: string) => AgentResult<TranslatorFee>;
    create: (initial?: Partial<TranslatorFee>) => Promise<AgentResult<TranslatorFee>>;
    update: (id: string, patch: Partial<TranslatorFee>) => Promise<AgentResult<TranslatorFee>>;
  };
  invoice: {
    list: (filter?: { search?: string; status?: string; limit?: number }) => AgentResult<Invoice[]>;
    get: (id: string) => AgentResult<Invoice>;
    create: (input: {
      translator: string;
      feeIds?: string[];
      title?: string;
    }) => Promise<AgentResult<Invoice>>;
    update: (id: string, patch: Record<string, unknown>) => Promise<AgentResult<Invoice>>;
    delete: (id: string) => AgentResult<{ id: string }>;
    addFees: (invoiceId: string, feeIds: string[]) => Promise<AgentResult<Invoice>>;
    removeFee: (invoiceId: string, feeId: string) => Promise<AgentResult<Invoice>>;
  };
  clientInvoice: {
    list: (filter?: { search?: string; status?: string; limit?: number }) => AgentResult<ClientInvoice[]>;
    get: (id: string) => AgentResult<ClientInvoice>;
    create: (input: { client: string; title?: string; feeIds?: string[] }) => Promise<
      AgentResult<{ invoice: ClientInvoice; created: boolean; verified: boolean }>
    >;
    update: (id: string, patch: Record<string, unknown>) => Promise<AgentResult<ClientInvoice>>;
    delete: (id: string) => Promise<AgentResult<{ id: string }>>;
    addFees: (
      invoiceId: string,
      feeIds: string[],
    ) => Promise<
      AgentResult<{
        invoice: ClientInvoice;
        added: string[];
        skipped: ClientInvoiceAddFeeSkip[];
        verified: boolean;
      }>
    >;
    removeFee: (invoiceId: string, feeId: string) => Promise<AgentResult<ClientInvoice>>;
    adjustAmount: (
      invoiceId: string,
      input: ClientInvoiceAdjustAmountInput,
    ) => Promise<
      AgentResult<{
        invoice: ClientInvoice;
        line: ClientInvoiceAdjustmentLine | null;
        noop?: boolean;
        verified: boolean;
      }>
    >;
    setChannel: (
      invoiceId: string,
      channel: string,
    ) => Promise<AgentResult<{ invoice: ClientInvoice; verified: boolean }>>;
    setExpectedDate: (
      invoiceId: string,
      isoDate: string,
    ) => Promise<AgentResult<{ invoice: ClientInvoice; verified: boolean }>>;
  };
  tool: {
    setField: (input: ToolSetFieldInput) => Promise<AgentResult<ToolSetFieldResult>>;
  };
}

const OPTION_FIELD_KEYS = [
  "taskType",
  "billingUnit",
  "client",
  "contact",
  "dispatchRoute",
  "caseCategory",
  "executionTool",
  "questionTool",
  "assignee",
  "statusLabel",
  "billingChannel",
  "noteStatus",
  "noteNature",
] as const;

function filterList<T extends { title?: string; status?: string; client?: string }>(
  items: T[],
  filter?: { search?: string; status?: string; limit?: number },
): T[] {
  let result = items;
  if (filter?.status) {
    result = result.filter((x) => x.status === filter.status);
  }
  if (filter?.search?.trim()) {
    const q = filter.search.trim().toLowerCase();
    result = result.filter((x) => {
      const title = (x.title ?? "").toLowerCase();
      const client = ("client" in x && typeof x.client === "string" ? x.client : "").toLowerCase();
      return title.includes(q) || client.includes(q);
    });
  }
  const limit = filter?.limit ?? 50;
  return result.slice(0, Math.max(1, limit));
}

async function assertClientInvoiceWriteAccess(): Promise<AgentResult<void>> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail("未登入");
  const { data: rows, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (error) return fail(`讀取角色失敗：${error.message}`);
  const roles = (rows ?? []).map((r) => r.role);
  return assertPmPlusFromRoles(roles);
}

async function ensureFeesLoaded(): Promise<void> {
  if (!feeStore.isLoaded()) await feeStore.loadFees();
}

/**
 * 【W10 clientInvoice bridge 退回修正，高危 bug 根因】
 * 先前的「回讀驗證」是呼叫 `clientInvoiceStore.loadInvoices()` 做一次全新的
 * 網路 SELECT，但當時 `updateInvoice`／`deleteInvoice` 是 fire-and-forget
 * （寫入 promise 未被 await），SELECT 經常搶在 UPDATE／DELETE 送達伺服器
 * 之前就先執行，讀回舊資料，導致「回讀不一致」對所有寫入方法恆為 true
 * （即使資料庫其實已寫入成功）。驗收發現此為高危 bug：呼叫端誤判失敗而
 * 重試，導致 create 產生重複請款單。
 *
 * 修正：store 的寫入方法已改為 async 並 await 實際的 DB 寫入（`update`／
 * `delete` 皆帶 `.select()` 取回權威資料列，寫入完成才 resolve）。因此
 * bridge 這裡不再需要、也不應該再觸發第二次網路 reload 來「驗證」——
 * 只要 await 寫入方法回傳且 `error` 為 null，直接讀本地 store（此時已由
 * 寫入方法用伺服器回傳的權威列同步過）即為可信的最新狀態，沒有競態。
 * 「重新整理後仍在」的持久化標準改由 Playwright 的 `page.reload()` 驗證
 * （比照 C1），不在此函式重複做網路來回。
 */
function describeStoreError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

const CLIENT_INVOICE_ADJUST_MODES: readonly ClientInvoiceAdjustMode[] = ["set_target", "add", "subtract"];

function pathForType(type: string, id: string): string {
  switch (type) {
    case "case":
      return `/cases/${id}`;
    case "fee":
      return `/fees/${id}`;
    case "invoice":
      return `/invoices/${id}`;
    case "clientInvoice":
      return `/client-invoices/${id}`;
    default:
      return `/`;
  }
}

async function getCurrentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id ?? "";
}

export function buildLmsAgentApi(): LmsAgentApi {
  return {
    describe: () => ok(buildFieldCatalog()),

    options: {
      get: (fieldKey: string) => {
        if (!OPTION_FIELD_KEYS.includes(fieldKey as (typeof OPTION_FIELD_KEYS)[number])) {
          return fail(`未知 options 欄位「${fieldKey}」`, [...OPTION_FIELD_KEYS]);
        }
        return ok({ fieldKey, labels: getOptionLabels(fieldKey) });
      },
      listKeys: () => ok([...OPTION_FIELD_KEYS]),
      getToolSchema: (toolLabel: string, toolFieldKey = "executionTool") => {
        const opts = selectOptionsStore.getSortedOptions(toolFieldKey);
        const match = opts.find((o) => o.label === toolLabel);
        if (!match) {
          return fail(`找不到工具「${toolLabel}」`, opts.map((o) => o.label));
        }
        const toolFields = (match.toolFields ?? []).map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type ?? "text",
        }));
        return ok({ toolLabel, toolFields });
      },
    },

    upload: {
      fromBytes: (input) => uploadFromBytes(input),
    },

    navigate: {
      urlFor: ({ type, id }) => {
        const path = pathForType(type, id);
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        return ok({ path, fullUrl: `${origin}${path}` });
      },
    },

    case: {
      list: (filter) => ok(filterList(caseStore.getAll(), filter)),

      get: (id) => {
        const record = caseStore.getById(id);
        if (!record) return fail(`找不到案件 id=${id}`);
        return ok(record);
      },

      // W9 wave 2 C3：偵測導覽後 React state 殘留（state bleed）。
      // 比對 URL 上的案件 id 與 CaseDetailPage 實際渲染中的案件 id，
      // 兩者不一致時代表畫面尚未同步（例如複製案件跳轉後短暫顯示舊案件內容）。
      getCurrentId: () => {
        const path = typeof window !== "undefined" ? window.location.pathname : "";
        const match = path.match(/^\/cases\/([^/]+)/);
        const urlCaseId = match ? match[1] : null;
        const renderedCaseId =
          typeof window !== "undefined" ? window.__caseDetailRenderedCaseId ?? null : null;
        return ok({
          urlCaseId,
          renderedCaseId,
          matches: urlCaseId !== null && urlCaseId === renderedCaseId,
        });
      },

      create: async (initial = {}) => {
        const patch = { ...initial, status: (initial.status ?? "draft") as CaseStatus };
        const validated = validateCasePatch(patch as Record<string, unknown>);
        if (validated.ok === false) return failFrom(validated);
        const created = await caseStore.create({
          title: "新案件",
          status: "draft",
          ...validated.data,
        });
        if (!created) return fail("建立案件失敗（資料庫寫入錯誤）");
        return ok(created);
      },

      update: async (id, patch) => {
        const existing = caseStore.getById(id);
        if (!existing) return fail(`找不到案件 id=${id}`);
        const validated = validateCasePatch(patch as Record<string, unknown>, existing);
        if (validated.ok === false) return failFrom(validated);
        const writeError = await caseStore.update(id, validated.data);
        if (writeError) return failWriteFailed("案件", describeStoreError(writeError));
        return readbackAfterWrite("案件", id, () => caseStore.getById(id));
      },

      generateFees: async (caseId) => {
        const caseData = caseStore.getById(caseId);
        if (!caseData) return fail(`找不到案件 id=${caseId}`);
        const uid = await getCurrentUserId();
        const result = generateFeesForCase(caseData, uid);
        if (!result || result.feeCount === 0) {
          return fail("無法產生費用單（請確認案件 workGroups／譯者）");
        }
        const caseUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/cases/${caseId}`;
        const fees = result.feeIds.map((fid) => {
          const f = feeStore.getFeeById(fid);
          const path = `/fees/${fid}`;
          return {
            id: fid,
            title: f?.title ?? "",
            path,
            fullUrl: `${typeof window !== "undefined" ? window.location.origin : ""}${path}`,
          };
        });
        return ok({ caseId, caseUrl, fees });
      },
    },

    fee: {
      list: (filter) => ok(filterList(feeStore.getFees(), filter)),

      get: (id) => {
        const record = feeStore.getFeeById(id);
        if (!record) return fail(`找不到費用 id=${id}`);
        return ok(record);
      },

      create: async (initial = {}) => {
        const draft = feeStore.createDraft();
        if (Object.keys(initial).length === 0) return ok(draft);
        const validated = validateFeePatch(initial as Record<string, unknown>, draft);
        if (validated.ok === false) return failFrom(validated);
        feeStore.updateFee(draft.id, validated.data);
        return readbackAfterWrite("費用", draft.id, () => feeStore.getFeeById(draft.id));
      },

      update: async (id, patch) => {
        const existing = feeStore.getFeeById(id);
        if (!existing) return fail(`找不到費用 id=${id}`);
        const validated = validateFeePatch(patch as Record<string, unknown>, existing);
        if (validated.ok === false) return failFrom(validated);
        const updates = { ...validated.data };
        if (updates.status === "finalized" && existing.status !== "finalized") {
          const uid = await getCurrentUserId();
          updates.finalizedBy = uid || undefined;
          updates.finalizedAt = new Date().toISOString();
        }
        feeStore.updateFee(id, updates);
        return readbackAfterWrite("費用", id, () => feeStore.getFeeById(id));
      },
    },

    invoice: {
      list: (filter) => ok(filterList(invoiceStore.getInvoices(), filter)),

      get: (id) => {
        const inv = invoiceStore.getInvoiceById(id);
        if (!inv) return fail(`找不到譯者請款 id=${id}`);
        return ok(inv);
      },

      create: async ({ translator, feeIds = [], title }) => {
        const created = await invoiceStore.createInvoice(translator, feeIds);
        if (!created) return failWriteFailed("譯者請款", "建立譯者請款失敗");
        if (title) invoiceStore.updateInvoice(created.id, { title });
        return readbackAfterWrite("譯者請款", created.id, () => invoiceStore.getInvoiceById(created.id));
      },

      update: async (id, patch) => {
        const existing = invoiceStore.getInvoiceById(id);
        if (!existing) return fail(`找不到譯者請款 id=${id}`);
        const validated = validateInvoicePatch(patch);
        if (validated.ok === false) return failFrom(validated);
        invoiceStore.updateInvoice(id, validated.data);
        return readbackAfterWrite("譯者請款", id, () => invoiceStore.getInvoiceById(id));
      },

      delete: (id) => {
        if (!invoiceStore.getInvoiceById(id)) return fail(`找不到譯者請款 id=${id}`);
        invoiceStore.deleteInvoice(id);
        return ok({ id });
      },

      addFees: async (invoiceId, feeIds) => {
        if (!invoiceStore.getInvoiceById(invoiceId)) return fail(`找不到譯者請款 id=${invoiceId}`);
        await invoiceStore.addFeesToInvoice(invoiceId, feeIds);
        return readbackAfterWrite("譯者請款", invoiceId, () => invoiceStore.getInvoiceById(invoiceId));
      },

      removeFee: async (invoiceId, feeId) => {
        if (!invoiceStore.getInvoiceById(invoiceId)) return fail(`找不到譯者請款 id=${invoiceId}`);
        await invoiceStore.removeFeeFromInvoice(invoiceId, feeId);
        return readbackAfterWrite("譯者請款", invoiceId, () => invoiceStore.getInvoiceById(invoiceId));
      },
    },

    clientInvoice: {
      list: (filter) => ok(filterList(clientInvoiceStore.getInvoices(), filter)),

      get: (id) => {
        const inv = clientInvoiceStore.getInvoiceById(id);
        if (!inv) return fail(`找不到客戶請款 id=${id}`);
        return ok(inv);
      },

      create: async ({ client, feeIds = [], title }) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);

        const clientVal = String(client || "").trim();
        if (!clientVal) return fail("client 必填");
        const clientCheck = validateScalar("clientInvoice.client", CLIENT_INVOICE_FIELDS.client, clientVal);
        if (clientCheck.ok === false) return failFrom(clientCheck);

        let trimmedTitle: string | undefined;
        if (title !== undefined) {
          const titleCheck = validateScalar("clientInvoice.title", CLIENT_INVOICE_FIELDS.title, String(title));
          if (titleCheck.ok === false) return failFrom(titleCheck);
          trimmedTitle = String(title).trim();
        }

        const created = await clientInvoiceStore.createInvoice(clientVal, feeIds);
        if (!created) {
          return failWriteFailed(
            "客戶請款",
            "可能無 PM 以上權限或 RLS 拒絕，資料庫確認未寫入",
          );
        }

        // 【防重複保障】INSERT 已成功、DB 已有此筆列——此後不論後續（例如
        // 補寫 title）是否順利，一律回 ok:true + created:true，只在
        // verified 欄位反映是否完全符合預期，禁止回 ok:false 讓呼叫端
        // 誤判「未建立」而重試造成重複請款單。
        let finalInvoice: ClientInvoice = created;
        let verified = finalInvoice.client === clientVal;

        if (trimmedTitle) {
          // create 後立刻 update title 可能撞上 INSERT／UPDATE 競態（0 列、無 error 以外的
          // 「更新未套用」）；短輪詢重試直到 title 落地或逾時（仍不改 ok:true 防重寫政策）。
          const titleDeadline = Date.now() + STORE_READBACK_TIMEOUT_MS;
          let titleOk = false;
          while (Date.now() < titleDeadline) {
            const { error: titleErr } = await clientInvoiceStore.updateInvoice(created.id, {
              title: trimmedTitle,
            });
            const latest = await awaitStoreReadback(
              () => clientInvoiceStore.getInvoiceById(created.id),
              { timeoutMs: 400, intervalMs: STORE_READBACK_INTERVAL_MS },
            );
            if (latest) finalInvoice = latest;
            if (!titleErr && finalInvoice.title === trimmedTitle) {
              titleOk = true;
              break;
            }
            await new Promise((r) => setTimeout(r, STORE_READBACK_INTERVAL_MS));
          }
          verified = verified && titleOk;
        }

        return ok({ invoice: finalInvoice, created: true, verified });
      },

      update: async (id, patch) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);
        const existing = clientInvoiceStore.getInvoiceById(id);
        if (!existing) return fail(`找不到客戶請款 id=${id}`);
        const validated = validateClientInvoicePatch(patch);
        if (validated.ok === false) return failFrom(validated);

        const { error } = await clientInvoiceStore.updateInvoice(id, validated.data);
        if (error) return failWriteFailed("客戶請款", describeStoreError(error));

        return readbackAfterWrite("客戶請款", id, () => clientInvoiceStore.getInvoiceById(id));
      },

      delete: async (id) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);
        if (!clientInvoiceStore.getInvoiceById(id)) return fail(`找不到客戶請款 id=${id}`);

        const { error } = await clientInvoiceStore.deleteInvoice(id);
        if (error) return fail(`刪除失敗：${describeStoreError(error)}`);
        return ok({ id });
      },

      addFees: async (invoiceId, feeIds) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);

        const invoice = clientInvoiceStore.getInvoiceById(invoiceId);
        if (!invoice) return fail(`找不到客戶請款 id=${invoiceId}`);
        if (!Array.isArray(feeIds) || feeIds.length === 0) return fail("feeIds 須為非空陣列");

        await ensureFeesLoaded();
        const feesById = new Map(feeStore.getFees().map((f) => [f.id, f]));
        const allLinked = clientInvoiceStore.getLinkedFeeIds();
        const plan = planClientInvoiceAddFees(feeIds, invoice, feesById, allLinked);

        if (plan.toAdd.length > 0) {
          const { error } = await clientInvoiceStore.addFeesToInvoice(invoiceId, plan.toAdd);
          if (error) return failWriteFailed("客戶請款", `加入費用失敗：${describeStoreError(error)}`);
        }

        const updatedResult = await readbackAfterWrite(
          "客戶請款",
          invoiceId,
          () => clientInvoiceStore.getInvoiceById(invoiceId),
        );
        if (updatedResult.ok === false) return failFrom(updatedResult);
        const updated = updatedResult.data;

        const verified = plan.toAdd.length === 0 || verifyFeeIdsOnInvoice(updated, plan.toAdd);

        return ok({
          invoice: updated,
          added: plan.toAdd,
          skipped: plan.skipped,
          verified,
        });
      },

      removeFee: async (invoiceId, feeId) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);
        if (!clientInvoiceStore.getInvoiceById(invoiceId)) return fail(`找不到客戶請款 id=${invoiceId}`);

        const { error } = await clientInvoiceStore.removeFeeFromInvoice(invoiceId, feeId);
        if (error) return failWriteFailed("客戶請款", `移除費用失敗：${describeStoreError(error)}`);

        return readbackAfterWrite("客戶請款", invoiceId, () => clientInvoiceStore.getInvoiceById(invoiceId));
      },

      adjustAmount: async (invoiceId, input) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);

        const invoice = clientInvoiceStore.getInvoiceById(invoiceId);
        if (!invoice) return fail(`找不到客戶請款 id=${invoiceId}`);
        if (!input || typeof input !== "object") return fail("input 必須為物件");

        const mode = String(input.mode || "") as ClientInvoiceAdjustMode;
        if (!CLIENT_INVOICE_ADJUST_MODES.includes(mode)) {
          return fail(`mode 須為 set_target／add／subtract 之一`, [...CLIENT_INVOICE_ADJUST_MODES]);
        }

        const currency = String(input.currency || "").trim();
        const currencyCodes = currencyStore.getCurrencies().map((c) => c.code);
        if (!currency || !currencyCodes.includes(currency)) {
          return fail(`currency 須為已設定幣別代碼`, currencyCodes);
        }

        const targetAmount = Number(input.targetAmount);
        if (!Number.isFinite(targetAmount)) return fail("targetAmount 須為數字");

        await ensureFeesLoaded();
        const clientOptions = selectOptionsStore.getSortedOptions("client");
        const linkedFees = invoice.feeIds
          .map((fid) => feeStore.getFeeById(fid))
          .filter(Boolean) as TranslatorFee[];
        const clientCurrency = resolveClientCurrency(invoice.client, clientOptions);
        const getTwdRate = currencyStore.getTwdRate.bind(currencyStore);
        const feeTotals = computeFeeTotalsByCurrency(linkedFees, clientOptions);
        const adjSum = computeAdjustmentSumInClientCurrency(
          invoice.adjustmentLines || [],
          clientCurrency,
          getTwdRate,
        );

        const computed = computeClientInvoiceAdjustmentLine({
          mode,
          currency,
          targetAmount,
          feeTotalsByCurrency: feeTotals,
          adjustmentSumInClientCurrency: adjSum,
          clientCurrency,
          getTwdRate,
        });
        if (computed.ok === false) return fail(computed.error);

        if (computed.noop) {
          return ok({ invoice, line: null, noop: true, verified: true });
        }

        if (!computed.line) return fail("無法產生調整列");
        const nextLines = [...(invoice.adjustmentLines || []), computed.line];
        const { error } = await clientInvoiceStore.updateInvoice(invoiceId, { adjustmentLines: nextLines });
        if (error) return failWriteFailed("客戶請款", `調整請款額失敗：${describeStoreError(error)}`);

        const updatedResult = await readbackAfterWrite(
          "客戶請款",
          invoiceId,
          () => clientInvoiceStore.getInvoiceById(invoiceId),
        );
        if (updatedResult.ok === false) return failFrom(updatedResult);
        const updated = updatedResult.data;
        const verified = (updated.adjustmentLines || []).some((l) => l.id === computed.line!.id);
        return ok({ invoice: updated, line: computed.line, verified });
      },

      setChannel: async (invoiceId, channel) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);

        if (!clientInvoiceStore.getInvoiceById(invoiceId)) return fail(`找不到客戶請款 id=${invoiceId}`);
        const validated = validateScalar(
          "clientInvoice.billingChannel",
          CLIENT_INVOICE_FIELDS.billingChannel,
          String(channel ?? ""),
        );
        if (validated.ok === false) return failFrom(validated);

        const { error } = await clientInvoiceStore.updateInvoice(invoiceId, { billingChannel: validated.data as string });
        if (error) return failWriteFailed("客戶請款", `設定請款管道失敗：${describeStoreError(error)}`);

        const expected = validated.data as string;
        const updated = await awaitStoreReadbackMatch(
          () => clientInvoiceStore.getInvoiceById(invoiceId),
          (inv) => inv.billingChannel === expected,
        );
        if (!updated) return failReadbackTimedOut("客戶請款", invoiceId);
        return ok({ invoice: updated, verified: true });
      },

      setExpectedDate: async (invoiceId, isoDate) => {
        const perm = await assertClientInvoiceWriteAccess();
        if (perm.ok === false) return failFrom(perm);

        if (!clientInvoiceStore.getInvoiceById(invoiceId)) return fail(`找不到客戶請款 id=${invoiceId}`);
        const raw = String(isoDate ?? "").trim();
        if (!raw) return fail("isoDate 必填");
        if (!isValidDateOnlyOrIso(raw)) return fail("isoDate 須為 YYYY-MM-DD 或合法 ISO 日期");
        const normalized = normalizeExpectedCollectionDate(raw);

        const { error } = await clientInvoiceStore.updateInvoice(invoiceId, { expectedCollectionDate: normalized });
        if (error) return failWriteFailed("客戶請款", `設定預計收款日失敗：${describeStoreError(error)}`);

        const updated = await awaitStoreReadbackMatch(
          () => clientInvoiceStore.getInvoiceById(invoiceId),
          (inv) => inv.expectedCollectionDate === normalized,
        );
        if (!updated) return failReadbackTimedOut("客戶請款", invoiceId);
        return ok({ invoice: updated, verified: true });
      },
    },

    tool: {
      setField: async (input) => {
        if (!input || typeof input !== "object") return fail("input 必須為物件");
        const caseId = String(input.caseId || "").trim();
        if (!caseId) return fail("caseId 必填");

        const existing = caseStore.getById(caseId);
        if (!existing) return fail(`找不到案件 id=${caseId}`);

        const toolFieldKey: ToolBlockKey = input.toolFieldKey ?? "executionTool";
        const tools = getEffectiveToolEntries(existing, toolFieldKey);
        const idxResult = pickToolEntryIndex(tools, input);
        if (idxResult.ok === false) return failFrom(idxResult);

        const entry = tools[idxResult.data];
        const toolFields = resolveToolFieldsForEntry(entry, toolFieldKey);
        if (toolFields.length === 0) {
          return fail(
            `工具「${entry.tool || "（未選）"}」尚無可寫入欄位定義；請先 options.getToolSchema 查欄位，或以 case.update 寫入含 fields 的 tools 列`,
          );
        }

        const built = buildToolFieldWritePatch(existing, { ...input, caseId }, toolFields);
        if (built.ok === false) return failFrom(built);

        const validated = validateCasePatch(built.data.patch, existing);
        if (validated.ok === false) return failFrom(validated);

        const writeError = await caseStore.update(caseId, validated.data);
        if (writeError) return failWriteFailed("案件", describeStoreError(writeError));
        const updated = await awaitStoreReadbackMatch(
          () => caseStore.getById(caseId),
          (rec) => {
            const tools = getEffectiveToolEntries(rec, built.data.meta.toolFieldKey);
            const entry =
              tools.find((t) => t.id === built.data.meta.toolEntryId) ??
              tools[built.data.meta.toolIndex];
            const actual = entry?.fieldValues?.[built.data.meta.fieldId] ?? "";
            return finalizeToolSetFieldResult(built.data.meta, input.value, actual).verified;
          },
        );
        if (!updated) return failReadbackTimedOut("案件", caseId);

        {
          const tools = getEffectiveToolEntries(updated, built.data.meta.toolFieldKey);
          const entry =
            tools.find((t) => t.id === built.data.meta.toolEntryId) ??
            tools[built.data.meta.toolIndex];
          const actual = entry?.fieldValues?.[built.data.meta.fieldId] ?? "";
          const result = finalizeToolSetFieldResult(built.data.meta, input.value, actual);
          if (!result.verified) {
            return fail(`寫入後回讀不一致（fieldId=${result.fieldId}）`);
          }
          return ok(result);
        }
      },
    },
  };
}

export interface TmsAgentApi extends LmsAgentApi {
  lms: LmsAgentApi;
  cat: {
    invoke: (
      method: string,
      args?: unknown[],
    ) => Promise<AgentResult<unknown>>;
    describe: () => AgentResult<{ note: string; iframeRequired: boolean }>;
  };
}

declare global {
  interface Window {
    __lmsAgent?: LmsAgentApi;
    __tmsAgent?: TmsAgentApi;
    __catAgentInvokePending?: Map<string, { resolve: (v: AgentResult<unknown>) => void; reject: (e: Error) => void }>;
  }
}

function buildTmsAgentApi(lms: LmsAgentApi): TmsAgentApi {
  return {
    ...lms,
    lms,
    cat: {
      describe: () =>
        ok({
          note: "CAT 操作請在 iframe 內使用 window.__catAgent，或呼叫 __tmsAgent.cat.invoke",
          iframeRequired: true,
        }),
      invoke: (method, args = []) =>
        new Promise((resolve) => {
          if (typeof window === "undefined") {
            resolve(fail("僅瀏覽器環境可用"));
            return;
          }
          const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="/cat/"]');
          if (!iframe?.contentWindow) {
            resolve(fail("找不到 CAT iframe；請先開啟 /cat 頁面"));
            return;
          }
          const requestId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          if (!window.__catAgentInvokePending) {
            window.__catAgentInvokePending = new Map();
          }
          const timer = window.setTimeout(() => {
            window.__catAgentInvokePending?.delete(requestId);
            resolve(fail("CAT invoke 逾時"));
          }, 120000);
          window.__catAgentInvokePending.set(requestId, {
            resolve: (v) => {
              window.clearTimeout(timer);
              resolve(v);
            },
            reject: (e) => {
              window.clearTimeout(timer);
              resolve(fail(e.message));
            },
          });
          iframe.contentWindow.postMessage(
            { type: "CAT_AGENT_INVOKE", requestId, method, args },
            window.location.origin,
          );
        }),
    },
  };
}

export function installAiAgentBridge(): void {
  if (typeof window === "undefined") return;
  const lms = buildLmsAgentApi();
  window.__lmsAgent = lms;
  window.__tmsAgent = buildTmsAgentApi(lms);

  if (!window.__catAgentInvokePending) {
    window.__catAgentInvokePending = new Map();
  }
  window.addEventListener("message", (ev) => {
    if (ev.origin !== window.location.origin) return;
    const data = ev.data;
    if (!data || data.type !== "CAT_AGENT_INVOKE_RESULT") return;
    const pending = window.__catAgentInvokePending?.get(data.requestId);
    if (!pending) return;
    window.__catAgentInvokePending?.delete(data.requestId);
    if (data.ok === false) {
      pending.resolve({ ok: false, error: data.error || "CAT invoke 失敗", allowed: data.allowed });
    } else {
      pending.resolve({ ok: true, data: data.data });
    }
  });
}

// 向後相容匯出（測試與舊文件）
export const CASE_STATUS_ALLOWED = ALL_CASE_STATUSES;
export const CASE_STATUS_BLOCKED: readonly CaseStatus[] = [];
