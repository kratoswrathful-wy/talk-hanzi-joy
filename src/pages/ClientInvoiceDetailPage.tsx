import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserTimezone } from "@/lib/format-timestamp";
import { getTimezoneInfo } from "@/data/timezone-options";
import { ArrowLeft, Plus, X, Loader2, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useClientInvoice, clientInvoiceStore, useClientInvoicesLoaded } from "@/hooks/use-client-invoice-store";
import { useSelectOptions } from "@/stores/select-options-store";
import { useFees } from "@/hooks/use-fee-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { useCurrencies } from "@/stores/currency-store";
import { type ClientInvoiceStatus, type ClientPaymentRecord, clientInvoiceStatusLabels } from "@/data/client-invoice-types";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useClientInvoices } from "@/hooks/use-client-invoice-store";
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
import { ApplyTemplateButton } from "@/components/ApplyTemplateButton";
import { CommentContent } from "@/components/comments/CommentContent";
import { CommentInput } from "@/components/comments/CommentInput";

function StatusBadge({ status }: { status: ClientInvoiceStatus }) {
  const labelStyles = useLabelStyles();
  const styleMap: Record<ClientInvoiceStatus, { bgColor: string; textColor: string }> = {
    pending: labelStyles.invoicePending,
    partial_collected: labelStyles.invoicePartial,
    collected: labelStyles.invoicePaid,
  };
  const colors = styleMap[status];
  return (
    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
      <span className="cursor-default">
        <Badge
          variant="default"
          className="border"
          style={{ backgroundColor: colors.bgColor, color: colors.textColor, borderColor: colors.bgColor }}
        >
          {clientInvoiceStatusLabels[status]}
        </Badge>
      </span>
    </TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>
  );
}

const formatCurrency = (n: number, code = "TWD") =>
  `${code} ${n.toLocaleString("zh-TW", { minimumFractionDigits: 0 })}`;

const formatTimestamp = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  const tz = getUserTimezone();
  const tzLabel = getTimezoneInfo(tz)?.utcOffset || "UTC+8";
  const formatted = d.toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: tz,
  });
  return `${formatted} (${tzLabel})`;
};

const formatDateOnly = (iso: string) => {
  if (!iso) return "";
  const tz = getUserTimezone();
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz });
};

interface CommentEntry {
  id: string;
  author: string;
  content: string;
  imageUrls?: string[];
  fileUrls?: { name: string; url: string }[];
  replyTo?: string;
  timestamp: string;
}

interface EditLogEntry {
  id: string;
  changedBy: string;
  description: string;
  timestamp: string;
}

interface PendingChange {
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: number;
}

const COMMIT_DELAY_MS = 5 * 60 * 1000;

const fieldLabels: Record<string, string> = {
  title: "標題",
  status: "狀態",
  note: "客戶請款備註",
};

