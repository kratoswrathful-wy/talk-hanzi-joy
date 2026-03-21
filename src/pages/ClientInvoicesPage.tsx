import { useNavigate } from "react-router-dom";
import { useCurrencies } from "@/stores/currency-store";
import { TableFooterStats, type NumericColumnConfig } from "@/components/TableFooterStats";
import { Plus, ExternalLink, Trash2, GripVertical } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useClientInvoices, clientInvoiceStore } from "@/hooks/use-client-invoice-store";
import { useFees } from "@/hooks/use-fee-store";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useSelectOptions, getStatusLabelStyle } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { type ClientInvoiceStatus, clientInvoiceStatusLabels } from "@/data/client-invoice-types";
import { type ClientInvoice } from "@/data/client-invoice-types";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useClientInvoiceTableViews, clientInvoiceFieldMetas } from "@/hooks/use-client-invoice-table-views";
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
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToolbarButtonUiProps } from "@/stores/ui-button-style-store";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function StatusBadge({ status }: { status: ClientInvoiceStatus }) {
  useSelectOptions("statusLabel");
  const labelMap: Record<string, string> = { pending: "待收款", partial_collected: "部份收款", collected: "收款完畢" };
  const label = labelMap[status] || status;
  const colors = getStatusLabelStyle(label);
  return (
    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
      <span className="cursor-default">
        <Badge
          variant="default"
          className="text-xs whitespace-nowrap border"
          style={{ backgroundColor: colors.bgColor, color: colors.textColor, borderColor: colors.bgColor }}
        >
          {clientInvoiceStatusLabels[status]}
        </Badge>
      </span>
    </TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>
  );
}

import { formatDateTz as formatDate } from "@/lib/format-timestamp";
import { selectOptionsStore } from "@/stores/select-options-store";
import { currencyStore } from "@/stores/currency-store";

const formatCurrency = (n: number, code = "TWD") =>
  `${code} ${n.toLocaleString("zh-TW", { minimumFractionDigits: 0 })}`;

/** Compute a single fee's revenue in its original client currency */
function getFeeRevenueTwd(fee: any): number {
  const ci = fee.clientInfo as any;
  if (!ci?.clientTaskItems) return 0;
  if (ci.notFirstFee) return 0;
  const amount = ci.clientTaskItems.reduce(
    (s: number, i: any) => s + Number(i.unitCount || 0) * Number(i.clientPrice || 0), 0
  );
  const clientOpts = selectOptionsStore.getSortedOptions("client");
  const clientOpt = clientOpts.find((o: any) => o.label === ci.client);
  const cur = clientOpt?.currency || "TWD";
  const rate = currencyStore.getTwdRate(cur);
  return amount * rate;
}
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

interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  render: (inv: ClientInvoice, feeTotal: number) => React.ReactNode;
}

