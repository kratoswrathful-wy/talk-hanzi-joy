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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { useInvoice, invoiceStore } from "@/hooks/use-invoice-store";
import { useFees } from "@/hooks/use-fee-store";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { type InvoiceStatus, type PaymentRecord, invoiceStatusLabels } from "@/data/invoice-types";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      className="border"
      style={{ backgroundColor: colors.bgColor, color: colors.textColor, borderColor: colors.bgColor }}
    >
      {invoiceStatusLabels[status]}
    </Badge>
  );
}

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

const formatTimestamp = (d: Date) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invoice = useInvoice(id);
  const fees = useFees();
  const { isAdmin } = useAuth();
  const { options: assigneeOptions } = useSelectOptions("assignee");
  const [showDelete, setShowDelete] = useState(false);
  const [removeFeeId, setRemoveFeeId] = useState<string | null>(null);
  const [showPartialInput, setShowPartialInput] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");

  // Translator profile
  const [translatorProfile, setTranslatorProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  useEffect(() => {
    if (!invoice?.translator) return;
    const opt = assigneeOptions.find((o) => o.label === invoice.translator);
    if (!opt) return;
    // Try to find profile by display_name
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("display_name", invoice.translator)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTranslatorProfile(data);
      });
  }, [invoice?.translator, assigneeOptions]);

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
  const isPaid = invoice.status === "paid";
  const editable = isAdmin && !isPaid;

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

  const handleFullPayment = () => {
    const now = new Date().toISOString();
    const payment: PaymentRecord = {
      id: crypto.randomUUID(),
      type: "full",
      timestamp: now,
    };
    const newPayments = [...invoice.payments, payment];
    invoiceStore.updateInvoice(invoice.id, {
      status: "paid",
      payments: newPayments,
      transferDate: now,
    });
    toast.success("已記錄全額付款");
  };

  const handlePartialPayment = () => {
    const amount = parseFloat(partialAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("請輸入有效金額");
      return;
    }
    const now = new Date().toISOString();
    const payment: PaymentRecord = {
      id: crypto.randomUUID(),
      type: "partial",
      amount,
      timestamp: now,
    };
    const newPayments = [...invoice.payments, payment];
    invoiceStore.updateInvoice(invoice.id, {
      status: "partial",
      payments: newPayments,
    });
    setShowPartialInput(false);
    setPartialAmount("");
    toast.success("已記錄部份付款");
  };

  const hasPayments = invoice.payments.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/invoices")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {/* Editable title */}
            {isPaid ? (
              <h1 className="text-xl font-semibold tracking-tight text-muted-foreground">
                {invoice.title || "未命名"}
              </h1>
            ) : (
              <Input
                value={invoice.title}
                onChange={(e) => invoiceStore.updateInvoice(invoice.id, { title: e.target.value })}
                placeholder="請款單標題"
                className="text-xl font-semibold tracking-tight border-0 shadow-none px-0 h-auto py-0 focus-visible:ring-0 bg-transparent"
              />
            )}
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
        {!isPaid && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Fee list */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          {/* Header: 請款人 */}
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">請款人：</h2>
            <div className="flex items-center gap-1.5">
              {translatorProfile?.avatar_url ? (
                <Avatar className="h-5 w-5">
                  <AvatarImage src={translatorProfile.avatar_url} />
                  <AvatarFallback className="text-[10px]">{(invoice.translator || "?")[0]}</AvatarFallback>
                </Avatar>
              ) : opt ? (
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: opt.color }} />
              ) : null}
              <span className="text-sm font-medium">{translatorProfile?.display_name || invoice.translator || "未指定"}</span>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">標題</TableHead>
                <TableHead className="text-center w-[120px]">稿費總額</TableHead>
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
                  <TableCell colSpan={editable ? 3 : 2} className="text-center py-8 text-muted-foreground">
                    尚未收錄任何費用
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {linkedFees.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="text-left">
                    <span className="text-muted-foreground text-sm">共 {linkedFees.length} 筆稿費</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
                  </TableCell>
                  {editable && <TableCell />}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        {/* Payment section */}
        <div className="space-y-3">
          {/* Payment records */}
          {invoice.payments.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">付款時間：</span>
              <span>{formatTimestamp(new Date(p.timestamp))}</span>
              <span className="text-muted-foreground">
                {p.type === "full" ? "（全額付款）" : `（部份付款：${formatCurrency(p.amount || 0)}）`}
              </span>
            </div>
          ))}

          {/* Partial amount input dialog */}
          {showPartialInput && (
            <div className="flex items-center gap-2 justify-end">
              <Input
                type="number"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="輸入付款金額"
                className="w-40 h-9"
                autoFocus
              />
              <Button size="sm" onClick={handlePartialPayment}>確認</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowPartialInput(false); setPartialAmount(""); }}>取消</Button>
            </div>
          )}

          {/* Payment button - show only when not fully paid */}
          {!isPaid && !showPartialInput && isAdmin && (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">付款</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleFullPayment}>全額付款</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowPartialInput(true)}>部份付款</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Note - at the bottom, same style as fee detail page */}
        <Separator />
        <div className="space-y-3">
          <Label className="text-sm font-medium">備註</Label>
          {isAdmin ? (
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
