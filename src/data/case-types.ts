export interface ToolEntryField {
  id: string;
  label: string;
}

export interface ToolEntry {
  id: string;
  tool: string;
  fields?: ToolEntryField[]; // custom fields (overrides tool defaults when present)
  fieldValues: Record<string, string>;
}

export type CaseStatus = "draft" | "finalized";

export interface CaseRecord {
  id: string;
  title: string;
  status: CaseStatus;
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
  customGuidelinesUrl: string;
  clientGuidelines: string;
  commonInfo: { label: string; url: string }[];
  internalNoteForm: boolean;
  clientQuestionForm: boolean;
  workingFiles: { name: string; url: string }[];
  otherLoginInfo: string;
  loginAccount: string;
  loginPassword: string;
  onlineToolProject: string;
  onlineToolFilename: string;
  sourceFiles: { name: string; url: string }[];
  referenceMaterials: { name: string; url: string }[];
  questionForm: string;
  translatorFinal: { name: string; url: string }[];
  internalReviewFinal: { name: string; url: string }[];
  trackChanges: string;
  feeEntry: string;
  internalRecords: { id: string; author: string; text: string; createdAt: string }[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
