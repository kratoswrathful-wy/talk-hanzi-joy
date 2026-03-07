export type ClientInvoiceStatus = "pending" | "partial" | "paid";

export const clientInvoiceStatusLabels: Record<ClientInvoiceStatus, string> = {
  pending: "待付款",
  partial: "部份付款",
  paid: "已付款",
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
