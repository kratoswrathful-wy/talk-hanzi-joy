/**
 * LMS AI 操作切入點：掛載 window.__lmsAgent，供 AI 以腳本讀寫案件單／費用單。
 * 複用 caseStore / feeStore 寫入路徑；下拉合法值讀 selectOptionsStore。
 */
import { caseStore } from "@/stores/case-store";
import { feeStore } from "@/stores/fee-store";
import { selectOptionsStore } from "@/stores/select-options-store";
import type { CaseRecord, CaseStatus, CollabRow, WorkGroup } from "@/data/case-types";
import type { ClientInfo, FeeTaskItem, TranslatorFee } from "@/data/fee-mock-data";
import { defaultClientInfo } from "@/data/fee-mock-data";

/** 結構化回傳 */
export type AgentResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; allowed?: string[] };

/** 案件／費用可寫入的 workflow 狀態（不含定案／交件等敏感態） */
export const CASE_STATUS_ALLOWED: readonly CaseStatus[] = ["draft", "inquiry", "dispatched"];
export const CASE_STATUS_BLOCKED: readonly CaseStatus[] = [
  "task_completed",
  "delivered",
  "feedback",
  "feedback_completed",
];

type FieldKind = "text" | "number" | "boolean" | "isoDate" | "select" | "status" | "stringArray";

interface FieldMeta {
  kind: FieldKind;
  optionsKey?: string;
  statusAllowed?: readonly string[];
}

const CASE_TOP_FIELDS: Record<string, FieldMeta> = {
  title: { kind: "text" },
  status: { kind: "status", statusAllowed: CASE_STATUS_ALLOWED },
  client: { kind: "select", optionsKey: "client" },
  contact: { kind: "select", optionsKey: "contact" },
  keyword: { kind: "text" },
  clientPoNumber: { kind: "text" },
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
  deliveryMethod: { kind: "text" },
  clientReceipt: { kind: "text" },
  feeEntry: { kind: "text" },
  multiCollab: { kind: "boolean" },
  collabCount: { kind: "number" },
  internalNoteForm: { kind: "boolean" },
  clientQuestionForm: { kind: "boolean" },
  catToolEnabled: { kind: "boolean" },
  otherLoginInfo: { kind: "text" },
  loginAccount: { kind: "text" },
  loginPassword: { kind: "text" },
  onlineToolProject: { kind: "text" },
  onlineToolFilename: { kind: "text" },
  questionForm: { kind: "text" },
};

const FEE_TOP_FIELDS: Record<string, FieldMeta> = {
  title: { kind: "text" },
  assignee: { kind: "select", optionsKey: "assignee" },
  status: { kind: "status", statusAllowed: ["draft"] },
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

function ok<T>(data: T): AgentResult<T> {
  return { ok: true, data };
}

function fail(error: string, allowed?: string[]): AgentResult<never> {
  return { ok: false, error, allowed };
}

/** 從失敗結果轉發 error（避免 union 窄化問題） */
function failFrom(result: Extract<AgentResult<unknown>, { ok: false }>): AgentResult<never> {
  return fail(result.error, result.allowed);
}

function getOptionLabels(fieldKey: string): string[] {
  return selectOptionsStore.getSortedOptions(fieldKey).map((o) => o.label);
}

function isValidIsoDate(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || !value.trim()) return false;
  const ts = Date.parse(value);
  return !Number.isNaN(ts);
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
      if ((CASE_STATUS_BLOCKED as readonly string[]).includes(value)) {
        return fail(`${path} 為敏感 workflow 狀態，AI 切入點不可寫入`, [...CASE_STATUS_ALLOWED]);
      }
      return ok(value);
    }
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

function validateWorkGroups(value: unknown): AgentResult<WorkGroup[]> {
  if (!Array.isArray(value)) return fail("workGroups 必須為陣列");
  const out: WorkGroup[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!row || typeof row !== "object") return fail(`workGroups[${i}] 必須為物件`);
    const obj = row as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : `wg-${Date.now()}-${i}`;
    const validated = validateRecordFields(`workGroups[${i}].`, WORK_GROUP_FIELDS, obj);
    if (validated.ok === false) return failFrom(validated);
    out.push({ id, workType: "", billingUnit: "", unitCount: 0, ...validated.data } as WorkGroup);
  }
  return ok(out);
}

