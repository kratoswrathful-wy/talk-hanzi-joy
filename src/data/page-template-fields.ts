/**
 * Page Template Field Definitions
 * Defines which fields each module exposes for template pre-filling.
 */

import type { PageModule } from "@/stores/page-template-store";

export type FieldType =
  | "text"           // plain text input
  | "number"         // numeric input
  | "single-select"  // ColorSelect dropdown
  | "multi-select"   // MultiColorSelect
  | "person"         // person single-select (assignee)
  | "person-multi"   // person multi-select
  | "file"           // FileField (array of {name, url})
  | "boolean"        // checkbox
  | "date";          // DateTimePicker

export interface TemplateFieldDef {
  key: string;           // maps to record field name
  label: string;         // display label in Chinese
  type: FieldType;
  /** For single-select / multi-select: the selectOptionsStore field key */
  selectKey?: string;
  /** Group header this field belongs to */
  group: string;
}

// ── Cases ──

export const CASE_TEMPLATE_FIELDS: TemplateFieldDef[] = [
  { key: "category",        label: "內容性質",     type: "single-select", selectKey: "caseCategory", group: "基本資訊" },
  { key: "client",          label: "客戶",         type: "single-select", selectKey: "client",       group: "基本資訊" },
  { key: "contact",         label: "聯絡人",       type: "single-select", selectKey: "contact",      group: "基本資訊" },
  { key: "keyword",         label: "關鍵字",       type: "text",                                     group: "基本資訊" },
  { key: "clientPoNumber",  label: "客戶 PO#",     type: "text",                                     group: "基本資訊" },
  { key: "dispatchRoute",   label: "派案來源",     type: "single-select", selectKey: "dispatchRoute", group: "基本資訊" },
  { key: "processNote",     label: "流程備註",     type: "text",                                     group: "基本資訊" },
  { key: "inquiryNote",     label: "詢案備註",     type: "text",                                     group: "基本資訊" },
  { key: "reviewer",        label: "審稿人員",     type: "person",        selectKey: "assignee",     group: "人員與交期" },
  { key: "deliveryMethodFiles",       label: "交件方式",       type: "file", group: "準則與檔案" },
  { key: "clientReceiptFiles",        label: "客戶收件",       type: "file", group: "準則與檔案" },
  { key: "customGuidelinesUrl",       label: "自製準則頁面",   type: "file", group: "準則與檔案" },
  { key: "clientGuidelines",          label: "客戶指定準則",   type: "file", group: "準則與檔案" },
  { key: "seriesReferenceMaterials",  label: "本系列參考資料", type: "file", group: "準則與檔案" },
  { key: "caseReferenceMaterials",    label: "本案參考資料",   type: "file", group: "準則與檔案" },
  { key: "commonLinks",                label: "常用資訊",       type: "file", group: "準則與檔案" },
  { key: "multiCollab",     label: "多人協作",     type: "boolean",                                  group: "其他設定" },
  { key: "otherLoginInfo",  label: "其他登入資訊", type: "text",                                     group: "其他設定" },
  { key: "loginAccount",    label: "登入帳號",     type: "text",                                     group: "其他設定" },
  { key: "loginPassword",   label: "登入密碼",     type: "text",                                     group: "其他設定" },
  { key: "onlineToolProject",  label: "線上工具專案", type: "text",                                  group: "其他設定" },
  { key: "onlineToolFilename", label: "線上工具檔名", type: "text",                                  group: "其他設定" },
];

// ── Internal Notes (註記) ──

export const INTERNAL_NOTES_TEMPLATE_FIELDS: TemplateFieldDef[] = [
  { key: "status",            label: "狀態",       type: "single-select", selectKey: "noteStatus",  group: "基本資訊" },
  { key: "noteType",          label: "性質",       type: "single-select", selectKey: "noteNature",  group: "基本資訊" },
  { key: "internalAssignee",  label: "內部指派",   type: "person-multi",  selectKey: "assignee",    group: "基本資訊" },
  { key: "fileName",          label: "檔案名稱",   type: "text",                                    group: "內容" },
  { key: "idRowCount",        label: "ID/列數",    type: "text",                                    group: "內容" },
  { key: "sourceText",        label: "原文",       type: "text",                                    group: "內容" },
  { key: "translatedText",    label: "譯文",       type: "text",                                    group: "內容" },
  { key: "questionOrNote",    label: "提問或註記", type: "text",                                    group: "內容" },
  { key: "referenceFiles",    label: "參考檔案",   type: "file",                                    group: "內容" },
];

// ── Fees (記帳) ──

export const FEE_TEMPLATE_FIELDS: TemplateFieldDef[] = [
  { key: "assignee",         label: "譯者",       type: "person",        selectKey: "assignee",    group: "基本資訊" },
  { key: "internalNote",     label: "內部備註",   type: "text",                                    group: "基本資訊" },
  // Client info sub-fields (flattened with clientInfo. prefix)
  { key: "clientInfo.client",          label: "客戶",         type: "single-select", selectKey: "client",        group: "客戶資訊" },
  { key: "clientInfo.contact",         label: "聯絡人",       type: "single-select", selectKey: "contact",       group: "客戶資訊" },
  { key: "clientInfo.clientCaseId",    label: "客戶端案號",   type: "text",                                      group: "客戶資訊" },
  { key: "clientInfo.eciKeywords",     label: "ECI Keywords", type: "text",                                      group: "客戶資訊" },
  { key: "clientInfo.clientPoNumber",  label: "客戶 PO#",     type: "text",                                      group: "客戶資訊" },
  { key: "clientInfo.dispatchRoute",   label: "派案途徑",     type: "single-select", selectKey: "dispatchRoute", group: "客戶資訊" },
];

// ── Invoices (稿費請款) ──

export const INVOICE_TEMPLATE_FIELDS: TemplateFieldDef[] = [
  { key: "translator",      label: "譯者",       type: "person",        selectKey: "assignee",    group: "基本資訊" },
  { key: "note",             label: "備註",       type: "text",                                    group: "基本資訊" },
];

// ── Client Invoices (客戶請款) ──

export const CLIENT_INVOICE_TEMPLATE_FIELDS: TemplateFieldDef[] = [
  { key: "client",           label: "客戶",       type: "single-select", selectKey: "client",      group: "基本資訊" },
  { key: "note",             label: "備註",       type: "text",                                    group: "基本資訊" },
];

// ── Module → Fields map ──

/** Get field definitions by module */
export function getModuleFields(mod: PageModule): TemplateFieldDef[] {
  switch (mod) {
    case "cases":          return CASE_TEMPLATE_FIELDS;
    case "internalNotes":  return INTERNAL_NOTES_TEMPLATE_FIELDS;
    case "fees":           return FEE_TEMPLATE_FIELDS;
    case "invoices":       return INVOICE_TEMPLATE_FIELDS;
    case "clientInvoices": return CLIENT_INVOICE_TEMPLATE_FIELDS;
    default:               return [];
  }
}

/** Get unique groups for a module's fields */
export function getFieldGroups(mod: PageModule): string[] {
  const fields = getModuleFields(mod);
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const f of fields) {
    if (!seen.has(f.group)) {
      seen.add(f.group);
      groups.push(f.group);
    }
  }
  return groups;
}
