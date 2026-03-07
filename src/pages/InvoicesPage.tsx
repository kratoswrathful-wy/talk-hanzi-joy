import { useNavigate } from "react-router-dom";
import { Plus, ExternalLink, Trash2, GripVertical } from "lucide-react";
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
import { type Invoice } from "@/data/invoice-types";
import { useState, useCallback, useRef, useEffect } from "react";
import { useInvoiceTableViews, invoiceFieldMetas } from "@/hooks/use-invoice-table-views";
import { FilterSortToolbar } from "@/components/fees/FilterSortToolbar";
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

// Cache for creator UUID → display name
const creatorNameCache = new Map<string, string>();

function CreatorName({ uid }: { uid: string }) {
  const [name, setName] = useState(creatorNameCache.get(uid) || uid);
  useEffect(() => {
    if (!uid || uid.length !== 36) return;
    if (creatorNameCache.has(uid)) { setName(creatorNameCache.get(uid)!); return; }
    supabase.from("profiles").select("display_name, email").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        const resolved = data?.display_name || data?.email || uid;
        creatorNameCache.set(uid, resolved);
        setName(resolved);
      });
  }, [uid]);
  return <span className="truncate text-sm">{name}</span>;
}

function AssigneeLabel({ value }: { value: string }) {
  const { options } = useSelectOptions("assignee");
  const opt = options.find((o) => o.label === value);
  if (!value) return <span className="truncate text-sm text-muted-foreground italic">未指定</span>;
  return <AssigneeTag label={value} avatarUrl={opt?.avatarUrl} />;
}

interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  render: (inv: Invoice, feeTotal: number) => React.ReactNode;
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { isAdmin, profile, user, roles } = useAuth();
  const isExecutive = roles.some((r) => r.role === "executive");
  const allInvoices = useInvoices();
  const invoices = isAdmin ? allInvoices : allInvoices.filter(
    (inv) => inv.translator === profile?.display_name
  );
  const fees = useFees();
  const { options: assigneeOptions } = useSelectOptions("assignee");

  useEffect(() => {
    selectOptionsStore.loadAssignees();
  }, []);

  const getInvoiceTotal = useCallback((feeIds: string[]) => {
    return feeIds.reduce((sum, fid) => {
      const fee = fees.find((f) => f.id === fid);
      if (!fee) return sum;
      return sum + fee.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
    }, 0);
  }, [fees]);

  // Table views
  const tableViews = useInvoiceTableViews(isAdmin ? "pm" : "assignee");
  const { activeView } = tableViews;
  const visibleFieldKeys = invoiceFieldMetas.map((f) => f.key);

  // Apply filters and sorts
  const visibleInvoices = tableViews.applyFiltersAndSorts(invoices, getInvoiceTotal);

  // Column definitions
  const allColumnDefs: ColumnDef[] = [
    {
      key: "title",
      label: "標題",
      minWidth: 120,
      render: (inv) => (
        <div className="relative flex items-center group/title">
          <span className="text-sm font-medium truncate flex-1 min-w-0 pr-6">
            {inv.title || <span className="text-muted-foreground italic">未命名</span>}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(`/invoices/${inv.id}`); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover/title:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
            title="開啟"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      ),
    },
    {
      key: "translator",
      label: "譯者",
      minWidth: 100,
      render: (inv) => <AssigneeLabel value={inv.translator} />,
    },
    {
      key: "status",
      label: "狀態",
      minWidth: 80,
      render: (inv) => <InvoiceStatusBadge status={inv.status} />,
    },
    {
      key: "feeCount",
      label: "費用數",
      minWidth: 60,
      render: (inv) => <span className="text-sm tabular-nums">{inv.feeIds.length}</span>,
    },
    {
      key: "totalAmount",
      label: "總金額",
      minWidth: 80,
      render: (_inv, total) => <span className="text-sm tabular-nums">{formatCurrency(total)}</span>,
    },
    {
      key: "transferDate",
      label: "匯款日期",
      minWidth: 90,
      render: (inv) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {inv.transferDate ? formatDate(inv.transferDate) : "—"}
        </span>
      ),
    },
    {
      key: "note",
      label: "備註",
      minWidth: 100,
      render: (inv) => (
        <span className="text-sm text-muted-foreground truncate">{inv.note || "—"}</span>
      ),
    },
    {
      key: "createdBy",
      label: "建立者",
      minWidth: 60,
      render: (inv) => <CreatorName uid={inv.createdBy} />,
    },
    {
      key: "createdAt",
      label: "建立時間",
      minWidth: 90,
      render: (inv) => (
        <span className="text-sm text-muted-foreground tabular-nums">{formatDate(inv.createdAt)}</span>
      ),
    },
  ];

  // Apply column order & visibility
  const hiddenSet = new Set(activeView.hiddenColumns || []);
  const orderedCols = activeView.columnOrder
    .map((key) => allColumnDefs.find((c) => c.key === key))
    .filter((c): c is ColumnDef => !!c && !hiddenSet.has(c.key));

  // Add any columns not in order yet (new columns)
  for (const col of allColumnDefs) {
    if (!activeView.columnOrder.includes(col.key) && !hiddenSet.has(col.key)) {
      orderedCols.push(col);
    }
  }

  const totalWidth = orderedCols.reduce((s, c) => s + (activeView.columnWidths[c.key] ?? 100), 0) + 60;

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
  const rowSelection = useRowSelection(visibleInvoices.map((inv) => inv.id));

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

  // Column resize
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = activeView.columnWidths[key] ?? 100;
    const col = allColumnDefs.find((c) => c.key === key);
    resizingRef.current = { key, startX: e.clientX, startWidth };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const minW = col?.minWidth ?? 60;
      const newW = Math.max(minW, resizingRef.current.startWidth + delta);
      tableViews.setColumnWidth(resizingRef.current.key, newW);
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [activeView.columnWidths, tableViews]);

  // Column drag reorder
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    dragColRef.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (dragColRef.current && dragColRef.current !== key) setDragOverCol(key);
  };
  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const sourceKey = dragColRef.current;
    if (!sourceKey || sourceKey === targetKey) return;
    const next = [...activeView.columnOrder];
    const srcIdx = next.indexOf(sourceKey);
    const tgtIdx = next.indexOf(targetKey);
    next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, sourceKey);
    tableViews.setColumnOrder(next);
    dragColRef.current = null;
    setDragOverCol(null);
  };
  const handleDragEnd = () => { dragColRef.current = null; setDragOverCol(null); };

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
  const selectedInvoices = visibleInvoices.filter((inv) => rowSelection.selectedIds.has(inv.id));
  const hasPaidInvoices = selectedInvoices.some((inv) => inv.status === "paid");

  const handleDeleteClick = useCallback(() => {
    if (hasPaidInvoices) {
      if (!isExecutive) {
        toast.error("這份請款單已經付款完畢，如欲刪除請洽團隊管理人員。");
        return;
      }
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

  const canDelete = rowSelection.selectedCount > 0;

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
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            onClick={handleDeleteClick}
            title="刪除選取項目"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </Button>
        )}
      </div>

      {/* Filter/Sort/View toolbar */}
      <FilterSortToolbar
        views={tableViews.views}
        activeView={activeView}
        activeViewId={tableViews.activeViewId}
        onSetActiveView={tableViews.setActiveViewId}
        onAddView={tableViews.addView}
        onDeleteView={tableViews.deleteView}
        onAddFilter={tableViews.addFilter}
        onRemoveFilter={tableViews.removeFilter}
        onUpdateFilter={tableViews.updateFilter}
        onAddSort={tableViews.addSort}
        onRemoveSort={tableViews.removeSort}
        onUpdateSort={tableViews.updateSort}
        onRenameView={tableViews.renameView}
        onReorderViews={tableViews.reorderViews}
        visibleFieldKeys={visibleFieldKeys}
        selectedCount={rowSelection.selectedCount}
        hiddenColumns={activeView.hiddenColumns || []}
        onToggleColumn={tableViews.toggleColumnVisibility}
        fieldMetasList={invoiceFieldMetas}
        statusOptionsList={[
          { value: "pending", label: "待付款" },
          { value: "partial", label: "部份付款" },
          { value: "paid", label: "已付款" },
        ]}
      />

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
        <table style={{ minWidth: totalWidth }} className="w-full text-sm">
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
              {orderedCols.map((col) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={(e) => handleDragStart(e, col.key)}
                  onDragOver={(e) => handleDragOver(e, col.key)}
                  onDrop={(e) => handleDrop(e, col.key)}
                  onDragEnd={handleDragEnd}
                  style={{ width: activeView.columnWidths[col.key] ?? 100 }}
                  className={cn(
                    "relative select-none px-3 py-2.5 text-center text-xs font-medium text-muted-foreground whitespace-nowrap group border-r border-border/40 last:border-r-0",
                    dragOverCol === col.key && "bg-primary/10"
                  )}
                >
                  <div className="flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 shrink-0" />
                    <span>{col.label}</span>
                  </div>
                  <div
                    onMouseDown={(e) => handleResizeStart(e, col.key)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-border/50 hover:bg-primary/40 transition-colors"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleInvoices.map((inv) => {
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
                  {orderedCols.map((col) => (
                    <td
                      key={col.key}
                      style={{ width: activeView.columnWidths[col.key] ?? 100, maxWidth: activeView.columnWidths[col.key] ?? 100 }}
                      className={cn(
                        "px-3 py-3 overflow-hidden border-r border-border/40 last:border-r-0",
                        col.key !== "title" && col.key !== "note" && "text-center"
                      )}
                    >
                      {col.render(inv, total)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visibleInvoices.length === 0 && (
              <tr>
                <td colSpan={orderedCols.length + 1} className="text-center py-12 text-muted-foreground">
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
                {selectedTranslator ? (
                  <AssigneeLabel value={selectedTranslator} />
                ) : (
                  <SelectValue placeholder="選擇譯者…" />
                )}
              </SelectTrigger>
              <SelectContent>
                {assigneeOptions.map((opt) => (
                  <SelectItem key={opt.label} value={opt.label}>
                    <AssigneeTag label={opt.label} avatarUrl={opt.avatarUrl} />
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