function validateCollabRows(value: unknown): AgentResult<CollabRow[]> {
  if (!Array.isArray(value)) return fail("collabRows 必須為陣列");
  const out: CollabRow[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
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

function validateFeeTaskItems(value: unknown): AgentResult<FeeTaskItem[]> {
  if (!Array.isArray(value)) return fail("taskItems 必須為陣列");
  const out: FeeTaskItem[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
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

function validateClientInfo(value: unknown): AgentResult<ClientInfo> {
  if (!value || typeof value !== "object") return fail("clientInfo 必須為物件");
  const obj = value as Record<string, unknown>;
  const validated = validateRecordFields("clientInfo.", CLIENT_INFO_FIELDS, obj);
  if (validated.ok === false) return failFrom(validated);
  const base = { ...defaultClientInfo, ...validated.data } as ClientInfo;
  if (obj.clientTaskItems !== undefined) {
    if (!Array.isArray(obj.clientTaskItems)) return fail("clientInfo.clientTaskItems 必須為陣列");
    const items = [];
    for (let i = 0; i < obj.clientTaskItems.length; i++) {
      const row = obj.clientTaskItems[i];
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
      });
    }
    base.clientTaskItems = items as ClientInfo["clientTaskItems"];
  }
  return ok(base);
}

function validateCasePatch(patch: Record<string, unknown>): AgentResult<Partial<CaseRecord>> {
  const out: Partial<CaseRecord> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "workGroups") {
      const wg = validateWorkGroups(value);
      if (wg.ok === false) return failFrom(wg);
      out.workGroups = wg.data;
      continue;
    }
    if (key === "collabRows") {
      const cr = validateCollabRows(value);
      if (cr.ok === false) return failFrom(cr);
      out.collabRows = cr.data;
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

function validateFeePatch(patch: Record<string, unknown>): AgentResult<Partial<TranslatorFee>> {
  const out: Partial<TranslatorFee> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "taskItems") {
      const ti = validateFeeTaskItems(value);
      if (ti.ok === false) return failFrom(ti);
      out.taskItems = ti.data;
      continue;
    }
    if (key === "clientInfo") {
      const ci = validateClientInfo(value);
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
    case: {
      topLevel: scalarFields(CASE_TOP_FIELDS),
      selectFields: selectFields(CASE_TOP_FIELDS),
      statusFields: statusFields(CASE_TOP_FIELDS),
      nested: {
        workGroups: scalarFields(WORK_GROUP_FIELDS),
        collabRows: scalarFields(COLLAB_ROW_FIELDS),
      },
      datetimeFields: [
        "translationDeadline",
        "reviewDeadline",
        "collabRows[].translationDeadline",
        "collabRows[].reviewDeadline",
      ],
      booleanFields: [
        "multiCollab",
        "internalNoteForm",
        "clientQuestionForm",
        "catToolEnabled",
        "collabRows[].accepted",
        "collabRows[].taskCompleted",
        "collabRows[].delivered",
      ],
      blockedStatuses: [...CASE_STATUS_BLOCKED],
      allowedStatuses: [...CASE_STATUS_ALLOWED],
      limitations: [
        "不提供 delete",
        "變更紀錄（edit_logs）與 Slack 通知等元件層副作用不會自動觸發",
        "重複標題檢查僅在 UI 公布流程執行，AI 直接寫入 title 不會彈對話框",
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
      booleanFields: Object.keys(CLIENT_INFO_FIELDS).filter((k) => CLIENT_INFO_FIELDS[k].kind === "boolean"),
      limitations: [
        "不可定案（status 不可設為 finalized）",
        "已 finalized 的費用單不可修改",
        "不提供 delete",
        "連結案件自動帶入等 UI 連動需手動填欄位",
      ],
    },
    datetimeFormat: "ISO 8601 字串，例如 2026-06-30T14:30:00.000Z；null 表示清空",
    usage: [
      "先呼叫 describe() 或 options.get(fieldKey) 查合法值",
      "再呼叫 case.update / fee.update 或 create",
    ],
  };
}

export interface LmsAgentApi {
  describe: () => AgentResult<ReturnType<typeof buildFieldCatalog>>;
  options: {
    get: (fieldKey: string) => AgentResult<{ fieldKey: string; labels: string[] }>;
    listKeys: () => AgentResult<string[]>;
  };
  case: {
    list: (filter?: { search?: string; status?: string; limit?: number }) => AgentResult<CaseRecord[]>;
    get: (id: string) => AgentResult<CaseRecord>;
    create: (initial?: Partial<CaseRecord>) => Promise<AgentResult<CaseRecord>>;
    update: (id: string, patch: Partial<CaseRecord>) => Promise<AgentResult<CaseRecord>>;
  };
  fee: {
    list: (filter?: { search?: string; status?: string; limit?: number }) => AgentResult<TranslatorFee[]>;
    get: (id: string) => AgentResult<TranslatorFee>;
    create: (initial?: Partial<TranslatorFee>) => AgentResult<TranslatorFee>;
    update: (id: string, patch: Partial<TranslatorFee>) => AgentResult<TranslatorFee>;
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

function filterList<T extends { title?: string; status?: string }>(
  items: T[],
  filter?: { search?: string; status?: string; limit?: number },
): T[] {
  let result = items;
  if (filter?.status) {
    result = result.filter((x) => x.status === filter.status);
  }
  if (filter?.search?.trim()) {
    const q = filter.search.trim().toLowerCase();
    result = result.filter((x) => (x.title ?? "").toLowerCase().includes(q));
  }
  const limit = filter?.limit ?? 50;
  return result.slice(0, Math.max(1, limit));
}

function buildAgentApi(): LmsAgentApi {
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
    },

    case: {
      list: (filter) => ok(filterList(caseStore.getAll(), filter)),

      get: (id) => {
        const record = caseStore.getById(id);
        if (!record) return fail(`找不到案件 id=${id}`);
        return ok(record);
      },

      create: async (initial = {}) => {
        const patch = { ...initial, status: "draft" as CaseStatus };
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
        const validated = validateCasePatch(patch as Record<string, unknown>);
        if (validated.ok === false) return failFrom(validated);
        await caseStore.update(id, validated.data);
        const updated = caseStore.getById(id);
        return updated ? ok(updated) : fail("更新後讀取案件失敗");
      },
    },

    fee: {
      list: (filter) => ok(filterList(feeStore.getFees(), filter)),

      get: (id) => {
        const record = feeStore.getFeeById(id);
        if (!record) return fail(`找不到費用 id=${id}`);
        return ok(record);
      },

      create: (initial = {}) => {
        const draft = feeStore.createDraft();
        if (Object.keys(initial).length === 0) return ok(draft);
        const validated = validateFeePatch(initial as Record<string, unknown>);
        if (validated.ok === false) return failFrom(validated);
        feeStore.updateFee(draft.id, validated.data);
        const created = feeStore.getFeeById(draft.id);
        return created ? ok(created) : fail("建立費用後讀取失敗");
      },

      update: (id, patch) => {
        const existing = feeStore.getFeeById(id);
        if (!existing) return fail(`找不到費用 id=${id}`);
        if (existing.status === "finalized") {
          return fail("此費用單已定案（finalized），AI 切入點不可修改");
        }
        const validated = validateFeePatch(patch as Record<string, unknown>);
        if (validated.ok === false) return failFrom(validated);
        feeStore.updateFee(id, validated.data);
        const updated = feeStore.getFeeById(id);
        return updated ? ok(updated) : fail("更新後讀取費用失敗");
      },
    },
  };
}

declare global {
  interface Window {
    __lmsAgent?: LmsAgentApi;
  }
}

export function installAiAgentBridge(): void {
  if (typeof window === "undefined") return;
  window.__lmsAgent = buildAgentApi();
}
