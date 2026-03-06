import { useNavigate } from "react-router-dom";
import { Plus, ExternalLink, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInvoices, invoiceStore } from "@/hooks/use-invoice-store";
import { useFees } from "@/hooks/use-fee-store";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { type InvoiceStatus, invoiceStatusLabels } from "@/data/invoice-types";
import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const labelStyles = useLabelStyles();
  const styleMap: Record<InvoiceStatus, { bgColor: string; textColor: string }> = {
    pending: labelStyles.invoicePending,
    partial: labelStyles.invoicePartial,
    paid: labelStyles.invoicePaid,
  };
  const colors = styleMap[status];
  return (
    <Badge
      variant="default"
      className="text-xs whitespace-nowrap border"
      style={{ backgroundColor: colors.bgColor, color: colors.textColor, borderColor: colors.bgColor }}
    >
      {invoiceStatusLabels[status]}
    </Badge>
  );
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

export default function InvoicesPage() {
  const navigate = useNavigate();
  const invoices = useInvoices();
  const fees = useFees();
  const { isAdmin } = useAuth();
  const { options: assigneeOptions } = useSelectOptions("assignee");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = useCallback(() => {
    if (deleteId) {
      invoiceStore.deleteInvoice(deleteId);
      setDeleteId(null);
    }
  }, [deleteId]);

  const getInvoiceTotal = (feeIds: string[]) => {
    return feeIds.reduce((sum, fid) => {
      const fee = fees.find((f) => f.id === fid);
      if (!fee) return sum;
      return sum + fee.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
    }, 0);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">請款單管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">管理譯者請款單與匯款狀態</p>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card overflow-x-auto"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[200px]">標題</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[150px]">譯者</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[100px]">狀態</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[80px]">費用數</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[120px]">總金額</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[120px]">建立時間</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">備註</th>
              {isAdmin && <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[60px]">操作</th>}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const opt = assigneeOptions.find((o) => o.label === inv.translator);
              const total = getInvoiceTotal(inv.feeIds);
              return (
                <tr
                  key={inv.id}
                  className="border-b border-border hover:bg-secondary/50 transition-colors group cursor-pointer"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{inv.title || <span className="text-muted-foreground italic">未命名</span>}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 truncate text-sm">
                      {opt && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                      {inv.translator || <span className="text-muted-foreground italic">未指定</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-center text-sm tabular-nums">{inv.feeIds.length}</td>
                  <td className="px-4 py-3 text-center text-sm tabular-nums">{formatCurrency(total)}</td>
                  <td className="px-4 py-3 text-center text-sm text-muted-foreground tabular-nums">
                    {formatDate(inv.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[200px]">
                    {inv.note || "—"}
                  </td>
                  {isAdmin && inv.status !== "paid" && (
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(inv.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                  {isAdmin && inv.status === "paid" && <td />}
                </tr>
              );
            })}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="text-center py-12 text-muted-foreground">
                  尚無請款單
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除？</AlertDialogTitle>
            <AlertDialogDescription>即將刪除此請款單，此操作無法復原。是否確定？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
