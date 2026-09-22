import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import type { InvoiceComment } from "@/lib/invoice-comments";

export type InvoiceStatus = "pending" | "partial" | "paid";

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  pending: "待付款",
  partial: "部份付款",
  paid: "已付款",
};

export interface PaymentRecord {
  id: string;
  type: "full" | "partial";
  amount?: number;
  timestamp: string;
}

export interface Invoice {
  id: string;
  title: string;
  translator: string;
  status: InvoiceStatus;
  transferDate?: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Fee IDs linked to this invoice */
  feeIds: string[];
  /** Payment records */
  payments: PaymentRecord[];
  /** 非 null 時才寫入變更紀錄 */
  editLogStartedAt?: string;
  /** 變更紀錄（jsonb） */
  edit_logs?: SimplePersistedLog[];
  /** 請款留言（DB comments）；與 note 分欄 */
  comments?: InvoiceComment[];
}
