export type ClientInvoiceStatus = "pending" | "partial_collected" | "collected";

export const clientInvoiceStatusLabels: Record<ClientInvoiceStatus, string> = {
  pending: "待收款",
  partial_collected: "部份收款",
  collected: "收款完畢",
};

export interface ClientPaymentRecord {
  id: string;
  type: "full" | "partial";
  amount?: number;
  noFee?: boolean; // 無手續費全額收齊
  timestamp: string;
}

/** 請款額調整列（加／減於應收總額） */
export interface ClientInvoiceAdjustmentLine {
  id: string;
  operation: "add" | "subtract";
  amount: number;
  currency: string;
}

export interface ClientInvoice {
  id: string;
  title: string;
  invoiceNumber: string;
  client: string;
  status: ClientInvoiceStatus;
  transferDate?: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  feeIds: string[];
  payments: ClientPaymentRecord[];
  isRecordOnly?: boolean;
  recordAmount?: number;
  recordCurrency?: string;
  billingChannel?: string;
  expectedCollectionDate?: string;
  actualCollectionDate?: string;
  /** 請款額調整（費用調整列） */
  adjustmentLines?: ClientInvoiceAdjustmentLine[];
}
