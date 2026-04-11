import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import type { EditLog } from "@/data/fee-mock-data";

export type CheckPermFn = (moduleKey: string, itemKey: string, permType: "view" | "edit") => boolean;

function resolveClientInvoiceItemKey(fieldKey: string | undefined, description: string): string {
  const fk = fieldKey ?? "";
  if (fk === "title" || fk === "invoiceNumber") return "cinv_detail_title";
  if (fk === "status") return "cinv_detail_status";
  if (fk === "note") return "cinv_detail_comments";
  if (fk === "費用") {
    if (description.includes("已移除") || description.includes("移除")) return "cinv_detail_removeFee";
    return "cinv_detail_addFee";
  }
  return "cinv_detail_title";
}

export function filterEditLogsClientInvoice(logs: SimplePersistedLog[], checkPerm: CheckPermFn): SimplePersistedLog[] {
  return logs.filter((e) => checkPerm("client_invoice", resolveClientInvoiceItemKey(e.fieldKey, e.description), "view"));
}

function resolveTranslatorInvoiceItemKey(fieldKey: string | undefined, description: string): string {
  const fk = fieldKey ?? "";
  if (fk === "title") return "inv_detail_title";
  if (fk === "status") return "inv_detail_status";
  if (fk === "note") return "inv_detail_comments";
  if (fk === "費用") {
    if (description.includes("已移除") || description.includes("移除")) return "inv_detail_removeFee";
    return "inv_detail_addFee";
  }
  return "inv_detail_title";
}

export function filterEditLogsTranslatorInvoice(logs: SimplePersistedLog[], checkPerm: CheckPermFn): SimplePersistedLog[] {
  return logs.filter((e) => checkPerm("translator_invoice", resolveTranslatorInvoiceItemKey(e.fieldKey, e.description), "view"));
}

export function resolveFeeDetailItemKey(fieldKey: string | undefined, description: string): string {
  const fk = (fieldKey ?? "").trim();
  const d = description;

  if (fk === "譯者" || fk === "assignee") return "fee_detail_assignee";
  if (fk === "標題" || fk === "title") return "fee_detail_title";
  if (fk === "相關案件" || fk === "internalNote") return "fee_detail_internalNote";
  if (fk === "狀態") return "fee_detail_status";
  if (fk === "客戶") return "fee_detail_client";
  if (fk === "聯絡人") return "fee_detail_contact";
  if (fk === "新增任務項目") return "fee_detail_addItem";
  if (fk === "刪除任務項目") return "fee_detail_deleteItem";

  if (fk.includes("任務類型")) return "fee_detail_taskType";
  if (fk.includes("計費單位數") || fk.includes("單位數")) return "fee_detail_unitCount";
  if (fk.includes("計費單位")) return "fee_detail_billingUnit";
  if (fk.includes("單價")) return "fee_detail_unitPrice";

  if (fk.includes("對帳") || d.includes("對帳")) return "fee_detail_reconciled";
  if (fk.includes("費率") || d.includes("費率無誤")) return "fee_detail_rateConfirmed";
  if (d.includes("請款完成") || fk.includes("請款完成")) return "fee_detail_invoiced";
  if (d.includes("營收總額") || fk.includes("營收")) return "fee_detail_clientRevenue";
  if (d.includes("利潤") || fk.includes("利潤")) return "fee_detail_profit";
  if (fk.includes("派案") || d.includes("派案途徑")) return "fee_detail_dispatchRoute";
  if (fk.includes("客戶 PO") || d.includes("客戶 PO") || (d.includes("PO") && /客戶/.test(d))) return "fee_detail_clientPoNumber";
  if (fk.includes("關鍵字") || d.includes("關鍵字") || fk.includes("clientCaseId") || d.includes("案號")) return "fee_detail_clientCaseId";
  if (fk.includes("同一案件") || d.includes("同一案件")) return "fee_detail_sameCase";
  if (fk.includes("ECI") || d.includes("ECI")) return "fee_detail_clientCaseId";

  if (/(客戶|聯絡人|案號|PO|營收|利潤|請款|同一案件|主要營收|對帳|費率|客戶端)/.test(d) && !fk.includes("任務")) {
    if (d.includes("聯絡人")) return "fee_detail_contact";
    if (d.includes("客戶") && !d.includes("客戶端")) return "fee_detail_client";
    return "fee_detail_client";
  }

  return "fee_detail_title";
}

export function filterEditLogsFeeDetail(logs: SimplePersistedLog[], checkPerm: CheckPermFn): SimplePersistedLog[] {
  return logs.filter((e) => checkPerm("fee_management", resolveFeeDetailItemKey(e.fieldKey, e.description), "view"));
}

