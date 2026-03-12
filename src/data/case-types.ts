export interface ToolEntryField {
  id: string;
  label: string;
  type?: "text" | "file"; // default "text"
}

export interface ToolEntry {
  id: string;
  tool: string;
  fields?: ToolEntryField[]; // custom fields (overrides tool defaults when present)
  fieldValues: Record<string, string>;
  fileValues?: Record<string, { name: string; url: string }[]>; // for file-type fields
}

/** A single repeatable group of work type + billing info */
export interface WorkGroup {
  id: string;
  workType: string;   // single work type label
  billingUnit: string;
  unitCount: number;
}

export type CaseStatus = "draft" | "inquiry" | "dispatched" | "task_completed" | "delivered" | "feedback" | "feedback_completed";

/** A single row in the multi-person collaboration table */
export interface CollabRow {
  id: string;
  segment: string;        // 檔案或分段 (text)
  translator: string;     // 譯者 (person single-select)
  unitCount: number;      // 計費單位數
  accepted: boolean;      // 確認承接
  translationDeadline: string | null; // 翻譯交期
  reviewer: string;       // 審稿人員
  reviewDeadline: string | null;      // 審稿交期
  taskCompleted: boolean; // 任務完成
  delivered: boolean;     // 交件完畢
}

export interface CaseComment {
  id: string;
  author: string;
  content: string;
  imageUrls?: string[];
  fileUrls?: { name: string; url: string }[];
  replyTo?: string; // id of parent comment
  createdAt: string;
}

export interface DeclineRecord {
  id: string;
  translator: string;
  proposedDeadline?: string; // ISO datetime, optional
  createdAt: string;
}

export interface CaseRecord {
  id: string;
  title: string;
  status: CaseStatus;
  client: string;
  contact: string;
  keyword: string;
  clientPoNumber: string;
  clientCaseLink: { url: string; label: string };
  dispatchRoute: string;
  category: string;
  workType: string[];   // legacy – kept for backward compat
  workGroups: WorkGroup[]; // new repeatable groups
  processNote: string;
  billingUnit: string;   // legacy
  unitCount: number;     // legacy
  inquiryNote: string;
  translator: string[];
  translationDeadline: string | null;
  reviewer: string;
  reviewDeadline: string | null;
  
  executionTool: string;
  toolFieldValues: Record<string, string>;
  tools: ToolEntry[];
  questionTools: ToolEntry[];
  deliveryMethod: string;
  deliveryMethodFiles: { name: string; url: string }[];
  clientReceipt: string;
  clientReceiptFiles: { name: string; url: string }[];
  customGuidelinesUrl: { name: string; url: string }[];
  clientGuidelines: { name: string; url: string }[];
  commonInfo: { label: string; url: string }[];
  commonLinks: string[]; // IDs referencing common-links-store
  internalNoteForm: boolean;
  clientQuestionForm: boolean;
  workingFiles: { name: string; url: string }[];
  otherLoginInfo: string;
  loginAccount: string;
  loginPassword: string;
  onlineToolProject: string;
  onlineToolFilename: string;
  sourceFiles: { name: string; url: string }[];
  seriesReferenceMaterials: { name: string; url: string }[];
  caseReferenceMaterials: { name: string; url: string }[];
  referenceMaterials: { name: string; url: string }[];
  questionForm: string;
  translatorFinal: { name: string; url: string }[];
  internalReviewFinal: { name: string; url: string }[];
  trackChanges: { name: string; url: string }[];
  feeEntry: string;
  internalRecords: { id: string; author: string; text: string; createdAt: string }[];
  comments: CaseComment[];
  internalComments: CaseComment[];
  bodyContent: any[];
  multiCollab: boolean;
  collabCount: number;
  collabRows: CollabRow[];
  declineRecords: DeclineRecord[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
