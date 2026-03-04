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
  isFirstFee: false,
  notFirstFee: false,
  client: "",
  contact: "",
  clientCaseId: "",
  eciKeywords: "",
  clientPoNumber: "",
  reconciled: false,
  rateConfirmed: false,
  invoiced: false,
};

export interface Note {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface EditLog {
  id: string;
  author: string;
  field: string;
  oldValue: string;
  newValue: string;
  timestamp: string;
}

export interface TranslatorFee {
  id: string;
  title: string;
  assignee: string;
  status: FeeStatus;
  internalNote: string;
  taskItems: FeeTaskItem[];
  clientInfo?: ClientInfo;
  notes: Note[];
  editLogs: EditLog[];
  createdBy: string;
  createdAt: string;
  finalizedBy?: string;
  finalizedAt?: string;
}

export const translatorFees: TranslatorFee[] = [
  {
    id: "fee-1",
    title: "潤稿：專利說明書",
    assignee: "譯者甲",
    status: "draft",
    internalNote: "本案為AAA公司急件，請優先處理",
    taskItems: [
      { id: "item-1", taskType: "翻譯", billingUnit: "字", unitCount: 1200, unitPrice: 2.2 },
      { id: "item-2", taskType: "審稿", billingUnit: "小時", unitCount: 3, unitPrice: 1200 },
    ],
    clientInfo: defaultClientInfo,
    notes: [
      {
        id: "note-1",
        author: "專案經理乙",
        text: "譯者已確認交件時間",
        createdAt: "2024-01-18T10:30:00.000Z",
      },
    ],
    editLogs: [
      {
        id: "log-1",
        author: "專案經理乙",
        field: "status",
        oldValue: "new",
        newValue: "draft",
        timestamp: "2024-01-17T15:00:00.000Z",
      },
    ],
    createdBy: "專案經理乙",
    createdAt: "2024-01-17T14:00:00.000Z",
  },
  {
    id: "fee-2",
    title: "翻譯：網站本地化",
    assignee: "譯者丙",
    status: "finalized",
    internalNote: "客戶要求採用特定術語",
    taskItems: [
      { id: "item-3", taskType: "翻譯", billingUnit: "字", unitCount: 5000, unitPrice: 1.8 },
    ],
    clientInfo: defaultClientInfo,
    notes: [
      {
        id: "note-2",
        author: "專案經理丁",
        text: "已通知譯者客戶的術語要求",
        createdAt: "2024-01-15T09:00:00.000Z",
      },
    ],
    editLogs: [
      {
        id: "log-2",
        author: "專案經理丁",
        field: "unitPrice",
        oldValue: "2.0",
        newValue: "1.8",
        timestamp: "2024-01-14T16:00:00.000Z",
      },
    ],
    createdBy: "專案經理丁",
    createdAt: "2024-01-14T10:00:00.000Z",
    finalizedBy: "專案經理丁",
    finalizedAt: "2024-01-16T12:00:00.000Z",
  },
];
