export type InvoiceStatus = "pending" | "partial" | "paid";

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  pending: "待匯款",
  partial: "部份匯款",
  paid: "已匯款",
};

export interface Invoice {
  id: string;
  translator: string;
  status: InvoiceStatus;
  transferDate?: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Fee IDs linked to this invoice */
  feeIds: string[];
}