export default function ClientInvoicesPage() {
  const navigate = useNavigate();
  const { isAdmin, user, roles } = useAuth();
  const isExecutive = roles.some((r) => r.role === "executive");
  const { checkPerm } = usePermissions();
  const allInvoices = useClientInvoices();
  const { getTwdRate } = useCurrencies();
  const fees = useFees();
  const { options: clientOptions } = useSelectOptions("client");

  const getInvoiceTotal = useCallback((feeIds: string[]) => {
    return feeIds.reduce((sum, fid) => {
      const fee = fees.find((f) => f.id === fid);
      if (!fee) return sum;
      return sum + getFeeRevenueTwd(fee);
    }, 0);
  }, [fees]);

  const tableViews = useClientInvoiceTableViews(user?.id);
  const { activeView } = tableViews;
  const visibleFieldKeys = clientInvoiceFieldMetas.map((f) => f.key);
  const permittedFieldKeys = useMemo(() =>
    clientInvoiceFieldMetas.filter((f) => checkPerm("client_invoices", `table_field_${f.key}`, "view")).map((f) => f.key),
    [checkPerm]
  );
  const uiClientInvoicesAdd = useToolbarButtonUiProps("client_invoices_add");

  const visibleInvoices = tableViews.applyFiltersAndSorts(allInvoices, getInvoiceTotal);

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
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(`/client-invoices/${inv.id}`); }}
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
      key: "invoiceNumber",
      label: "請款單編號",
      minWidth: 100,
      render: (inv) => (
        <span className="text-sm truncate">{inv.invoiceNumber || "—"}</span>
      ),
    },
    {
      key: "client",
      label: "客戶",
      minWidth: 100,
      render: (inv) => (
        <span className="text-sm truncate">{inv.client || <span className="text-muted-foreground italic">未指定</span>}</span>
      ),
    },
    {
      key: "status",
      label: "狀態",
      minWidth: 80,
      render: (inv) => <StatusBadge status={inv.status} />,
    },
    {
      key: "billingChannel",
      label: "請款管道",
      minWidth: 80,
      render: (inv) => (
        <span className="text-sm truncate">{inv.billingChannel || "—"}</span>
      ),
    },
    {
      key: "isRecordOnly",
      label: "純請款紀錄",
      minWidth: 80,
      render: (inv) => (
        <span className="text-sm">{inv.isRecordOnly ? "是" : "否"}</span>
      ),
    },
    {
      key: "feeCount",
      label: "費用數",
      minWidth: 60,
      render: (inv) => <span className="text-sm tabular-nums">{inv.feeIds.length}</span>,
    },
    {
      key: "totalAmount",
      label: "應收總額",
      minWidth: 80,
      render: (inv, total) => {
        const rawAmount = inv.isRecordOnly ? (inv.recordAmount || 0) : total;
        const cur = inv.isRecordOnly ? (inv.recordCurrency || "TWD") : "TWD";
        const twdAmount = cur !== "TWD" ? rawAmount * getTwdRate(cur) : rawAmount;
        const displayText = formatCurrency(Math.round(twdAmount), "TWD");
        const tooltipText = inv.isRecordOnly && cur !== "TWD" ? `原幣值 ${formatCurrency(rawAmount, cur)}（匯率 1 ${cur} = ${getTwdRate(cur)} TWD）` : "自動計算";
        return <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><span className="text-sm tabular-nums cursor-default">{displayText}</span></TooltipTrigger><TooltipContent className="text-xs">{tooltipText}</TooltipContent></Tooltip></TooltipProvider>;
      },
    },
    {
      key: "recordCurrency",
      label: "幣別",
      minWidth: 60,
      render: (inv) => (
        <span className="text-sm">{inv.isRecordOnly ? (inv.recordCurrency || "TWD") : "—"}</span>
      ),
    },
    {
      key: "serviceFee",
      label: "手續費",
      minWidth: 80,
      render: (inv, total) => {
        const t = inv.isRecordOnly ? (inv.recordAmount || 0) : total;
        const paid = inv.payments.reduce((s: number, p: any) => s + (p.type === "full" ? (p.noFee ? t : (p.amount || 0)) : (p.amount || 0)), 0);
        const fee = inv.status === "collected" && paid < t ? t - paid : 0;
        return <span className={cn("text-sm tabular-nums", fee > 0 && "text-destructive")}>{fee > 0 ? formatCurrency(fee) : "—"}</span>;
      },
    },
    {
      key: "expectedCollectionDate",
      label: "預計收款時間",
      minWidth: 110,
      render: (inv) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {inv.expectedCollectionDate ? formatDate(inv.expectedCollectionDate) : "—"}
        </span>
      ),
    },
    {
      key: "actualCollectionDate",
      label: "實際收款時間",
      minWidth: 110,
      render: (inv) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {inv.actualCollectionDate ? formatDate(inv.actualCollectionDate) : "—"}
        </span>
      ),
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
      label: "客戶請款備註",
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

  const hiddenSet = new Set(activeView.hiddenColumns || []);
  const orderedCols = activeView.columnOrder
    .map((key) => allColumnDefs.find((c) => c.key === key))
    .filter((c): c is ColumnDef => !!c && !hiddenSet.has(c.key));

  for (const col of allColumnDefs) {
    if (!activeView.columnOrder.includes(col.key) && !hiddenSet.has(col.key)) {
      orderedCols.push(col);
    }
  }

  const totalWidth = orderedCols.reduce((s, c) => s + (activeView.columnWidths[c.key] ?? 100), 0) + 60;

  // Client name input for creation
  const [showClientInput, setShowClientInput] = useState(false);
  const [newClientName, setNewClientName] = useState("");

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);

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

  const handleCreateInvoice = useCallback(() => {
    setNewClientName("");
    setShowClientInput(true);
  }, []);

  const handleConfirmCreate = useCallback(async () => {
    if (!newClientName.trim()) return;
    const inv = await clientInvoiceStore.createInvoice(newClientName.trim(), []);
    setShowClientInput(false);
    if (inv) {
      toast.success("已建立客戶請款單");
      navigate(`/client-invoices/${inv.id}`, { state: { autoFocusTitle: true } });
    }
  }, [newClientName, navigate]);

  const selectedInvoices = visibleInvoices.filter((inv) => rowSelection.selectedIds.has(inv.id));
  const hasPaidInvoices = selectedInvoices.some((inv) => inv.status === "collected");

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
      clientInvoiceStore.deleteInvoice(id);
    }
    rowSelection.deselectAll();
    toast.success(`已刪除 ${ids.length} 筆客戶請款單`);
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

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        您沒有權限檢視此頁面
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">客戶請款</h1>
        </div>
        {isAdmin && (
          <Button size="sm" className={uiClientInvoicesAdd.className} style={uiClientInvoicesAdd.style} onClick={handleCreateInvoice}>
            <Plus className="h-4 w-4" />
            新增客戶請款單
          </Button>
        )}
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

      <FilterSortToolbar
        views={tableViews.views}
        activeView={activeView}
        activeViewId={tableViews.activeViewId}
        onSetActiveView={tableViews.setActiveViewId}
        onAddView={tableViews.addView}
        onDeleteView={tableViews.deleteView}
        onAddCondition={tableViews.addCondition}
        onRemoveFilterNode={tableViews.removeFilterNode}
        onUpdateCondition={tableViews.updateCondition}
        onAddFilterGroup={tableViews.addFilterGroup}
        onChangeGroupLogic={tableViews.changeGroupLogic}
        onAddSort={tableViews.addSort}
        onRemoveSort={tableViews.removeSort}
        onUpdateSort={tableViews.updateSort}
        onRenameView={tableViews.renameView}
        onReorderViews={tableViews.reorderViews}
        visibleFieldKeys={visibleFieldKeys}
        permittedFieldKeys={permittedFieldKeys}
        selectedCount={rowSelection.selectedCount}
        hiddenColumns={activeView.hiddenColumns || []}
        onToggleColumn={tableViews.toggleColumnVisibility}
        fieldMetasList={clientInvoiceFieldMetas}
        statusOptionsList={[
          { value: "pending", label: "待收款" },
          { value: "partial_collected", label: "部份收款" },
          { value: "collected", label: "收款完畢" },
        ]}
        selectedIds={[...rowSelection.selectedIds]}
        onPinTop={tableViews.pinTop}
        onPinBottom={tableViews.pinBottom}
        onUnpinItem={tableViews.unpinItem}
        pinnedTop={activeView.pinnedTop || []}
        pinnedBottom={activeView.pinnedBottom || []}
      />

      <motion.div
        ref={tableContainerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card overflow-x-auto relative select-none"
        style={{ userSelect: marquee ? "none" : undefined }}
      >
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
                  onClick={() => navigate(`/client-invoices/${inv.id}`)}
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
                  尚無客戶請款單
                </td>
              </tr>
            )}
          </tbody>
          <TableFooterStats
            itemCount={visibleInvoices.length}
            orderedCols={orderedCols}
            columnWidths={activeView.columnWidths}
            numericColumns={[
              { key: "feeCount", getValue: (inv: ClientInvoice) => inv.feeIds.length, isCurrency: false },
              { key: "totalAmount", getValue: (inv: ClientInvoice) => {
                const rawAmount = inv.isRecordOnly ? (inv.recordAmount || 0) : getInvoiceTotal(inv.feeIds);
                const cur = inv.isRecordOnly ? (inv.recordCurrency || "TWD") : "TWD";
                return cur !== "TWD" ? rawAmount * getTwdRate(cur) : rawAmount;
              }},
              { key: "serviceFee", getValue: (inv: ClientInvoice) => {
                const rawAmount = inv.isRecordOnly ? (inv.recordAmount || 0) : getInvoiceTotal(inv.feeIds);
                const cur = inv.isRecordOnly ? (inv.recordCurrency || "TWD") : "TWD";
                const t = cur !== "TWD" ? rawAmount * getTwdRate(cur) : rawAmount;
                const paid = inv.payments.reduce((s: number, p: any) => s + (p.type === "full" ? ((p as any).noFee ? t : (p.amount || 0)) : (p.amount || 0)), 0);
                return inv.status === "collected" && paid < t ? t - paid : 0;
              }},
            ]}
            data={visibleInvoices}
          />
        </table>
      </motion.div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              {rowSelection.selectedCount > 1
                ? `即將刪除 ${rowSelection.selectedCount} 筆客戶請款單，此操作無法復原。是否確定？`
                : "即將刪除選取的客戶請款單，此操作無法復原。是否確定？"}
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

      {/* Password confirmation for paid invoices */}
      <Dialog open={showPasswordConfirm} onOpenChange={(open) => { if (!open) setShowPasswordConfirm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>刪除已付款客戶請款單</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              選取的項目中包含已收款完畢的客戶請款單，刪除後無法復原。請輸入您的帳號密碼以確定操作。
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
              {verifying ? "驗證中…" : "確定刪除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client selection for creation */}
      <Dialog open={showClientInput} onOpenChange={setShowClientInput}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>選擇客戶</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label>客戶</Label>
            <Select value={newClientName} onValueChange={setNewClientName}>
              <SelectTrigger>
                <SelectValue placeholder="選擇客戶…" />
              </SelectTrigger>
              <SelectContent>
                {clientOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.label}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClientInput(false)}>取消</Button>
            <Button disabled={!newClientName.trim()} onClick={handleConfirmCreate}>建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