/** Date-only picker (no time selection) */
function DateOnlyPicker({ value, onChange, disabled, placeholder }: {
  value?: string;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-9", !value && "text-muted-foreground")} disabled={disabled}>
          {value ? formatDateOnly(value) : (placeholder || "選擇日期")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              const yyyy = day.getFullYear();
              const mm = String(day.getMonth() + 1).padStart(2, "0");
              const dd = String(day.getDate()).padStart(2, "0");
              onChange(`${yyyy}-${mm}-${dd}`);
            } else {
              onChange(undefined);
            }
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="px-3 pb-2">
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => { onChange(undefined); setOpen(false); }}>
              清除日期
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function ClientInvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const autoFocusTitle = !!(location.state as any)?.autoFocusTitle;
  const titleInputRef = useRef<HTMLInputElement>(null);
  const invoice = useClientInvoice(id);
  const fees = useFees();
  const { isAdmin, profile, roles, user } = useAuth();
  const { checkPerm } = usePermissions();
  const { options: clientOptions } = useSelectOptions("client");
  const labelStyles = useLabelStyles();
  const { currencies, getTwdRate } = useCurrencies();
  const isExecutive = roles.some((r) => r.role === "executive");
  const [showDelete, setShowDelete] = useState(false);
  const [showPasswordDelete, setShowPasswordDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingWithPassword, setDeletingWithPassword] = useState(false);
  const [removeFeeId, setRemoveFeeId] = useState<string | null>(null);
  const [addFeeOpen, setAddFeeOpen] = useState(false);
  const [selectedAddFees, setSelectedAddFees] = useState<string[]>([]);
  const allInvoices = useClientInvoices();

  // Payment dialog states
  const [showFullPayDialog, setShowFullPayDialog] = useState(false);
  const [fullPayAmount, setFullPayAmount] = useState("");
  const [fullPayNoFee, setFullPayNoFee] = useState(false);
  const [showPartialPayDialog, setShowPartialPayDialog] = useState(false);
  const [partialPayAmount, setPartialPayAmount] = useState("");
  const [partialPayClose, setPartialPayClose] = useState(false);

  // Record-only amount dialog
  const [showRecordAmountDialog, setShowRecordAmountDialog] = useState(false);
  const [recordAmountInput, setRecordAmountInput] = useState("");
  const [recordCurrencyInput, setRecordCurrencyInput] = useState("TWD");

  // Edit record-only dialog
  const [showEditRecordDialog, setShowEditRecordDialog] = useState(false);
  const [editRecordAmount, setEditRecordAmount] = useState("");
  const [editRecordCurrency, setEditRecordCurrency] = useState("TWD");
  const [amountTooHighMsg, setAmountTooHighMsg] = useState<string | null>(null);

  // Comments
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Auto-focus title on new page creation
  useEffect(() => {
    if (autoFocusTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [autoFocusTitle]);

  // Edit history
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  // Creator name
  const [creatorName, setCreatorName] = useState(invoice?.createdBy || "");
  useEffect(() => {
    const uid = invoice?.createdBy;
    if (!uid || uid.length !== 36) return;
    supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCreatorName(data.display_name || data.email || uid);
      });
  }, [invoice?.createdBy]);

  // Initialize from invoice data
  useEffect(() => {
    if (!invoice) return;
    const rawComments = (invoice as any).comments;
    if (Array.isArray(rawComments)) {
      setComments(rawComments.map((c: any) => ({
        id: c.id, author: c.author, content: c.content, imageUrls: c.imageUrls, fileUrls: c.fileUrls, replyTo: c.replyTo, timestamp: c.timestamp,
      })));
    }
    const rawEditLogs = (invoice as any).edit_logs;
    if (Array.isArray(rawEditLogs)) {
      setEditLog(rawEditLogs.map((l: any) => ({
        id: l.id, changedBy: l.changedBy, description: l.description, timestamp: l.timestamp,
      })));
    }
  }, [invoice?.id]);

  // Pending changes commit logic
  useEffect(() => {
    if (pendingChanges.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const ready = pendingChanges.filter((c) => now - c.changedAt >= COMMIT_DELAY_MS);
      if (ready.length > 0) {
        const authorName = profile?.display_name || profile?.email || "系統";
        const newEntries = ready.map((c) => ({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          changedBy: authorName,
          description: `${fieldLabels[c.field] || c.field} ${c.oldValue} → ${c.newValue}`,
          timestamp: formatTimestamp(new Date(c.changedAt)),
        }));
        setEditLog((prev) => [...prev, ...newEntries]);
        setPendingChanges((prev) => prev.filter((c) => now - c.changedAt < COMMIT_DELAY_MS));
        if (id) {
          const allLogs = [...editLog, ...newEntries];
          clientInvoiceStore.updateInvoice(id, { edit_logs: allLogs } as any);
        }
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [pendingChanges, editLog, id, profile]);

  const trackChange = useCallback((field: string, oldValue: string, newValue: string) => {
    if (oldValue === newValue) return;
    setPendingChanges((prev) => {
      const existing = prev.findIndex((c) => c.field === field);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], newValue, changedAt: Date.now() };
        return updated;
      }
      return [...prev, { field, oldValue, newValue, changedAt: Date.now() }];
    });
  }, []);

  const forceCommitPending = useCallback(() => {
    if (pendingChanges.length === 0) return;
    const authorName = profile?.display_name || profile?.email || "系統";
    const newEntries = pendingChanges.map((c) => ({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      changedBy: authorName,
      description: `${fieldLabels[c.field] || c.field} ${c.oldValue} → ${c.newValue}`,
      timestamp: formatTimestamp(new Date(c.changedAt)),
    }));
    const allLogs = [...editLog, ...newEntries];
    setEditLog(allLogs);
    setPendingChanges([]);
    if (id) {
      clientInvoiceStore.updateInvoice(id, { edit_logs: allLogs } as any);
    }
  }, [pendingChanges, editLog, id, profile]);

  // Available fees (not linked to any client invoice)
  const allLinkedFeeIds = useMemo(() => {
    const set = new Set<string>();
    for (const inv of allInvoices) {
      for (const fid of inv.feeIds) set.add(fid);
    }
    return set;
  }, [allInvoices]);

  const availableFees = useMemo(() => {
    if (!invoice) return [];
    return fees.filter((f) => {
      if (allLinkedFeeIds.has(f.id)) return false;
      const ci = f.clientInfo as any;
      if (!ci?.client || ci.client !== invoice.client) return false;
      if (!ci?.reconciled) return false;
      return true;
    });
  }, [fees, invoice, allLinkedFeeIds]);

  const clientInvoicesLoaded = useClientInvoicesLoaded();

  if (!invoice) {
    if (!clientInvoicesLoaded) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <p className="text-muted-foreground">找不到此客戶請款單</p>
        <Button variant="link" onClick={() => navigate("/client-invoices")}>返回客戶請款單清單</Button>
      </div>
    );
  }

  const linkedFees = invoice.feeIds
    .map((fid) => fees.find((f) => f.id === fid))
    .filter(Boolean) as typeof fees;

  // Total receivable from linked fees
  const feeTotal = linkedFees.reduce((sum, f) => {
    const clientInfo = f.clientInfo as any;
    if (!clientInfo?.items) return sum;
    return sum + clientInfo.items.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unitPrice || 0), 0);
  }, 0);

  // If record-only, the total is the recordAmount
  const recordCur = invoice.recordCurrency || "TWD";
  const total = invoice.isRecordOnly ? (invoice.recordAmount || 0) : feeTotal;
  const recordTwdRate = getTwdRate(recordCur);
  const totalInTwd = invoice.isRecordOnly && recordCur !== "TWD" ? total * recordTwdRate : null;

  const isCollected = invoice.status === "collected";
  const editable = isAdmin && !isCollected;

  // Calculate paid so far
  const paidSoFar = invoice.payments.reduce((sum, p) => {
    if (p.type === "full") {
      return sum + (p.noFee ? total : (p.amount || 0));
    }
    return sum + (p.amount || 0);
  }, 0);
  const remaining = Math.max(0, total - paidSoFar);
  const hasFees = paidSoFar > 0 && paidSoFar < total;
  const serviceFee = hasFees ? total - paidSoFar : 0;

  const handleRemoveFee = () => {
    if (removeFeeId) {
      clientInvoiceStore.removeFeeFromInvoice(invoice.id, removeFeeId);
      const fee = fees.find((f) => f.id === removeFeeId);
      trackChange("費用", fee?.title || "未命名費用", "已移除");
      setRemoveFeeId(null);
    }
  };

  const handleDelete = () => {
    clientInvoiceStore.deleteInvoice(invoice.id);
    navigate("/client-invoices");
    toast.success("已刪除客戶請款單");
  };

  const handlePasswordDelete = async () => {
    if (!deletePassword.trim()) {
      toast.error("請輸入密碼");
      return;
    }
    setDeletingWithPassword(true);
    const email = profile?.email || user?.email;
    if (!email) {
      toast.error("無法驗證身分");
      setDeletingWithPassword(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: deletePassword });
    setDeletingWithPassword(false);
    if (error) {
      toast.error("密碼錯誤，無法刪除");
      setDeletePassword("");
      return;
    }
    clientInvoiceStore.deleteInvoice(invoice.id);
    setShowPasswordDelete(false);
    setDeletePassword("");
    navigate("/client-invoices");
    toast.success("已刪除客戶請款單");
  };

  const handleTitleChange = (newTitle: string) => {
    const oldTitle = invoice.title;
    clientInvoiceStore.updateInvoice(invoice.id, { title: newTitle });
    trackChange("title", oldTitle, newTitle);
  };

  // Full payment dialog confirm
  const handleFullPayConfirm = () => {
    const noFee = fullPayNoFee;
    const amount = noFee ? total : parseFloat(fullPayAmount);
    if (!noFee && (isNaN(amount) || amount <= 0)) {
      toast.error("請輸入有效金額");
      return;
    }
    if (!noFee && amount > remaining) {
      setAmountTooHighMsg(`輸入金額過高，目前剩餘應收總額為 ${formatCurrency(remaining)}，請調整金額。`);
      return;
    }
    const now = new Date().toISOString();
    const payment: ClientPaymentRecord = {
      id: crypto.randomUUID(),
      type: "full",
      amount: noFee ? undefined : amount,
      noFee,
      timestamp: now,
    };
    const newPayments = [...invoice.payments, payment];
    clientInvoiceStore.updateInvoice(invoice.id, {
      status: "collected" as ClientInvoiceStatus,
      payments: newPayments,
      transferDate: now,
    });
    trackChange("status", clientInvoiceStatusLabels[invoice.status], "收款完畢");
    forceCommitPending();
    setShowFullPayDialog(false);
    setFullPayAmount("");
    setFullPayNoFee(false);
    toast.success("已記錄收款完畢");
  };

  // Partial payment dialog confirm
  const handlePartialPayConfirm = () => {
    const amount = parseFloat(partialPayAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("請輸入有效金額");
      return;
    }
    if (amount + paidSoFar > total) {
      setAmountTooHighMsg(`輸入金額過高，已收金額加上本次收款合計超出應收總額 ${formatCurrency(total)}，請調整金額。`);
      return;
    }
    const now = new Date().toISOString();
    const payment: ClientPaymentRecord = {
      id: crypto.randomUUID(),
      type: "partial",
      amount,
      timestamp: now,
    };
    const newPayments = [...invoice.payments, payment];
    const newPaidTotal = paidSoFar + amount;
    const shouldClose = partialPayClose || newPaidTotal >= total;
    const newStatus: ClientInvoiceStatus = shouldClose ? "collected" : "partial_collected";
    clientInvoiceStore.updateInvoice(invoice.id, {
      status: newStatus,
      payments: newPayments,
      ...(shouldClose ? { transferDate: now } : {}),
    });
    trackChange("status", clientInvoiceStatusLabels[invoice.status], clientInvoiceStatusLabels[newStatus]);
    if (shouldClose) forceCommitPending();
    setShowPartialPayDialog(false);
    setPartialPayAmount("");
    setPartialPayClose(false);
    toast.success(shouldClose ? "已記錄收款完畢" : "已記錄部份收款");
  };

  // Record-only checkbox handler
  const handleRecordOnlyCheck = () => {
    if (invoice.isRecordOnly) return;
    setRecordAmountInput("");
    setRecordCurrencyInput((() => {
      const clientOpt = clientOptions.find((o) => o.label === invoice.client);
      return clientOpt?.currency || "TWD";
    })());
    setShowRecordAmountDialog(true);
  };

  const handleRecordAmountConfirm = () => {
    const amount = parseFloat(recordAmountInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error("請輸入有效金額");
      return;
    }
    clientInvoiceStore.updateInvoice(invoice.id, {
      isRecordOnly: true,
      recordAmount: amount,
      recordCurrency: recordCurrencyInput,
    });
    setShowRecordAmountDialog(false);
    toast.success("已設定為純請款紀錄");
  };

  // Edit record-only handler
  const handleEditRecordOpen = () => {
    setEditRecordAmount(String(invoice.recordAmount || 0));
    setEditRecordCurrency(invoice.recordCurrency || "TWD");
    setShowEditRecordDialog(true);
  };

  const handleEditRecordConfirm = () => {
    const amount = parseFloat(editRecordAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("請輸入有效金額");
      return;
    }
    clientInvoiceStore.updateInvoice(invoice.id, {
      recordAmount: amount,
      recordCurrency: editRecordCurrency,
    });
    setShowEditRecordDialog(false);
    toast.success("已更新請款紀錄");
  };

  const handleNoteChange = (newNote: string) => {
    const oldNote = invoice.note;
    clientInvoiceStore.updateInvoice(invoice.id, { note: newNote });
    trackChange("note", oldNote || "(空)", newNote || "(空)");
  };

  const handleAddComment = (content: string, imageUrls?: string[], fileUrls?: { name: string; url: string }[], replyTo?: string) => {
    const authorName = profile?.display_name || profile?.email || "使用者";
    const newComment: CommentEntry = {
      id: `comment-${Date.now()}`,
      author: authorName,
      content,
      imageUrls,
      fileUrls,
      replyTo,
      timestamp: formatTimestamp(new Date()),
    };
    const updated = [...comments, newComment];
    setComments(updated);
    if (id) {
      clientInvoiceStore.updateInvoice(id, { comments: updated } as any);
    }
  };

  const handleAddFees = () => {
    clientInvoiceStore.addFeesToInvoice(invoice.id, selectedAddFees);
    const addedNames = selectedAddFees.map((fid) => fees.find((f) => f.id === fid)?.title || "未命名").join(", ");
    trackChange("費用", "", `新增 ${selectedAddFees.length} 筆: ${addedNames}`);
    setSelectedAddFees([]);
    setAddFeeOpen(false);
    toast.success(`已加入 ${selectedAddFees.length} 筆費用`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-4 py-3 flex items-center justify-between gap-4">
        <Link
          to="/client-invoices"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          返回客戶請款單清單
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <ApplyTemplateButton
            module="clientInvoices"
            onApply={(values) => {
              if (id) {
                clientInvoiceStore.updateInvoice(id, values);
              }
              toast.success("已套用範本");
            }}
          />
          {((!isCollected && isAdmin) || (isCollected && isExecutive)) && checkPerm("client_invoice", "cinv_detail_delete", "edit") && (
            <Button size="sm" className="text-xs min-w-[88px] text-white hover:opacity-80" style={{ backgroundColor: '#6B7280' }} onClick={() => {
              if (isCollected) {
                setShowPasswordDelete(true);
              } else {
                setShowDelete(true);
              }
            }}>
              刪除
            </Button>
          )}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          {/* Title row with status */}
          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="min-w-0">
              {isCollected ? (
                <h1 className="text-2xl font-semibold tracking-tight text-muted-foreground">
                  {invoice.title || "未命名"}
                </h1>
              ) : (
                <Input
                  ref={titleInputRef}
                  value={invoice.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="客戶請款單標題"
                  className="text-2xl font-semibold tracking-tight border-0 shadow-none px-0 h-auto py-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">狀態</span>
              <StatusBadge status={invoice.status} />
            </div>
          </div>

          <Separator />

          {/* Fields: two columns */}
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-4">
              {/* Left: 純請款紀錄 checkbox + 請款管道 */}
              <div className="flex items-center h-10 gap-3">
                <div className="flex items-center gap-2">
                  {(() => {
                    const hasFeeEntries = invoice.feeIds.length > 0;
                    const disabled = !!invoice.isRecordOnly || isCollected || hasFeeEntries;
                    const checkbox = (
                      <Checkbox
                        checked={!!invoice.isRecordOnly}
                        onCheckedChange={() => handleRecordOnlyCheck()}
                        disabled={disabled}
                      />
                    );
                    return hasFeeEntries && !invoice.isRecordOnly ? (
                      <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                        <span className="flex items-center">{checkbox}</span>
                      </TooltipTrigger><TooltipContent className="text-xs">已有費用收錄</TooltipContent></Tooltip></TooltipProvider>
                    ) : checkbox;
                  })()}
                  <span className="text-sm">純請款紀錄</span>
                </div>
                <Select
                  value={invoice.billingChannel || ""}
                  onValueChange={(v) => clientInvoiceStore.updateInvoice(invoice.id, { billingChannel: v })}
                  disabled={isCollected}
                >
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue placeholder="請款管道" />
                  </SelectTrigger>
                  <SelectContent>
                    {billingChannelOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.label} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Right: 客戶 with label badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">客戶</span>
                {(() => {
                  const clientOpt = clientOptions.find((o) => o.label === invoice.client);
                  const bgColor = clientOpt?.color || "hsl(var(--muted))";
                  const textColor = labelStyles.client?.textColor || "#fff";
                  return (
                    <Badge
                      variant="default"
                      className="border"
                      style={{ backgroundColor: bgColor, color: textColor, borderColor: bgColor }}
                    >
                      {invoice.client || "未指定"}
                    </Badge>
                  );
                })()}
              </div>
            </div>

            {/* Date fields row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">預計收款時間</Label>
                <DateOnlyPicker
                  value={invoice.expectedCollectionDate}
                  onChange={(v) => clientInvoiceStore.updateInvoice(invoice.id, { expectedCollectionDate: v })}
                  disabled={isCollected}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">實際收款時間</Label>
                <DateOnlyPicker
                  value={invoice.actualCollectionDate}
                  onChange={(v) => clientInvoiceStore.updateInvoice(invoice.id, { actualCollectionDate: v })}
                  disabled={isCollected}
                />
              </div>
            </div>
          </div>

          {/* Fee list / Record-only item */}
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">標題</TableHead>
                  <TableHead className="text-center w-[120px]">應收總額</TableHead>
                  {editable && !invoice.isRecordOnly && <TableHead className="text-center w-[60px]">移除</TableHead>}
                  {invoice.isRecordOnly && editable && <TableHead className="text-center w-[60px]">編輯</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.isRecordOnly ? (
                  <TableRow>
                    <TableCell className="text-sm font-medium">請款紀錄</TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                        <span className="cursor-default">{formatCurrency(invoice.recordAmount || 0, recordCur)}</span>
                      </TooltipTrigger><TooltipContent className="text-xs">手動輸入</TooltipContent></Tooltip></TooltipProvider>
                    </TableCell>
                    {editable && (
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleEditRecordOpen}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ) : (
                  <>
                    {linkedFees.map((fee) => {
                      const clientInfo = fee.clientInfo as any;
                      const ft = clientInfo?.items
                        ? clientInfo.items.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unitPrice || 0), 0)
                        : 0;
                      return (
                        <TableRow key={fee.id}>
                          <TableCell>
                            <Link to={`/fees/${fee.id}`} className="text-sm font-medium hover:underline text-primary">
                              {fee.title || <span className="text-muted-foreground italic">未命名</span>}
                            </Link>
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                              <span className="cursor-default">{formatCurrency(ft)}</span>
                            </TooltipTrigger><TooltipContent className="text-xs">自動計算</TooltipContent></Tooltip></TooltipProvider>
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
                        <TableCell colSpan={editable ? 3 : 2} className="text-center py-8 text-muted-foreground">
                          尚未收錄任何費用
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
              {(linkedFees.length > 0 || invoice.isRecordOnly) && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-left">
                      <span className="text-muted-foreground text-sm">
                        {invoice.isRecordOnly ? "純請款紀錄" : `共 ${linkedFees.length} 筆費用`}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                        <span className="font-semibold tabular-nums cursor-default">{formatCurrency(total, recordCur)}</span>
                      </TooltipTrigger><TooltipContent className="text-xs">自動計算</TooltipContent></Tooltip></TooltipProvider>
                    </TableCell>
                    {editable && !invoice.isRecordOnly && <TableCell />}
                    {invoice.isRecordOnly && editable && <TableCell />}
                  </TableRow>
                  {/* TWD conversion row when record-only and non-TWD currency */}
                  {totalInTwd !== null && (
                    <TableRow>
                      <TableCell className="text-left">
                        <span className="text-muted-foreground text-sm">換算新台幣</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                          <span className="font-semibold tabular-nums cursor-default">{formatCurrency(totalInTwd, "TWD")}</span>
                        </TooltipTrigger><TooltipContent className="text-xs">匯率 1 {recordCur} = {recordTwdRate} TWD</TooltipContent></Tooltip></TooltipProvider>
                      </TableCell>
                      {editable && <TableCell />}
                    </TableRow>
                  )}
                  {/* Show remaining / service fee info when partially or fully collected */}
                  {invoice.status !== "pending" && paidSoFar > 0 && (
                    <>
                      <TableRow>
                        <TableCell className="text-left">
                          <span className="text-muted-foreground text-sm">收款總額</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold tabular-nums">{formatCurrency(paidSoFar, recordCur)}</span>
                        </TableCell>
                        {editable && !invoice.isRecordOnly && <TableCell />}
                        {invoice.isRecordOnly && editable && <TableCell />}
                      </TableRow>
                      {invoice.status === "partial_collected" && remaining > 0 && (
                        <TableRow>
                          <TableCell className="text-left">
                            <span className="text-muted-foreground text-sm">剩餘應收總額</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold tabular-nums text-amber-500">{formatCurrency(remaining, recordCur)}</span>
                          </TableCell>
                          {editable && !invoice.isRecordOnly && <TableCell />}
                          {invoice.isRecordOnly && editable && <TableCell />}
                        </TableRow>
                      )}
                      {invoice.status === "collected" && paidSoFar < total && (
                        <TableRow>
                          <TableCell className="text-left">
                            <span className="text-muted-foreground text-sm">手續費</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold tabular-nums text-destructive">{formatCurrency(total - paidSoFar, recordCur)}</span>
                          </TableCell>
                          {editable && !invoice.isRecordOnly && <TableCell />}
                          {invoice.isRecordOnly && editable && <TableCell />}
                        </TableRow>
                      )}
                    </>
                  )}
                </TableFooter>
              )}
            </Table>

            {/* Action row: + left, 收款 right */}
            <div className="flex items-center justify-between">
              <div>
                {editable && !invoice.isRecordOnly && availableFees.length > 0 && checkPerm("client_invoice", "cinv_detail_addFee", "edit") && (
                  <Popover open={addFeeOpen} onOpenChange={(open) => {
                    setAddFeeOpen(open);
                    if (!open) setSelectedAddFees([]);
                  }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-7 w-7">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-3 space-y-3">
                      <p className="text-sm font-medium">加入費用</p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {availableFees.map((f) => {
                          const clientInfo = f.clientInfo as any;
                          const fTotal = clientInfo?.items
                            ? clientInfo.items.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unitPrice || 0), 0)
                            : 0;
                          return (
                            <label key={f.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer text-sm">
                              <Checkbox
                                checked={selectedAddFees.includes(f.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedAddFees((prev) =>
                                    checked ? [...prev, f.id] : prev.filter((x) => x !== f.id)
                                  );
                                }}
                              />
                              <span className="flex-1 truncate">{f.title || "未命名"}</span>
                              <span className="text-muted-foreground tabular-nums">{formatCurrency(fTotal)}</span>
                            </label>
                          );
                        })}
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={selectedAddFees.length === 0}
                        onClick={handleAddFees}
                      >
                        加入 {selectedAddFees.length > 0 ? `(${selectedAddFees.length})` : ""}
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              {!isCollected && isAdmin && checkPerm("client_invoice", "cinv_detail_payFull", "edit") && (
                invoice.status === "partial_collected" ? (
                  <Button variant="outline" size="sm" onClick={() => {
                    setPartialPayAmount("");
                    setPartialPayClose(false);
                    setShowPartialPayDialog(true);
                  }}>收款</Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">收款</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setFullPayAmount("");
                        setFullPayNoFee(false);
                        setShowFullPayDialog(true);
                      }}>全額收齊</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setPartialPayAmount("");
                        setPartialPayClose(false);
                        setShowPartialPayDialog(true);
                      }}>部份到帳</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              )}
            </div>

            {/* Payment records */}
            {invoice.payments.map((p, idx) => {
              const paidUpToHere = invoice.payments.slice(0, idx + 1).reduce(
                (s, pp) => s + (pp.type === "full" ? (pp.noFee ? total : (pp.amount || 0)) : (pp.amount || 0)), 0
              );
              const remainingAfter = total - paidUpToHere;
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">收款時間：</span>
                  <span>{formatTimestamp(new Date(p.timestamp))}</span>
                  <span className="text-muted-foreground">
                    {p.type === "full"
                      ? p.noFee
                        ? "（無手續費全額收齊）"
                        : `（全額收齊：${formatCurrency(p.amount || 0)}${remainingAfter > 0 ? ` / 手續費：${formatCurrency(remainingAfter)}` : ""}）`
                      : `（部份到帳：${formatCurrency(p.amount || 0)} / 尚餘：${formatCurrency(Math.max(0, remainingAfter))}）`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Meta info */}
          <Separator />
          <div className="flex gap-6 text-xs text-muted-foreground">
            <span>建立者：{creatorName}</span>
            <span>建立時間：{formatTimestamp(invoice.createdAt)}</span>
          </div>

          {/* Edit History */}
          {(editLog.length > 0 || pendingChanges.length > 0) && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">變更紀錄</Label>
                <div className="space-y-2">
                  {editLog.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs space-y-0.5">
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        <span><span className="text-muted-foreground">變更者：</span>{entry.changedBy}</span>
                        <span><span className="text-muted-foreground">變更內容：</span>{entry.description}</span>
                        <span><span className="text-muted-foreground">變更時間：</span>{entry.timestamp}</span>
                      </div>
                    </div>
                  ))}
                  {pendingChanges.map((change, idx) => (
                    <div key={`pending-${idx}`} className="rounded-md border border-dashed border-border bg-secondary/15 px-3 py-2 text-xs space-y-0.5 opacity-60">
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 italic">
                        <span><span className="text-muted-foreground">變更者：</span>{profile?.display_name || profile?.email || "使用者"}</span>
                        <span><span className="text-muted-foreground">變更內容：</span>{fieldLabels[change.field] || change.field} {change.oldValue} → {change.newValue}</span>
                        <span><span className="text-muted-foreground">變更時間：</span>{formatTimestamp(new Date(change.changedAt))}</span>
                        <span className="text-muted-foreground">（未滿 5 分鐘，尚未正式紀錄）</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 客戶請款備註 */}
          <Separator />
          <div className="space-y-3">
            <Label className="text-sm font-medium">客戶請款備註</Label>
            <div className="space-y-2">
              {(() => {
                const topLevel = comments.filter((c) => !c.replyTo);
                const getReplies = (parentId: string) => comments.filter((c) => c.replyTo === parentId);
                return topLevel.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.author}</span>
                          <span className="text-muted-foreground">{c.timestamp}</span>
                        </div>
                        <button className="text-muted-foreground hover:text-foreground text-[10px] px-1.5 py-0.5 rounded hover:bg-accent transition-colors" onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}>回覆</button>
                      </div>
                      <CommentContent content={c.content} imageUrls={c.imageUrls} fileUrls={c.fileUrls} />
                    </div>
                    {getReplies(c.id).map((r) => (
                      <div key={r.id} className="ml-6 rounded-md border border-border/60 bg-secondary/15 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{r.author}</span>
                          <span className="text-muted-foreground">{r.timestamp}</span>
                        </div>
                        <CommentContent content={r.content} imageUrls={r.imageUrls} fileUrls={r.fileUrls} />
                      </div>
                    ))}
                    {replyingTo === c.id && (
                      <div className="ml-6">
                        <CommentInput draft={commentDraft} setDraft={setCommentDraft} placeholder={`回覆 ${c.author}...`} onSubmit={(content, imageUrls, fileUrls) => { handleAddComment(content, imageUrls, fileUrls, c.id); setReplyingTo(null); }} />
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
            <CommentInput draft={replyingTo ? "" : commentDraft} setDraft={(v) => { if (!replyingTo) setCommentDraft(v); }} placeholder="輸入留言..." onSubmit={handleAddComment} />
          </div>
        </div>
      </motion.div>

      {/* Full payment dialog */}
      <AlertDialog open={showFullPayDialog} onOpenChange={setShowFullPayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>全額收齊</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>請輸入實收金額，差額視為手續費：</p>
                <p className="text-sm">目前剩餘應收總額：<span className="font-semibold">{formatCurrency(remaining)}</span></p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={fullPayNoFee}
                    onCheckedChange={(checked) => {
                      setFullPayNoFee(!!checked);
                      if (checked) setFullPayAmount("");
                    }}
                  />
                  <span className="text-sm">無手續費全額收齊</span>
                </div>
                {!fullPayNoFee && (
                  <Input
                    type="number"
                    value={fullPayAmount}
                    onChange={(e) => setFullPayAmount(e.target.value)}
                    placeholder="輸入實收金額"
                    className="w-full"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleFullPayConfirm(); }}
                  />
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleFullPayConfirm}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Partial payment dialog */}
      <AlertDialog open={showPartialPayDialog} onOpenChange={setShowPartialPayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>部份到帳</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>請輸入收款金額：</p>
                <p className="text-sm">目前剩餘應收總額：<span className="font-semibold">{formatCurrency(remaining)}</span></p>
                <Input
                  type="number"
                  value={partialPayAmount}
                  onChange={(e) => setPartialPayAmount(e.target.value)}
                  placeholder="輸入收款金額"
                  className="w-full"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handlePartialPayConfirm(); }}
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={partialPayClose}
                    onCheckedChange={(checked) => setPartialPayClose(!!checked)}
                  />
                  <span className="text-sm">收款完畢</span>
                  <span className="text-xs text-muted-foreground">將請款單結案，差額視為手續費</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handlePartialPayConfirm}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Record-only amount dialog */}
      <AlertDialog open={showRecordAmountDialog} onOpenChange={setShowRecordAmountDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>設定請款金額</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>勾選「純請款紀錄」後將鎖定，請輸入請款金額：</p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">幣值</Label>
                  <select
                    value={recordCurrencyInput}
                    onChange={(e) => setRecordCurrencyInput(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {currencies.map((c) => (
                      <option key={c.id} value={c.code}>{c.code} — {c.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  type="number"
                  value={recordAmountInput}
                  onChange={(e) => setRecordAmountInput(e.target.value)}
                  placeholder="輸入金額"
                  className="w-full"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleRecordAmountConfirm(); }}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecordAmountConfirm}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit record-only dialog */}
      <AlertDialog open={showEditRecordDialog} onOpenChange={setShowEditRecordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>編輯請款金額</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">幣值</Label>
                  <select
                    value={editRecordCurrency}
                    onChange={(e) => setEditRecordCurrency(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {currencies.map((c) => (
                      <option key={c.id} value={c.code}>{c.code} — {c.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  type="number"
                  value={editRecordAmount}
                  onChange={(e) => setEditRecordAmount(e.target.value)}
                  placeholder="輸入金額"
                  className="w-full"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleEditRecordConfirm(); }}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleEditRecordConfirm}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除客戶請款單？</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原，但收錄的費用不會被刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password delete dialog for collected invoices */}
      <AlertDialog open={showPasswordDelete} onOpenChange={(open) => { if (!open) { setShowPasswordDelete(false); setDeletePassword(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除已收款請款單</AlertDialogTitle>
            <AlertDialogDescription>此請款單已收款完畢，請輸入您的密碼以確定刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="請輸入密碼…"
              onKeyDown={(e) => { if (e.key === "Enter") handlePasswordDelete(); }}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowPasswordDelete(false); setDeletePassword(""); }}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handlePasswordDelete} disabled={deletingWithPassword} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingWithPassword ? "驗證中…" : "確定刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove fee dialog */}
      <AlertDialog open={!!removeFeeId} onOpenChange={(open) => !open && setRemoveFeeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除費用？</AlertDialogTitle>
            <AlertDialogDescription>將此費用從客戶請款單中移除，費用本身不會被刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveFee}>移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Amount too high alert */}
      <AlertDialog open={!!amountTooHighMsg} onOpenChange={(open) => { if (!open) setAmountTooHighMsg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>金額錯誤</AlertDialogTitle>
            <AlertDialogDescription>{amountTooHighMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAmountTooHighMsg(null)}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
