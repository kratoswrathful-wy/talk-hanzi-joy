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
import { LabeledCheckbox } from "@/components/ui/checkbox-patterns";
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
import { type ClientInvoiceAdjustmentLine, type ClientInvoiceStatus, type ClientPaymentRecord, clientInvoiceStatusLabels } from "@/data/client-invoice-types";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useClientInvoices } from "@/hooks/use-client-invoice-store";
import { supabase } from "@/integrations/supabase/client";
import { applyEditLogFieldChange, type BurstMap, type SimplePersistedLog } from "@/lib/edit-log-coalesce";
import { filterEditLogsClientInvoice } from "@/lib/edit-log-permission-filter";
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
import { MODULE_TOOLBAR_BTN } from "@/lib/module-toolbar-buttons";
import { toast } from "sonner";
import { ApplyTemplateButton } from "@/components/ApplyTemplateButton";
import { CommentContent } from "@/components/comments/CommentContent";
import { CommentInput } from "@/components/comments/CommentInput";

function StatusBadge({ status }: { status: ClientInvoiceStatus }) {
  const { options: statusLabelOptions } = useSelectOptions("statusLabel");
  const statusLabelOptionIdMap: Record<ClientInvoiceStatus, string> = {
    pending: "sl-invoice-pending",
    partial_collected: "sl-invoice-partial",
    collected: "sl-invoice-paid",
  };
  const opt = statusLabelOptions.find((o) => o.id === statusLabelOptionIdMap[status]);
  const bgColor = opt?.color || "#6B7280";
  const textColor = opt?.textColor || "#FFFFFF";
  const label = opt?.label || clientInvoiceStatusLabels[status];
  return (
    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
      <span className="cursor-default">
        <Badge
          variant="default"
          className="border"
          style={{ backgroundColor: bgColor, color: textColor, borderColor: bgColor }}
        >
          {label}
        </Badge>
      </span>
    </TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>
  );
}

const formatCurrency = (n: number, code = "TWD") =>
  `${code} ${n.toLocaleString("zh-TW", { minimumFractionDigits: 0 })}`;

/** Compute a single fee's revenue in its original client currency */
function getFeeRevenue(fee: any, clientOptions: any[]): { amount: number; currency: string } {
  const ci = fee.clientInfo as any;
  if (!ci?.clientTaskItems) return { amount: 0, currency: "TWD" };
  // For notFirstFee pages, revenue is attributed to the first fee, so skip
  if (ci.notFirstFee) return { amount: 0, currency: "TWD" };
  const amount = ci.clientTaskItems.reduce(
    (s: number, i: any) => s + Number(i.unitCount || 0) * Number(i.clientPrice || 0), 0
  );
  const clientOpt = clientOptions.find((o: any) => o.label === ci.client);
  const currency = clientOpt?.currency || "TWD";
  return { amount, currency };
}

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

type EditLogEntry = SimplePersistedLog;

