import { useNavigate } from "react-router-dom";
import { Plus, ExternalLink, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import AssigneeTag from "@/components/AssigneeTag";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useInvoices, invoiceStore } from "@/hooks/use-invoice-store";
import { useFees } from "@/hooks/use-fee-store";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useSelectOptions, selectOptionsStore } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { type InvoiceStatus, invoiceStatusLabels } from "@/data/invoice-types";
import { useState, useCallback, useRef, useEffect } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  const { isAdmin, profile, user, roles } = useAuth();
  const isExecutive = roles.some((r) => r.role === "executive");
  const allInvoices = useInvoices();
  // Filter invoices: non-admin users can only see their own invoices
  const invoices = isAdmin ? allInvoices : allInvoices.filter(
    (inv) => inv.translator === profile?.display_name
  );
  const fees = useFees();
  const { options: assigneeOptions } = useSelectOptions("assignee");

  // Load assignee options on mount
  useEffect(() => {
    selectOptionsStore.loadAssignees();
  }, []);

  // Translator picker for admin creation
  const [showTranslatorPicker, setShowTranslatorPicker] = useState(false);
  const [selectedTranslator, setSelectedTranslator] = useState<string>("");

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Password confirmation for deleting paid invoices (executive only)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Row selection
  const rowSelection = useRowSelection(invoices.map((inv) => inv.id));

  // Marquee selection
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const marqueeRef = useRef(marquee);
  marqueeRef.current = marquee;
  const rowRefsMap = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const registerRowRef = useCallback((id: string, el: HTMLTableRowElement | null) => {
    if (el) rowRefsMap.current.set(id, el);
    else rowRefsMap.current.delete(id);
  }, []);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    let isMarquee = false;
    let startX = 0, startY = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, button, [role=checkbox], a, [data-no-marquee]")) return;

      const rect = container.getBoundingClientRect();
      startX = e.clientX - rect.left + container.scrollLeft;
      startY = e.clientY - rect.top + container.scrollTop;
      isMarquee = false;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - rect.left + container.scrollLeft;
        const dy = ev.clientY - rect.top + container.scrollTop;
        if (!isMarquee && (Math.abs(dx - startX) > 5 || Math.abs(dy - startY) > 5)) {
          isMarquee = true;
        }
        if (isMarquee) {
          setMarquee({ startX, startY, currentX: dx, currentY: dy });
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (isMarquee && marqueeRef.current) {
          const m = marqueeRef.current;
          const boxTop = Math.min(m.startY, m.currentY);
          const boxBottom = Math.max(m.startY, m.currentY);

          const containerRect = container.getBoundingClientRect();
          const hitIds: string[] = [];
          rowRefsMap.current.forEach((rowEl, id) => {
            const rowRect = rowEl.getBoundingClientRect();
            const rowTop = rowRect.top - containerRect.top + container.scrollTop;
            const rowBottom = rowTop + rowRect.height;
            if (rowBottom >= boxTop && rowTop <= boxBottom) {
              hitIds.push(id);
            }
          });

          if (hitIds.length > 0) {
            rowSelection.setSelectedIds(new Set(hitIds));
          }
        }
        setMarquee(null);
        isMarquee = false;
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    container.addEventListener("mousedown", onMouseDown);
    return () => container.removeEventListener("mousedown", onMouseDown);
  }, [rowSelection]);

  const handleCreateInvoice = useCallback(async () => {
    if (isAdmin) {
      setSelectedTranslator("");
      setShowTranslatorPicker(true);
    } else {
      const name = profile?.display_name || profile?.email || "";
      const inv = await invoiceStore.createInvoice(name, []);
      if (inv) {
        toast.success("已建立請款單");
        navigate(`/invoices/${inv.id}`);
      }
    }
  }, [isAdmin, profile, navigate]);

  const handleConfirmTranslator = useCallback(async () => {
    if (!selectedTranslator) return;
    const inv = await invoiceStore.createInvoice(selectedTranslator, []);
    setShowTranslatorPicker(false);
    if (inv) {
      toast.success("已建立請款單");
      navigate(`/invoices/${inv.id}`);
    }
  }, [selectedTranslator, navigate]);

  // Check if selected items contain any paid invoices
  const selectedInvoices = invoices.filter((inv) => rowSelection.selectedIds.has(inv.id));
  const hasPaidInvoices = selectedInvoices.some((inv) => inv.status === "paid");

  const handleDeleteClick = useCallback(() => {
    if (hasPaidInvoices) {
      if (!isExecutive) {
        toast.error("只有執行官可以刪除已付款的請款單");
        return;
      }
      // Executive needs password confirmation
      setPassword("");
      setPasswordError("");
      setShowPasswordConfirm(true);
    } else {
      setShowDeleteConfirm(true);
    }
  }, [hasPaidInvoices, isExecutive]);

  const doDelete = useCallback(() => {
    const ids = Array.from(rowSelection.selectedIds);
    for (const id of ids) {
      invoiceStore.deleteInvoice(id);
    }
    rowSelection.deselectAll();
    toast.success(`已刪除 ${ids.length} 筆請款單`);
  }, [rowSelection]);

  const handleDeleteConfirm = useCallback(() => {
    doDelete();
    setShowDeleteConfirm(false);
  }, [doDelete]);

  const handlePasswordConfirm = useCallback(async () => {
    if (!password || !user?.email) return;
    setVerifying(true);
    setPasswordError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    setVerifying(false);

    if (error) {
      setPasswordError("密碼錯誤，請重新輸入");
      return;
    }

    setShowPasswordConfirm(false);
    doDelete();
  }, [password, user, doDelete]);

  const getInvoiceTotal = (feeIds: string[]) => {
    return feeIds.reduce((sum, fid) => {
      const fee = fees.find((f) => f.id === fid);
      if (!fee) return sum;
      return sum + fee.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
    }, 0);
  };

  // Can delete: admin can delete non-paid; executive can delete all (with password for paid)
  const canDelete = isAdmin && rowSelection.selectedCount > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">請款單管理</h1>
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleCreateInvoice}>
          <Plus className="h-4 w-4" />
          新增請款單
        </Button>
        {canDelete && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={handleDeleteClick}
              title="刪除選取項目"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </Button>
            <Badge variant="default" className="h-6 text-xs">
              已選取 {rowSelection.selectedCount} 個項目
            </Badge>
          </>
        )}
      </div>

      <motion.div
        ref={tableContainerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card overflow-x-auto relative select-none"
        style={{ userSelect: marquee ? "none" : undefined }}
      >
        {/* Marquee overlay */}
        {marquee && (
          <div
            className="absolute border border-primary/50 bg-primary/10 pointer-events-none z-20"
            style={{
              left: Math.min(marquee.startX, marquee.currentX),
              top: Math.min(marquee.startY, marquee.currentY),
              width: Math.abs(marquee.currentX - marquee.startX),
              height: Math.abs(marquee.currentY - marquee.startY),
            }}
          />
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-[40px] px-2 py-2.5 text-center">
                <Checkbox
                  checked={rowSelection.isAllSelected}
                  onCheckedChange={(checked) => {
                    if (checked) rowSelection.selectAll();
                    else rowSelection.deselectAll();
                  }}
                  className="mx-auto"
                />
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[200px]">標題</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[150px]">譯者</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[100px]">狀態</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[80px]">費用數</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[120px]">總金額</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground w-[120px]">建立時間</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">備註</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const opt = assigneeOptions.find((o) => o.label === inv.translator);
              const total = getInvoiceTotal(inv.feeIds);
              const isSelected = rowSelection.selectedIds.has(inv.id);
              return (
                <tr
                  key={inv.id}
                  ref={(el) => registerRowRef(inv.id, el)}
                  className={cn(
                    "border-b border-border transition-colors group cursor-pointer",
                    isSelected ? "bg-primary/5" : "hover:bg-secondary/50"
                  )}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                >
                  <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => {}}
                      onClick={(e) => rowSelection.handleClick(inv.id, e as unknown as React.MouseEvent)}
                      className="mx-auto"
                    />
                  </td>
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
                </tr>
              );
            })}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  尚無請款單
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Normal delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              {rowSelection.selectedCount > 1
                ? `即將刪除 ${rowSelection.selectedCount} 筆請款單，此操作無法復原。是否確定？`
                : "即將刪除選取的請款單，此操作無法復原。是否確定？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password confirmation for deleting paid invoices (executive only) */}
      <Dialog open={showPasswordConfirm} onOpenChange={(open) => { if (!open) setShowPasswordConfirm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>刪除已付款請款單</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              選取的項目中包含已付款的請款單，刪除後無法復原。請輸入您的帳號密碼以確認操作。
            </p>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">密碼</Label>
              <Input
                id="confirm-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePasswordConfirm(); }}
                placeholder="請輸入密碼…"
              />
              {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordConfirm(false)}>取消</Button>
            <Button
              variant="destructive"
              disabled={!password || verifying}
              onClick={handlePasswordConfirm}
            >
              {verifying ? "驗證中…" : "確認刪除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Translator picker for admin creation */}
      <Dialog open={showTranslatorPicker} onOpenChange={setShowTranslatorPicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>請指定譯者</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedTranslator} onValueChange={setSelectedTranslator}>
              <SelectTrigger>
                <SelectValue placeholder="選擇譯者…" />
              </SelectTrigger>
              <SelectContent>
                {assigneeOptions.map((opt) => (
                  <SelectItem key={opt.label} value={opt.label}>
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTranslatorPicker(false)}>取消</Button>
            <Button disabled={!selectedTranslator} onClick={handleConfirmTranslator}>建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