export function filterFeeListEditLogs(logs: EditLog[], checkPerm: CheckPermFn): EditLog[] {
  return logs.filter((l) => {
    const description = l.field ? `${l.field} ${l.oldValue} → ${l.newValue}` : l.newValue;
    const synthetic: SimplePersistedLog = {
      id: l.id,
      changedBy: l.author,
      description,
      timestamp: l.timestamp,
      fieldKey: l.fieldKey || l.field || undefined,
    };
    return filterEditLogsFeeDetail([synthetic], checkPerm).length > 0;
  });
}

const CASE_FIELD_TO_ITEM: Record<string, string> = {
  title: "case_detail_title",
  status: "case_detail_viewDraft",
  client: "case_detail_client",
  contact: "case_detail_contact",
  keyword: "case_detail_keyword",
  clientPoNumber: "case_detail_keyword",
  clientCaseLink: "case_detail_keyword",
  dispatchRoute: "case_detail_keyword",
  category: "case_detail_category",
  workType: "case_detail_workType",
  workGroups: "case_detail_workType",
  processNote: "case_detail_keyword",
  billingUnit: "case_detail_keyword",
  unitCount: "case_detail_keyword",
  inquiryNote: "case_detail_keyword",
  translator: "case_detail_translator",
  translationDeadline: "case_detail_translator",
  reviewer: "case_detail_reviewer",
  reviewDeadline: "case_detail_reviewer",
  executionTool: "case_detail_toolSelect",
  toolFieldValues: "case_detail_toolSelect",
  tools: "case_detail_toolSelect",
  questionTools: "case_detail_toolSelect",
  deliveryMethod: "case_detail_keyword",
  deliveryMethodFiles: "case_detail_keyword",
  clientReceipt: "case_detail_keyword",
  clientReceiptFiles: "case_detail_keyword",
  customGuidelinesUrl: "case_detail_keyword",
  clientGuidelines: "case_detail_keyword",
  commonInfo: "case_detail_keyword",
  commonLinks: "case_detail_keyword",
  workingFiles: "case_detail_keyword",
  otherLoginInfo: "case_detail_keyword",
  loginAccount: "case_detail_keyword",
  loginPassword: "case_detail_keyword",
  onlineToolProject: "case_detail_keyword",
  onlineToolFilename: "case_detail_keyword",
  sourceFiles: "case_detail_keyword",
  seriesReferenceMaterials: "case_detail_keyword",
  caseReferenceMaterials: "case_detail_keyword",
  referenceMaterials: "case_detail_keyword",
  questionForm: "case_detail_keyword",
  translatorFinal: "case_detail_keyword",
  internalReviewFinal: "case_detail_keyword",
  trackChanges: "case_detail_keyword",
  feeEntry: "case_fee_links",
  bodyContent: "case_detail_title",
  multiCollab: "case_detail_title",
  collabRows: "case_detail_title",
  declineRecords: "case_detail_title",
  collabCount: "case_detail_title",
  iconUrl: "case_detail_title",
};

export function resolveCaseEditLogItemKey(fieldKey: string | undefined): string {
  const fk = fieldKey ?? "";
  return CASE_FIELD_TO_ITEM[fk] ?? "case_detail_title";
}

export function filterEditLogsCase(logs: SimplePersistedLog[], checkPerm: CheckPermFn): SimplePersistedLog[] {
  return logs.filter((e) => checkPerm("case_management", resolveCaseEditLogItemKey(e.fieldKey), "view"));
}

const INTERNAL_NOTE_FIELD_TO_ITEM: Record<string, string> = {
  title: "inotes_detail_title",
  relatedCase: "inotes_detail_relatedCase",
  status: "inotes_detail_status",
  noteType: "inotes_detail_noteType",
  internalAssignee: "inotes_detail_assignee",
  fileName: "inotes_detail_remarks",
  idRowCount: "inotes_detail_remarks",
  sourceText: "inotes_detail_content",
  translatedText: "inotes_detail_resolution",
  questionOrNote: "inotes_detail_content",
  questionOrNoteBlocks: "inotes_detail_content",
  referenceFiles: "inotes_detail_content",
  invalidated: "inotes_detail_status",
};

function resolveInternalNoteItemKey(fieldKey: string | undefined): string {
  const fk = fieldKey ?? "";
  return INTERNAL_NOTE_FIELD_TO_ITEM[fk] ?? "inotes_detail_title";
}

export function filterEditLogsInternalNote(logs: SimplePersistedLog[], checkPerm: CheckPermFn): SimplePersistedLog[] {
  return logs.filter((e) => checkPerm("internal_notes", resolveInternalNoteItemKey(e.fieldKey), "view"));
}
