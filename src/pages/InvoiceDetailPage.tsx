import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useInvoice, invoiceStore } from "@/hooks/use-invoice-store";
import { useFees } from "@/hooks/use-fee-store";
import { useSelectOptions } from "@/stores/select-options-store";
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusColors: Record<InvoiceStatus, { bg: string; text: string }> = {
  pending: { bg: "hsl(var(--muted))", text: "hsl(var(--muted-foreground))" },
  partial: { bg: "hsl(40 90% 50%)", text: "#fff" },
  paid: { bg: "hsl(142 71% 45%)", text: "#fff" },
};

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const colors = statusColors[status];
  return (
    <Badge
      variant="default"
      className="border"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.bg }}
    >
      {invoiceStatusLabels[status]}
    </Badge>
  );
}

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invoice = useInvoice(id);
  const fees = useFees();
  const { isAdmin } = useAuth();
  const { options: assigneeOptions } = useSelectOptions("assignee");
  const [showDelete, setShowDelete] = useState(false);
  const [removeFeeId, setRemoveFeeId] = useState<string | null>(null);

  if (!invoice) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <p className="text-muted-foreground">找不到此請款單</p>
        <Button variant="link" onClick={() => navigate("/invoices")}>返回請款單列表</Button>
      </div>
    );
  }

  const linkedFees = invoice.feeIds
    .map((fid) => fees.find((f) => f.id === fid))
    .filter(Boolean) as typeof fees;

  const total = linkedFees.reduce(
    (sum, f) => sum + f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0),
    0
  );

  const opt = assigneeOptions.find((o) => o.label === invoice.translator);

  const handleStatusChange = (val: string) => {
    invoiceStore.updateInvoice(invoice.id, { status: val as InvoiceStatus });
    // Auto-suggest: if setting to paid and no transfer date, set today
    if (val === "paid" && !invoice.transferDate) {
      invoiceStore.updateInvoice(invoice.id, { transferDate: new Date().toISOString() });
      toast.info("已自動填入今日為匯款日期");
    }
  };

  const handleDateChange = (date: Date | undefined) => {
    invoiceStore.updateInvoice(invoice.id, {
      transferDate: date ? date.toISOString() : undefined,
    });
    // Auto-suggest status
    if (date && invoice.status === "pending") {
      invoiceStore.updateInvoice(invoice.id, { status: "paid" });
      toast.info("狀態已自動更新為「已匯款」");
    }
  };

  const handleRemoveFee = () => {
    if (removeFeeId) {
      invoiceStore.removeFeeFromInvoice(invoice.id, removeFeeId);
      setRemoveFeeId(null);
    }
  };

  const handleDelete = () => {
    invoiceStore.deleteInvoice(invoice.id);
    navigate("/invoices");
  };

  const editable = isAdmin;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/invoices")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5">
                {opt && <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: opt.color }} />}
                {invoice.translator || "未指定譯者"}
              </span>
              <span className="text-muted-foreground font-normal">的請款單</span>
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
        {editable && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Status + Transfer Date */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">匯款資訊</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">狀態</Label>
              {editable ? (
                <Select value={invoice.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">待匯款</SelectItem>
                    <SelectItem value="partial">部份匯款</SelectItem>
                    <SelectItem value="paid">已匯款</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <InvoiceStatusBadge status={invoice.status} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">匯款日期</Label>
              {editable ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal", !invoice.transferDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {invoice.transferDate ? format(new Date(invoice.transferDate), "yyyy/MM/dd") : "選擇日期"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={invoice.transferDate ? new Date(invoice.transferDate) : undefined}
                      onSelect={handleDateChange}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <p className="text-sm py-2">{invoice.transferDate ? format(new Date(invoice.transferDate), "yyyy/MM/dd") : "—"}</p>
              )}
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">備註</h2>
          {editable ? (
            <Textarea
              value={invoice.note}
              onChange={(e) => invoiceStore.updateInvoice(invoice.id, { note: e.target.value })}
              placeholder="輸入備註..."
              className="min-h-[80px]"
            />
          ) : (
            <p className="text-sm">{invoice.note || "—"}</p>
          )}
        </div>

        {/* Fee list */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">收錄費用（{linkedFees.length}）</h2>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">標題</TableHead>
                <TableHead className="text-center w-[120px]">稿費總額</TableHead>
                <TableHead className="text-center w-[100px]">狀態</TableHead>
                {editable && <TableHead className="text-center w-[60px]">移除</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedFees.map((fee) => {
                const feeTotal = fee.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
                return (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <Link to={`/fees/${fee.id}`} className="text-sm font-medium hover:underline text-primary">
                        {fee.title || <span className="text-muted-foreground italic">未命名</span>}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">{formatCurrency(feeTotal)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={fee.status === "finalized" ? "default" : "secondary"} className="text-xs">
                        {fee.status === "finalized" ? "開立完成" : "草稿"}
                      </Badge>
                    </TableCell>
                    {editable && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setRemoveFeeId(fee.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {linkedFees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={editable ? 4 : 3} className="text-center py-8 text-muted-foreground">
                    尚未收錄任何費用
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {linkedFees.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">合計</TableCell>
                  <TableCell className="text-center font-semibold tabular-nums">{formatCurrency(total)}</TableCell>
                  <TableCell />
                  {editable && <TableCell />}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </motion.div>

      {/* Delete invoice dialog */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除請款單？</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原，但收錄的費用不會被刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove fee dialog */}
      <AlertDialog open={!!removeFeeId} onOpenChange={(open) => !open && setRemoveFeeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除費用？</AlertDialogTitle>
            <AlertDialogDescription>將此費用從請款單中移除，費用本身不會被刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveFee}>移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
