import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import AssigneeTag from "@/components/AssigneeTag";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useInvoice, invoiceStore } from "@/hooks/use-invoice-store";
import { useFees } from "@/hooks/use-fee-store";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { type InvoiceStatus, type PaymentRecord, invoiceStatusLabels } from "@/data/invoice-types";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useInvoices } from "@/hooks/use-invoice-store";
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
import { CommentContent } from "@/components/comments/CommentContent";
import { CommentInput } from "@/components/comments/CommentInput";

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const labelStyles = useLabelStyles();
  const styleMap: Record<InvoiceStatus, { bgColor: string; textColor: string }> = {
    pending: labelStyles.invoicePending,
    partial: labelStyles.invoicePartial,
    paid: labelStyles.invoicePaid,
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
          {invoiceStatusLabels[status]}
        </Badge>
      </span>
    </TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>
  );
}

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

const formatTimestamp = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

interface CommentEntry {
  id: string;
  author: string;
  content: string;
  imageUrls?: string[];
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

const COMMIT_DELAY_MS = 5 * 60 * 1000; // 5 minutes

const fieldLabels: Record<string, string> = {
  title: "標題",
  status: "狀態",
  note: "稿費請款備註",
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invoice = useInvoice(id);
  const fees = useFees();
  const { isAdmin, profile, roles, user } = useAuth();
  const { checkPerm } = usePermissions();
  const isExecutive = roles.some((r) => r.role === "executive");
  const { options: assigneeOptions } = useSelectOptions("assignee");
  const [showDelete, setShowDelete] = useState(false);
  const [showPasswordDelete, setShowPasswordDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingWithPassword, setDeletingWithPassword] = useState(false);
  const [removeFeeId, setRemoveFeeId] = useState<string | null>(null);
  const [showPartialInput, setShowPartialInput] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [showOverpayWarning, setShowOverpayWarning] = useState(false);
  const [overpayRemaining, setOverpayRemaining] = useState(0);
  const [addFeeOpen, setAddFeeOpen] = useState(false);
  const [selectedAddFees, setSelectedAddFees] = useState<string[]>([]);
  const allInvoices = useInvoices();

  // Comments
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [internalComments, setInternalComments] = useState<CommentEntry[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [internalCommentDraft, setInternalCommentDraft] = useState("");

  // Edit history
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  // Creator name resolution
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

  // Translator profile
  const [translatorProfile, setTranslatorProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  // Initialize from invoice data
  useEffect(() => {
    if (!invoice) return;
    // Load comments
    const rawComments = (invoice as any).comments;
    if (Array.isArray(rawComments)) {
      setComments(rawComments.map((c: any) => ({
        id: c.id,
        author: c.author,
        content: c.content,
        imageUrls: c.imageUrls,
        timestamp: c.timestamp,
      })));
    }
    // Load internal comments
    const rawInternalComments = (invoice as any).internalComments;
    if (Array.isArray(rawInternalComments)) {
      setInternalComments(rawInternalComments.map((c: any) => ({
        id: c.id,
        author: c.author,
        content: c.content,
        imageUrls: c.imageUrls,
        timestamp: c.timestamp,
      })));
    }
    // Load edit logs
    const rawEditLogs = (invoice as any).edit_logs;
    if (Array.isArray(rawEditLogs)) {
      setEditLog(rawEditLogs.map((l: any) => ({
        id: l.id,
        changedBy: l.changedBy,
        description: l.description,
        timestamp: l.timestamp,
      })));
    }
  }, [invoice?.id]); // Only on initial load

  // Load translator profile
  useEffect(() => {
    if (!invoice?.translator) return;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("display_name", invoice.translator)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTranslatorProfile(data);
      });
  }, [invoice?.translator]);

  // Pending changes commit logic (5-min delay)
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
        // Persist
        if (id) {
          const allLogs = [...editLog, ...newEntries];
          invoiceStore.updateInvoice(id, { edit_logs: allLogs } as any);
        }
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [pendingChanges, editLog, id, profile]);

  // Track field changes
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

