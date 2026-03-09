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

export interface ClientInvoice {
  id: string;
  title: string;
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
  expectedCollectionDate?: string;
  actualCollectionDate?: string;
}
