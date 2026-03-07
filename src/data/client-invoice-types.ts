export type ClientInvoiceStatus = "pending" | "partial" | "paid";

export const clientInvoiceStatusLabels: Record<ClientInvoiceStatus, string> = {
  pending: "待收款",
  partial: "部份到帳",
  paid: "全額收齊",
};

export interface ClientPaymentRecord {
  id: string;
  type: "full" | "partial";
  amount?: number;
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
}