  // Force commit all pending changes
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
      invoiceStore.updateInvoice(id, { edit_logs: allLogs } as any);
    }
  }, [pendingChanges, editLog, id, profile]);

  // Unlinked fees for this translator
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
      // Translator must match
      if (f.assignee !== invoice.translator) return false;
      // Fee must not be linked to any invoice already
      if (allLinkedFeeIds.has(f.id)) return false;
      // Fee must be finalized (opened)
      if (f.status !== "finalized") return false;
      return true;
    });
  }, [fees, invoice, allLinkedFeeIds]);

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
  const isOwnInvoice = invoice.translator === profile?.display_name;
  const editable = (isAdmin || isOwnInvoice) && !isPaid;

  const handleRemoveFee = () => {
    if (removeFeeId) {
      invoiceStore.removeFeeFromInvoice(invoice.id, removeFeeId);
      const fee = fees.find((f) => f.id === removeFeeId);
      trackChange("費用", fee?.title || "未命名費用", "已移除");
      setRemoveFeeId(null);
    }
  };

  const handleDelete = () => {
    invoiceStore.deleteInvoice(invoice.id);
    navigate("/invoices");
    toast.success("已刪除請款單");
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
    invoiceStore.deleteInvoice(invoice.id);
    setShowPasswordDelete(false);
    setDeletePassword("");
    navigate("/invoices");
    toast.success("已刪除請款單");
  };

  const handleTitleChange = (newTitle: string) => {
    const oldTitle = invoice.title;
    invoiceStore.updateInvoice(invoice.id, { title: newTitle });
    trackChange("title", oldTitle, newTitle);
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
    trackChange("status", invoiceStatusLabels[invoice.status], "已付款");
    forceCommitPending();
    toast.success("已記錄全額付款");
  };

  const paidSoFar = invoice.payments.reduce((sum, p) => sum + (p.type === "partial" ? (p.amount || 0) : 0), 0);
  const remaining = total - paidSoFar;

  const handlePartialPayment = () => {
    const amount = parseFloat(partialAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("請輸入有效金額");
      return;
    }
    if (amount > remaining) {
      setOverpayRemaining(remaining);
      setShowOverpayWarning(true);
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
    const newPaidTotal = paidSoFar + amount;
    const newStatus = newPaidTotal >= total ? "paid" : "partial";
    invoiceStore.updateInvoice(invoice.id, {
      status: newStatus,
      payments: newPayments,
      ...(newStatus === "paid" ? { transferDate: now } : {}),
    });
    trackChange("status", invoiceStatusLabels[invoice.status], invoiceStatusLabels[newStatus]);
    if (newStatus === "paid") forceCommitPending();
    setShowPartialInput(false);
    setPartialAmount("");
    toast.success("已記錄部份付款");
  };

  const handleNoteChange = (newNote: string) => {
    const oldNote = invoice.note;
    invoiceStore.updateInvoice(invoice.id, { note: newNote });
    trackChange("note", oldNote || "(空)", newNote || "(空)");
  };

  const handleAddComment = (content: string, imageUrls?: string[]) => {
    const authorName = profile?.display_name || profile?.email || "使用者";
    const newComment: CommentEntry = {
      id: `comment-${Date.now()}`,
      author: authorName,
      content,
      imageUrls,
      timestamp: formatTimestamp(new Date()),
    };
    const updated = [...comments, newComment];
    setComments(updated);
    if (id) {
      invoiceStore.updateInvoice(id, { comments: updated } as any);
    }
  };

  const handleAddInternalComment = (content: string, imageUrls?: string[]) => {
    const authorName = profile?.display_name || profile?.email || "使用者";
    const newComment: CommentEntry = {
      id: `icomment-${Date.now()}`,
      author: authorName,
      content,
      imageUrls,
      timestamp: formatTimestamp(new Date()),
    };
    const updated = [...internalComments, newComment];
    setInternalComments(updated);
    if (id) {
      // Store internal comments separately in the comments jsonb
      const allComments = [...comments];
      invoiceStore.updateInvoice(id, { comments: allComments, internalComments: updated } as any);
    }
  };

  const handleAddFees = () => {
    invoiceStore.addFeesToInvoice(invoice.id, selectedAddFees);
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
          to="/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          返回請款單清單
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {((!isPaid && (isAdmin || isOwnInvoice)) || (isPaid && isExecutive)) && checkPerm("translator_invoice", "inv_detail_delete", "edit") && (
            <Button size="sm" className="text-xs min-w-[88px] text-white hover:opacity-80" style={{ backgroundColor: '#6B7280' }} onClick={() => {
              if (isPaid) {
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
        {/* Main content card */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          {/* Title */}
          <div className="flex items-start justify-between gap-4">
            {isPaid ? (
              <h1 className="text-2xl font-semibold tracking-tight text-muted-foreground">
                {invoice.title || "未命名"}
              </h1>
            ) : (
              <Input
                value={invoice.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="請款單標題"
                className="text-2xl font-semibold tracking-tight border-0 shadow-none px-0 h-auto py-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
              />
            )}
          </div>

          <Separator />

          {/* Fields */}
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">請款人</Label>
                <div className="flex items-center h-10">
                  <AssigneeTag
                    label={translatorProfile?.display_name || invoice.translator || "未指定"}
                    avatarUrl={translatorProfile?.avatar_url || opt?.avatarUrl}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">狀態</Label>
                <div className="flex items-center h-10">
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
              </div>
            </div>
          </div>

          {/* Fee list */}
          <div className="space-y-3">
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

          {/* Action row: + left, 付款 right */}
          <div className="flex items-center justify-between">
            <div>
              {editable && availableFees.length > 0 && checkPerm("translator_invoice", "inv_detail_addFee", "edit") && (
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
                        const fTotal = f.taskItems.reduce((s: number, i: any) => s + i.unitCount * i.unitPrice, 0);
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
            {!isPaid && !showPartialInput && isAdmin && checkPerm("translator_invoice", "inv_detail_payFull", "edit") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">付款</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleFullPayment}>全額付款</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowPartialInput(true)}>部份付款</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {showPartialInput && (
            <div className="flex items-center gap-2 justify-end">
              <Input
                type="number"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder={`剩餘金額：${formatCurrency(remaining)}`}
                className="w-48 h-9"
                autoFocus
              />
              <Button size="sm" onClick={handlePartialPayment}>確認</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowPartialInput(false); setPartialAmount(""); }}>取消</Button>
            </div>
          )}

          {/* Payment records */}
          {invoice.payments.map((p, idx) => {
            const paidUpToHere = invoice.payments.slice(0, idx + 1).reduce(
              (s, pp) => s + (pp.type === "full" ? total : (pp.amount || 0)), 0
            );
            const remainingAfter = total - paidUpToHere;
            return (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">付款時間：</span>
                <span>{formatTimestamp(new Date(p.timestamp))}</span>
                <span className="text-muted-foreground">
                  {p.type === "full"
                    ? "（全額付款）"
                    : `（部份付款：${formatCurrency(p.amount || 0)} / 尚餘：${formatCurrency(Math.max(0, remainingAfter))}）`}
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

        {/* 稿費請款備註 */}
        <Separator />
        <div className="space-y-3">
          <Label className="text-sm font-medium">稿費請款備註</Label>
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{c.author}</span>
                  <span className="text-muted-foreground">{c.timestamp}</span>
                </div>
                <CommentContent content={c.content} imageUrls={c.imageUrls} />
              </div>
            ))}
          </div>
          <CommentInput
            draft={commentDraft}
            setDraft={setCommentDraft}
            placeholder="輸入留言..."
            onSubmit={handleAddComment}
          />
        </div>

        {/* 稿費請款內部備註 — PM+ only */}
        {isAdmin && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">稿費請款內部備註</Label>
              <div className="space-y-2">
                {internalComments.map((c) => (
                  <div key={c.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{c.author}</span>
                      <span className="text-muted-foreground">{c.timestamp}</span>
                    </div>
                    <CommentContent content={c.content} imageUrls={c.imageUrls} />
                  </div>
                ))}
              </div>
              <CommentInput
                draft={internalCommentDraft}
                setDraft={setInternalCommentDraft}
                placeholder="輸入稿費請款內部備註..."
                onSubmit={handleAddInternalComment}
              />
            </div>
          </>
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

      {/* Password delete dialog for paid invoices */}
      <AlertDialog open={showPasswordDelete} onOpenChange={(open) => { if (!open) { setShowPasswordDelete(false); setDeletePassword(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除已付款請款單</AlertDialogTitle>
            <AlertDialogDescription>此請款單已付款完畢，請輸入您的密碼以確認刪除。</AlertDialogDescription>
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
              {deletingWithPassword ? "驗證中…" : "確認刪除"}
            </AlertDialogAction>
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

      {/* Overpay warning dialog */}
      <AlertDialog open={showOverpayWarning} onOpenChange={setShowOverpayWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>金額超出剩餘款項</AlertDialogTitle>
            <AlertDialogDescription>
              目前剩餘未付金額為 {formatCurrency(overpayRemaining)}，請輸入小於或等於此金額的數字。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowOverpayWarning(false)}>了解</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
