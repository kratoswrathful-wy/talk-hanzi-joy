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

export type CaseStatus = "draft" | "inquiry" | "dispatched" | "task_completed" | "delivered" | "feedback" | "feedback_completed" | "finalized";

export interface CaseComment {
  id: string;
  author: string;
  content: string;
  imageUrls?: string[];
  createdAt: string;
}

export interface CaseRecord {
  id: string;
  title: string;
  status: CaseStatus;
  category: string;
  workType: string[];
  processNote: string;
  billingUnit: string;
  unitCount: number;
  inquiryNote: string;
  translator: string[];
  translationDeadline: string | null;
  reviewer: string;
  reviewDeadline: string | null;
  taskStatus: string;
  executionTool: string;
  toolFieldValues: Record<string, string>;
  tools: ToolEntry[];
  deliveryMethod: string;
  clientReceipt: string;
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
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
