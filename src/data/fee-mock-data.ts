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

export interface ClientTaskItem {
  id: string;
  taskType: TaskType;
  billingUnit: BillingUnit;
  unitCount: number;
  clientPrice: number;
}

export interface ClientInfo {
  clientTaskItems: ClientTaskItem[];
  sameCase: boolean;        // 與他筆費用為同一案件
  isFirstFee: boolean;      // 為首筆費用
  notFirstFee: boolean;     // 非首筆費用
  client: string;           // 客戶
  contact: string;          // 聯絡人
  clientCaseId: string;     // 客戶端案號或關鍵字
  eciKeywords: string;      // ECI Keywords
  hdPath: string;           // 硬碟路徑
  clientPoNumber: string;   // 客戶PO編號
  reconciled: boolean;      // 對帳完成
  rateConfirmed: boolean;   // 費率無誤
  invoiced: boolean;        // 請款完成
}

export const defaultClientInfo: ClientInfo = {
  clientTaskItems: [
    { id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 0, clientPrice: 0 },
  ],
  sameCase: false,
  isFirstFee: true,
  notFirstFee: false,
  client: "",
  contact: "",
  clientCaseId: "",
  eciKeywords: "",
  hdPath: "",
  clientPoNumber: "",
  reconciled: false,
  rateConfirmed: false,
  invoiced: false,
};

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
  clientInfo?: ClientInfo;
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
    notes: [
      { id: "n-1", content: "請確認單價是否正確", author: "陳雅婷", createdAt: "2026-02-21T09:00:00" },
    ],
    editLogs: [],
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
    notes: [],
    editLogs: [],
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
    notes: [],
    editLogs: [],
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
    notes: [
      { id: "n-2", content: "急件加價已包含", author: "張大偉", createdAt: "2026-02-15T12:00:00" },
      { id: "n-3", content: "已確認金額無誤", author: "陳雅婷", createdAt: "2026-02-16T09:00:00" },
    ],
    editLogs: [],
    createdBy: "張大偉",
    createdAt: "2026-02-15T11:45:00",
  },
];