const fieldLabels: Record<string, string> = {
  title: "標題",
  invoiceNumber: "請款單編號",
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
  const { options: billingChannelOptions } = useSelectOptions("billingChannel");
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

  // 請款額調整 dialog（set_target：依目前合計自動加／減一筆至目標金額）
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [adjOperation, setAdjOperation] = useState<"set_target" | "add" | "subtract">("set_target");
  const [adjCurrency, setAdjCurrency] = useState("TWD");
  const [adjAmount, setAdjAmount] = useState("");

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

  // Edit history（即時寫入 + 五分鐘內回到錨點則撤銷）
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
  const burstMapRef = useRef<BurstMap>({});
  const invoiceRefForUnmount = useRef(invoice);
  invoiceRefForUnmount.current = invoice;

  const visibleEditLog = useMemo(
    () => filterEditLogsClientInvoice(editLog, checkPerm),
    [editLog, checkPerm]
  );

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
        id: l.id,
        changedBy: l.changedBy,
        description: l.description,
        timestamp: l.timestamp,
        fieldKey: l.fieldKey,
      })));
    }
    burstMapRef.current = {};
  }, [invoice?.id]);

  /** 建立者首次離開本頁後才開始記錄（總表批次建立已帶 editLogStartedAt 者除外） */
  useEffect(() => {
    return () => {
      const inv = invoiceRefForUnmount.current;
      const uid = user?.id;
      if (!id || !inv || !uid || inv.createdBy !== uid || inv.editLogStartedAt) return;
      clientInvoiceStore.updateInvoice(id, { editLogStartedAt: new Date().toISOString() });
    };
  }, [id, user?.id]);

  const trackChange = useCallback((field: string, oldValue: string, newValue: string) => {
    if (oldValue === newValue) return;
    if (!invoiceRefForUnmount.current?.editLogStartedAt) return;
    const authorName = profile?.display_name || profile?.email || "系統";
    setEditLog((prev) => {
      const { nextLogs, nextBurstMap } = applyEditLogFieldChange({
        fieldKey: field,
        oldValue,
        newValue,
        now: Date.now(),
        author: authorName,
        formatTimestamp,
        fieldLabel: fieldLabels[field] || field,
        existingLogs: prev,
        burstMap: burstMapRef.current,
      });
      burstMapRef.current = nextBurstMap;
      if (id) clientInvoiceStore.updateInvoice(id, { edit_logs: nextLogs } as any);
      return nextLogs;
    });
  }, [id, profile]);

  const forceCommitPending = useCallback(() => {}, []);

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

  const linkedFees = useMemo(() => {
    if (!invoice) return [];
    return invoice.feeIds
      .map((fid) => fees.find((f) => f.id === fid))
      .filter(Boolean) as typeof fees;
  }, [invoice, fees]);

  // Total receivable from linked fees – sum original currency then convert to TWD
  const feeTotalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of linkedFees) {
      const { amount, currency } = getFeeRevenue(f, clientOptions);
      map.set(currency, (map.get(currency) || 0) + amount);
    }
    return map;
  }, [linkedFees, clientOptions]);

  const feeTotalTwd = useMemo(() => {
    let total = 0;
    feeTotalsByCurrency.forEach((amount, cur) => {
      total += amount * getTwdRate(cur);
    });
    return Math.round(total);
  }, [feeTotalsByCurrency, getTwdRate]);

  // For display in the fee table footer: show original currency sums
  const feeTotalOriginal = useMemo(() => {
    const entries = Array.from(feeTotalsByCurrency.entries());
    if (entries.length === 0) return "TWD 0";
    if (entries.length === 1) return formatCurrency(entries[0][1], entries[0][0]);
    return entries.map(([cur, amt]) => formatCurrency(amt, cur)).join(" + ");
  }, [feeTotalsByCurrency]);

  // Derive currency from client settings (must be before early return)
  const clientCurrency = useMemo(() => {
    if (!invoice) return "TWD";
    const clientOpt = clientOptions.find((o) => o.label === invoice.client);
    return clientOpt?.currency || "TWD";
  }, [clientOptions, invoice?.client]);

  /** 調整列合計，換算為客戶幣別金額（與 feeTotalsByCurrency 同層相加） */
  const adjustmentSumInClientCurrency = useMemo(() => {
    if (!invoice) return 0;
    const lines = invoice.adjustmentLines || [];
    let s = 0;
    for (const line of lines) {
      const sign = line.operation === "add" ? 1 : -1;
      const twd = line.amount * getTwdRate(line.currency) * sign;
      s += twd / getTwdRate(clientCurrency);
    }
    return s;
  }, [invoice, invoice?.adjustmentLines, clientCurrency, getTwdRate]);

  // Buffered title input
  const [localTitle, setLocalTitle] = useState(invoice?.title || "");
  const [localInvoiceNumber, setLocalInvoiceNumber] = useState(invoice?.invoiceNumber || "");
  useEffect(() => { if (invoice) setLocalTitle(invoice.title); }, [invoice?.id]);
  useEffect(() => { if (invoice) setLocalInvoiceNumber(invoice.invoiceNumber || ""); }, [invoice?.id]);

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

  // If record-only, totals are recordAmount in recordCur. Otherwise, fee totals in clientCurrency + 請款額調整
  const recordCur = invoice.isRecordOnly ? (invoice.recordCurrency || clientCurrency) : clientCurrency;
  /** 非純紀錄時與 totalOriginal 相同：客戶幣費用小計 + 調整列換算合計（請款額調整「設為特定數額」用） */
  const adjustmentDialogCurrentTotal =
    (feeTotalsByCurrency.get(clientCurrency) || 0) + adjustmentSumInClientCurrency;
  const totalOriginal = invoice.isRecordOnly
    ? (invoice.recordAmount || 0)
    : adjustmentDialogCurrentTotal;
  const recordTwdRate = getTwdRate(recordCur);
  const totalInTwd = recordCur === "TWD" ? Math.round(totalOriginal) : Math.round(totalOriginal * recordTwdRate);

  const isCollected = invoice.status === "collected";
  const editable = isAdmin && !isCollected;

  // Footer total: include adjustment lines when present
  const hasAdjustments = (invoice.adjustmentLines?.length ?? 0) > 0;
  const footerOriginalAmount = hasAdjustments
    ? formatCurrency(adjustmentDialogCurrentTotal, clientCurrency)
    : feeTotalOriginal;

  // Calculate paid so far
  const paidSoFar = invoice.payments.reduce((sum, p) => {
    if (p.type === "full") {
      return sum + (p.noFee ? totalOriginal : (p.amount || 0));
    }
    return sum + (p.amount || 0);
  }, 0);
  const remaining = Math.max(0, totalOriginal - paidSoFar);
  const serviceFee = Math.max(0, totalOriginal - paidSoFar);
  const netReceived = Math.max(0, paidSoFar - serviceFee);

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

  const handleTitleBlur = () => {
    if (localTitle !== invoice.title) {
      const oldTitle = invoice.title;
      clientInvoiceStore.updateInvoice(invoice.id, { title: localTitle });
      trackChange("title", oldTitle, localTitle);
    }
  };

  const handleInvoiceNumberBlur = () => {
    if (localInvoiceNumber !== (invoice.invoiceNumber || "")) {
      const old = invoice.invoiceNumber || "";
      clientInvoiceStore.updateInvoice(invoice.id, { invoiceNumber: localInvoiceNumber });
      trackChange("invoiceNumber", old, localInvoiceNumber);
    }
  };

  // Full payment dialog confirm
  const handleFullPayConfirm = () => {
    const noFee = fullPayNoFee;
    const amount = noFee ? totalOriginal : parseFloat(fullPayAmount);
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
    if (amount + paidSoFar > totalOriginal) {
      setAmountTooHighMsg(`輸入金額過高，已收金額加上本次收款合計超出應收總額 ${formatCurrency(totalOriginal, recordCur)}，請調整金額。`);
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
    const shouldClose = partialPayClose || newPaidTotal >= totalOriginal;
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

  const handleAdjustmentConfirm = () => {
    const rateClient = getTwdRate(clientCurrency);
    const rateAdj = getTwdRate(adjCurrency);
    const rateRatio = rateAdj / rateClient;

    if (adjOperation === "set_target") {
      const targetAmount = parseFloat(adjAmount);
      if (isNaN(targetAmount) || targetAmount <= 0) {
        toast.error("請輸入有效的目標金額");
        return;
      }
      const currentTotal =
        (feeTotalsByCurrency.get(clientCurrency) || 0) + adjustmentSumInClientCurrency;
      const targetInClient = (targetAmount * rateAdj) / rateClient;
      const delta = targetInClient - currentTotal;
      const EPS = 1e-6;
      if (Math.abs(delta) < EPS) {
        toast.info("請款總額已是該金額，無需新增調整");
        setShowAdjustmentDialog(false);
        setAdjAmount("");
        return;
      }
      const operation: "add" | "subtract" = delta > 0 ? "add" : "subtract";
      const amountLine = Math.abs(delta) / rateRatio;
      if (!Number.isFinite(amountLine) || amountLine <= 0) {
        toast.error("無法計算調整金額");
        return;
      }
      const line: ClientInvoiceAdjustmentLine = {
        id: crypto.randomUUID(),
        operation,
        amount: amountLine,
        currency: adjCurrency,
      };
      const next = [...(invoice.adjustmentLines || []), line];
      clientInvoiceStore.updateInvoice(invoice.id, { adjustmentLines: next });
      setShowAdjustmentDialog(false);
      setAdjAmount("");
      toast.success("已新增費用調整");
      return;
    }

    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("請輸入有效金額");
      return;
    }
    const line: ClientInvoiceAdjustmentLine = {
      id: crypto.randomUUID(),
      operation: adjOperation,
      amount,
      currency: adjCurrency,
    };
    const next = [...(invoice.adjustmentLines || []), line];
    clientInvoiceStore.updateInvoice(invoice.id, { adjustmentLines: next });
    setShowAdjustmentDialog(false);
    setAdjAmount("");
    toast.success("已新增費用調整");
  };

  const removeAdjustmentLine = (lineId: string) => {
    const next = (invoice.adjustmentLines || []).filter((l) => l.id !== lineId);
    clientInvoiceStore.updateInvoice(invoice.id, { adjustmentLines: next });
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
            <Button size="sm" className={cn(MODULE_TOOLBAR_BTN, "text-white hover:opacity-80")} style={{ backgroundColor: '#6B7280' }} onClick={() => {
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
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
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

          {/* Invoice number row */}
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">請款單編號</Label>
            {isCollected ? (
              <span className="text-sm text-muted-foreground">{invoice.invoiceNumber || "—"}</span>
            ) : (
              <Input
                value={localInvoiceNumber}
                onChange={(e) => setLocalInvoiceNumber(e.target.value)}
                onBlur={handleInvoiceNumberBlur}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="輸入請款單編號"
                className="h-8 text-sm max-w-xs"
              />
            )}
          </div>

          <Separator />

          {/* Fields: two columns */}
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-4">
              {/* Left: 請款管道（純請款紀錄改由舊資料保留，不再提供勾選建立） */}
              <div className="flex items-center h-10 gap-3">
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
                  disabled={!isAdmin}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">實際收款時間</Label>
                <DateOnlyPicker
                  value={invoice.actualCollectionDate}
                  onChange={(v) => clientInvoiceStore.updateInvoice(invoice.id, { actualCollectionDate: v })}
                  disabled={!isAdmin}
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
                      const { amount: ft, currency: feeCur } = getFeeRevenue(fee, clientOptions);
                      return (
                        <TableRow key={fee.id}>
                          <TableCell>
                            <Link to={`/fees/${fee.id}`} className="text-sm font-medium hover:underline text-primary">
                              {fee.title || <span className="text-muted-foreground italic">未命名</span>}
                            </Link>
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                              <span className="cursor-default">{formatCurrency(ft, feeCur)}</span>
                            </TooltipTrigger><TooltipContent className="text-xs">自動計算{feeCur !== "TWD" ? `（匯率 1 ${feeCur} = ${getTwdRate(feeCur)} TWD）` : ""}</TooltipContent></Tooltip></TooltipProvider>
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
                    {(invoice.adjustmentLines || []).map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-sm font-medium text-muted-foreground">費用調整</TableCell>
                        <TableCell className="text-center text-sm tabular-nums">
                          <span className={`${line.operation === "subtract" ? "text-destructive" : "text-foreground"} whitespace-nowrap`}>
                            {line.operation === "subtract" ? "−" : "+"}
                            {formatCurrency(line.amount, line.currency)}
                          </span>
                        </TableCell>
                        {editable && (
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeAdjustmentLine(line.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {linkedFees.length === 0 && (invoice.adjustmentLines || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={editable ? 3 : 2} className="text-center py-8 text-muted-foreground">
                          尚未收錄任何費用
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
              {(linkedFees.length > 0 || invoice.isRecordOnly || (invoice.adjustmentLines?.length ?? 0) > 0) && (
                <TableFooter>
                  {/* Show original currency sum row when non-record-only and multi-currency */}
                  {!invoice.isRecordOnly && feeTotalsByCurrency.size > 0 && (
                    <TableRow>
                      <TableCell className="text-left">
                        <span className="text-muted-foreground text-sm">
                          {invoice.isRecordOnly ? "純請款紀錄" : `共 ${linkedFees.length} 筆費用`}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                          <span className="font-medium tabular-nums cursor-default text-sm">{footerOriginalAmount}</span>
                        </TooltipTrigger><TooltipContent className="text-xs">{hasAdjustments ? "費用合計（含調整）" : "原幣值合計"}</TooltipContent></Tooltip></TooltipProvider>
                      </TableCell>
                      {editable && <TableCell />}
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="text-left">
                      <span className="text-muted-foreground text-sm">
                        {invoice.isRecordOnly ? "純請款紀錄" : "換算新台幣"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
                        <span className="font-semibold tabular-nums cursor-default">{formatCurrency(totalInTwd, "TWD")}</span>
                      </TooltipTrigger><TooltipContent className="text-xs">
                        {recordCur !== "TWD" ? `匯率 1 ${recordCur} = ${recordTwdRate} TWD` : "自動計算"}
                      </TooltipContent></Tooltip></TooltipProvider>
                    </TableCell>
                    {editable && !invoice.isRecordOnly && <TableCell />}
                    {invoice.isRecordOnly && editable && <TableCell />}
                  </TableRow>
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
                      <TableRow>
                        <TableCell className="text-left">
                          <span className="text-muted-foreground text-sm">手續費</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold tabular-nums text-destructive">
                            {invoice.status === "collected" ? formatCurrency(serviceFee, recordCur) : "—"}
                          </span>
                        </TableCell>
                        {editable && !invoice.isRecordOnly && <TableCell />}
                        {invoice.isRecordOnly && editable && <TableCell />}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-left">
                          <span className="text-muted-foreground text-sm">實收金額</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("font-semibold tabular-nums", invoice.status === "collected" ? "text-success" : "text-muted-foreground")}>
                            {invoice.status === "collected" ? formatCurrency(netReceived, recordCur) : "—"}
                          </span>
                        </TableCell>
                        {editable && !invoice.isRecordOnly && <TableCell />}
                        {invoice.isRecordOnly && editable && <TableCell />}
                      </TableRow>
                    </>
                  )}
                </TableFooter>
              )}
            </Table>

            {/* Action row: + left, 收款 right */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
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
                          const { amount: fTotal, currency: feeCur } = getFeeRevenue(f, clientOptions);
                          return (
                            <LabeledCheckbox
                              key={f.id}
                              checked={selectedAddFees.includes(f.id)}
                              onCheckedChange={(checked) => {
                                setSelectedAddFees((prev) =>
                                  checked ? [...prev, f.id] : prev.filter((x) => x !== f.id)
                                );
                              }}
                              labelClassName="rounded px-2 py-1.5 hover:bg-accent w-full items-center"
                              labelWrap
                              className="shrink-0 mt-0.5"
                            >
                              <span className="flex w-full min-w-0 items-center gap-2 text-sm">
                                <span className="flex-1 truncate">{f.title || "未命名"}</span>
                                <span className="text-muted-foreground tabular-nums shrink-0">{formatCurrency(fTotal, feeCur)}</span>
                              </span>
                            </LabeledCheckbox>
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
                      <Separator />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setAddFeeOpen(false);
                          setAdjCurrency(clientCurrency);
                          setAdjOperation("set_target");
                          setAdjAmount("");
                          setShowAdjustmentDialog(true);
                        }}
                      >
                        請款額調整
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
                {editable && !invoice.isRecordOnly && checkPerm("client_invoice", "cinv_detail_addFee", "edit") && availableFees.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      setAdjCurrency(clientCurrency);
                      setAdjOperation("set_target");
                      setAdjAmount("");
                      setShowAdjustmentDialog(true);
                    }}
                  >
                    請款額調整
                  </Button>
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
                (s, pp) => s + (pp.type === "full" ? (pp.noFee ? totalOriginal : (pp.amount || 0)) : (pp.amount || 0)), 0
              );
              const remainingAfter = totalOriginal - paidUpToHere;
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
          {visibleEditLog.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">變更紀錄</Label>
                <div className="space-y-2">
                  {visibleEditLog.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs space-y-0.5">
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        <span><span className="text-muted-foreground">變更者：</span>{entry.changedBy}</span>
                        <span><span className="text-muted-foreground">變更內容：</span>{entry.description}</span>
                        <span><span className="text-muted-foreground">變更時間：</span>{entry.timestamp}</span>
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
                <LabeledCheckbox
                  checked={fullPayNoFee}
                  onCheckedChange={(checked) => {
                    setFullPayNoFee(checked);
                    if (checked) setFullPayAmount("");
                  }}
                  labelClassName="items-center"
                >
                  無手續費全額收齊
                </LabeledCheckbox>
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
                <div className="space-y-1">
                  <LabeledCheckbox checked={partialPayClose} onCheckedChange={setPartialPayClose} labelClassName="items-center">
                    收款完畢
                  </LabeledCheckbox>
                  <p className="text-xs text-muted-foreground pl-6">將請款單結案，差額視為手續費</p>
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

      <AlertDialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>請款額調整</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-foreground">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">方式</Label>
                  <Select
                    value={adjOperation}
                    onValueChange={(v) => setAdjOperation(v as "set_target" | "add" | "subtract")}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set_target">設為特定數額</SelectItem>
                      <SelectItem value="add">增加應收</SelectItem>
                      <SelectItem value="subtract">減少應收</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">幣別</Label>
                  <select
                    value={adjCurrency}
                    onChange={(e) => setAdjCurrency(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm w-full"
                  >
                    {currencies.map((c) => (
                      <option key={c.id} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>
                {adjOperation === "set_target" && (
                  <p className="text-xs text-muted-foreground">
                    目前合計（客戶幣）：{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCurrency(adjustmentDialogCurrentTotal, clientCurrency)}
                    </span>
                  </p>
                )}
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {adjOperation === "set_target" ? "目標請款總額" : "金額"}
                  </Label>
                  <Input
                    type="number"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    placeholder={adjOperation === "set_target" ? "欲達成的請款總額" : "金額"}
                    className="w-full"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdjustmentConfirm(); }}
                  />
                </div>
                {adjOperation === "set_target" && (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    將依幣別匯率換算後，自動新增一筆「增加應收」或「減少應收」，使合計等於上方輸入之金額。
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleAdjustmentConfirm}>確定</AlertDialogAction>
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
