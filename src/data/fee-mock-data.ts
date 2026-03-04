export type FeeStatus = "draft" | "finalized";
export type TaskType = "翻譯" | "審稿" | "MTPE" | "LQA";
export type BillingUnit = "字" | "小時";

export interface FeeTaskItem {
  id: string;
  taskType: TaskType;
  billingUnit: BillingUnit;
  unitCount: number;
  unitPrice: number;
}

export interface FeeNote {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export interface FeeEditLog {
  id: string;
  action: string;
  author: string;
  createdAt: string;
}

export interface TranslatorFee {
  id: string;
  title: string;
  assignee: string;
  status: FeeStatus;
  internalNote: string;
  internalNoteUrl?: string;
  taskItems: FeeTaskItem[];
  notes: FeeNote[];
  editLogs: FeeEditLog[];
  createdBy: string;
  createdAt: string;
}

export const feeStatusLabels: Record<FeeStatus, string> = {
  draft: "草稿",
  finalized: "開立完成",
};

export const translatorFees: TranslatorFee[] = [
  {
    id: "fee-1",
    title: "2026年2月 王小明 翻譯費",
    assignee: "王小明",
    status: "draft",
    internalNote: "案件 A-2026-001 相關",
    internalNoteUrl: "https://example.com/case/A-2026-001",
    taskItems: [
      { id: "item-1", taskType: "翻譯", billingUnit: "字", unitCount: 5000, unitPrice: 1.2 },
      { id: "item-2", taskType: "審稿", billingUnit: "字", unitCount: 2000, unitPrice: 0.8 },
    ],
    createdBy: "張大偉",
    createdAt: "2026-02-20T10:30:00",
  },
  {
    id: "fee-2",
    title: "2026年2月 李美玲 MTPE費用",
    assignee: "李美玲",
    status: "finalized",
    internalNote: "案件 B-2026-003",
    taskItems: [
      { id: "item-3", taskType: "MTPE", billingUnit: "字", unitCount: 12000, unitPrice: 0.5 },
    ],
    createdBy: "陳雅婷",
    createdAt: "2026-02-18T14:00:00",
  },
  {
    id: "fee-3",
    title: "2026年1月 張大偉 審稿與LQA",
    assignee: "張大偉",
    status: "draft",
    internalNote: "",
    taskItems: [
      { id: "item-4", taskType: "審稿", billingUnit: "小時", unitCount: 8, unitPrice: 500 },
      { id: "item-5", taskType: "LQA", billingUnit: "小時", unitCount: 3, unitPrice: 600 },
    ],
    createdBy: "王小明",
    createdAt: "2026-01-28T09:15:00",
  },
  {
    id: "fee-4",
    title: "2026年2月 陳雅婷 翻譯費",
    assignee: "陳雅婷",
    status: "finalized",
    internalNote: "急件處理",
    internalNoteUrl: "https://example.com/case/C-2026-005",
    taskItems: [
      { id: "item-6", taskType: "翻譯", billingUnit: "字", unitCount: 8500, unitPrice: 1.2 },
      { id: "item-7", taskType: "審稿", billingUnit: "字", unitCount: 3200, unitPrice: 0.8 },
      { id: "item-8", taskType: "MTPE", billingUnit: "字", unitCount: 6000, unitPrice: 0.5 },
    ],
    createdBy: "張大偉",
    createdAt: "2026-02-15T11:45:00",
  },
];
