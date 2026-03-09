import { useNavigate, Link } from "react-router-dom";
import { TableFooterStats, type NumericColumnConfig } from "@/components/TableFooterStats";
import { Plus, ChevronDown, MessageSquare, History, GripVertical, ExternalLink, Trash2, FileText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { motion, AnimatePresence } from "framer-motion";
import { type TranslatorFee, type FeeStatus } from "@/data/fee-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useFees, feeStore } from "@/hooks/use-fee-store";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useTableViews, fieldMetas } from "@/hooks/use-table-views";
import { FilterSortToolbar } from "@/components/fees/FilterSortToolbar";
import { InlineEditCell } from "@/components/fees/InlineEditCell";
import { useUndoRedo, type UndoEntry } from "@/hooks/use-undo-redo";
import { useLabelStyles } from "@/stores/label-style-store";
import { InvoiceActions } from "@/components/InvoiceActions";
import { ClientInvoiceActions } from "@/components/ClientInvoiceActions";
import { useInvoices } from "@/hooks/use-invoice-store";
import { useClientInvoices } from "@/hooks/use-client-invoice-store";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useSelectOptions, selectOptionsStore } from "@/stores/select-options-store";
import AssigneeTag from "@/components/AssigneeTag";
import { supabase } from "@/integrations/supabase/client";
import { getFieldLock, getMultiSelectFieldLock, type FeeFieldLockContext } from "@/lib/fee-field-locks";

const feeStatusLabels: Record<FeeStatus, string> = {
  draft: "草稿",
  finalized: "開立完成",
};

type UserRole = "assignee" | "pm" | "executive";
const roleLabels: Record<UserRole, string> = {
  assignee: "譯者",
  pm: "PM",
  executive: "執行官",
};

const managerOnlyFields = new Set([
  "client", "contact", "clientCaseId", "clientPoNumber", "hdPath",
  "reconciled", "rateConfirmed", "invoiced", "sameCase", "dispatchRoute",
  "clientRevenue", "profit", "internalNote",
]);

const clientInfoLogKeywords = [
  "客戶", "聯絡人", "案號", "PO", "硬碟", "對帳", "費率", "請款",
  "同一案件", "主要營收", "營收", "利潤", "客戶端",
];

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

// Editable fields - computed/date/createdBy are not editable
const editableFields = new Set([
  "title", "status", "assignee", "internalNote",
  "client", "contact", "clientCaseId", "clientPoNumber", "dispatchRoute",
  "reconciled", "rateConfirmed", "invoiced", "sameCase",
]);

function getEditType(key: string): "text" | "select" | "checkbox" | "colorSelect" {
  if (key === "status" || key === "dispatchRoute") return "select";
  if (["assignee", "client"].includes(key)) return "colorSelect";
  if (["reconciled", "rateConfirmed", "invoiced", "sameCase"].includes(key)) return "checkbox";
  return "text";
}

function getSelectOptions(key: string): { value: string; label: string }[] {
  if (key === "status") return [
    { value: "draft", label: "草稿" },
    { value: "finalized", label: "開立完成" },
  ];
  return [];
}

/** Map field keys to their selectOptionsStore keys for colorSelect fields */
function getColorSelectFieldKey(key: string): string | undefined {
  if (key === "assignee") return "assignee";
  if (key === "client") return "client";
  if (key === "dispatchRoute") return "dispatchRoute";
  return undefined;
}

interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  managerOnly?: boolean;
  render: (fee: TranslatorFee, opts: { isManager: boolean; editable: boolean; lockedTooltip?: string; onCommit: (field: string, value: string | boolean | string[]) => void }) => React.ReactNode;
}

const allColumnDefs: ColumnDef[] = [
  {
    key: "title",
    label: "標題",
    minWidth: 120,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <div className="relative flex items-center group/title">
        <InlineEditCell value={f.title} type="text" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("title", v)} className="flex-1 min-w-0 pr-6">
          <span className="truncate font-medium text-card-foreground">
            {f.title || <span className="text-muted-foreground italic">未命名稿費單</span>}
          </span>
        </InlineEditCell>
        <OpenButton feeId={f.id} />
      </div>
    ),
  },
  {
    key: "status",
    label: "狀態",
    minWidth: 70,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.status} type="select" options={getSelectOptions("status")} editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("status", v)}>
        <FeeStatusBadge status={f.status} />
      </InlineEditCell>
    ),
  },
  {
    key: "assignee",
    label: "譯者",
    minWidth: 70,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.assignee} type="colorSelect" fieldKey="assignee" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("assignee", v)}>
        <AssigneeLabel value={f.assignee} />
      </InlineEditCell>
    ),
  },
  {
    key: "internalNote",
    label: "關聯案件",
    minWidth: 100,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.internalNote} type="text" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("internalNote", v)}>
        <span className="truncate text-sm text-muted-foreground">{f.internalNote || "—"}</span>
      </InlineEditCell>
    ),
  },
  {
    key: "taskSummary",
    label: "稿費總額",
    minWidth: 80,
    render: (f) => {
      const total = f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
      return (
        <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
          <span className="text-sm tabular-nums cursor-default">{formatCurrency(total)}</span>
        </TooltipTrigger><TooltipContent className="text-xs">自動計算</TooltipContent></Tooltip></TooltipProvider>
      );
    },
  },
  {
    key: "client",
    label: "客戶",
    minWidth: 70,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.clientInfo?.client || ""} type="colorSelect" fieldKey="client" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("client", v)}>
        <ClientLabel value={f.clientInfo?.client || ""} />
      </InlineEditCell>
    ),
  },
  {
    key: "contact",
    label: "聯絡人",
    minWidth: 70,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.clientInfo?.contact || ""} type="text" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("contact", v)}>
        <span className="truncate text-sm text-muted-foreground">{f.clientInfo?.contact || "—"}</span>
      </InlineEditCell>
    ),
  },
  {
    key: "clientCaseId",
    label: "關鍵字",
    minWidth: 80,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.clientInfo?.clientCaseId || ""} type="text" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("clientCaseId", v)}>
        <span className="truncate text-sm text-muted-foreground">{f.clientInfo?.clientCaseId || f.clientInfo?.eciKeywords || "—"}</span>
      </InlineEditCell>
    ),
  },
  {
    key: "clientPoNumber",
    label: "客戶 PO#",
    minWidth: 80,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.clientInfo?.clientPoNumber || ""} type="text" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("clientPoNumber", v)}>
        <span className="truncate text-sm text-muted-foreground">{f.clientInfo?.clientPoNumber || "—"}</span>
      </InlineEditCell>
    ),
  },
  {
    key: "dispatchRoute",
    label: "派案途徑",
    minWidth: 80,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={f.clientInfo?.dispatchRoute || ""} type="colorSelect" fieldKey="dispatchRoute" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("dispatchRoute", v)}>
        <DispatchRouteLabel value={f.clientInfo?.dispatchRoute || ""} />
      </InlineEditCell>
    ),
  },
  {
    key: "clientRevenue",
    label: "營收總額",
    minWidth: 80,
    managerOnly: true,
    render: (f) => {
      if (!f.clientInfo || f.clientInfo.notFirstFee) return <span className="text-sm text-muted-foreground">N/A</span>;
      const rev = f.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
      return (
        <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
          <span className="text-sm tabular-nums cursor-default">{formatCurrency(rev)}</span>
        </TooltipTrigger><TooltipContent className="text-xs">自動計算</TooltipContent></Tooltip></TooltipProvider>
      );
    },
  },
  {
    key: "profit",
    label: "利潤",
    minWidth: 80,
    managerOnly: true,
    render: (f) => {
      if (!f.clientInfo || f.clientInfo.notFirstFee) return <span className="text-sm text-muted-foreground">N/A</span>;
      const rev = f.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
      const cost = f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
      const p = rev - cost;
      return (
        <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
          <span className={cn("text-sm tabular-nums font-medium cursor-default", p >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(p)}</span>
        </TooltipTrigger><TooltipContent className="text-xs">自動計算</TooltipContent></Tooltip></TooltipProvider>
      );
    },
  },
  {
    key: "reconciled",
    label: "對帳完成",
    minWidth: 50,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={!!f.clientInfo?.reconciled} type="checkbox" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("reconciled", v)}>
        <div className="flex justify-center">
          <Checkbox checked={!!f.clientInfo?.reconciled} disabled className="pointer-events-none" />
        </div>
      </InlineEditCell>
    ),
  },
  {
    key: "rateConfirmed",
    label: "費率無誤",
    minWidth: 50,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={!!f.clientInfo?.rateConfirmed} type="checkbox" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("rateConfirmed", v)}>
        <div className="flex justify-center">
          <Checkbox checked={!!f.clientInfo?.rateConfirmed} disabled className="pointer-events-none" />
        </div>
      </InlineEditCell>
    ),
  },
  {
    key: "invoiced",
    label: "請款完成",
    minWidth: 50,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={!!f.clientInfo?.invoiced} type="checkbox" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("invoiced", v)}>
        <div className="flex justify-center">
          <Checkbox checked={!!f.clientInfo?.invoiced} disabled className="pointer-events-none" />
        </div>
      </InlineEditCell>
    ),
  },
  {
    key: "sameCase",
    label: "費用群組",
    minWidth: 50,
    managerOnly: true,
    render: (f, { editable, lockedTooltip, onCommit }) => (
      <InlineEditCell value={!!f.clientInfo?.sameCase} type="checkbox" editable={editable} lockedTooltip={lockedTooltip} onCommit={(v) => onCommit("sameCase", v)}>
        <div className="flex justify-center">
          <Checkbox checked={!!f.clientInfo?.sameCase} disabled className="pointer-events-none" />
        </div>
      </InlineEditCell>
    ),
  },
  {
    key: "translatorInvoiceStatus",
    label: "稿費請款狀態",
    minWidth: 90,
    managerOnly: true,
    render: (f) => <TranslatorInvoiceStatus feeId={f.id} />,
  },
  {
    key: "clientInvoiceStatus",
    label: "客戶請款狀態",
    minWidth: 90,
    managerOnly: true,
    render: (f) => <ClientInvoiceStatusCell feeId={f.id} />,
  },
  {
    key: "invoice",
    label: "請款單",
    minWidth: 80,
    managerOnly: true,
    render: (f) => <InvoiceLink feeId={f.id} />,
  },
  {
    key: "createdBy",
    label: "建立者",
    minWidth: 60,
    render: (f) => <CreatorName uid={f.createdBy} />,
  },
  {
    key: "createdAt",
    label: "建立時間",
    minWidth: 90,
    render: (f) => <span className="text-sm text-muted-foreground tabular-nums">{formatDate(f.createdAt)}</span>,
  },
];

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
  if (!value) return <span className="truncate text-sm text-muted-foreground">—</span>;
  return <AssigneeTag label={value} avatarUrl={opt?.avatarUrl} />;
}

function FeeStatusBadge({ status }: { status: FeeStatus }) {
  const labelStyles = useLabelStyles();
  const style = status === "finalized" ? labelStyles.statusFinalized : labelStyles.statusDraft;
  return (
    <Badge
      variant="default"
      className="text-xs whitespace-nowrap border"
      style={{ backgroundColor: style.bgColor, color: style.textColor, borderColor: style.bgColor }}
    >
      {feeStatusLabels[status]}
    </Badge>
  );
}

function ClientLabel({ value }: { value: string }) {
  const { options } = useSelectOptions("client");
  const labelStyles = useLabelStyles();
  const labelTextColor = labelStyles.client.textColor;
  const opt = options.find((o) => o.label === value);
  if (!value) return <span className="truncate text-sm text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: opt?.color || "#6B7280",
        color: labelTextColor,
        borderColor: opt?.color || "#6B7280",
      }}
    >
      <span className="truncate">{value}</span>
    </span>
  );
}

function DispatchRouteLabel({ value }: { value: string }) {
  const { options } = useSelectOptions("dispatchRoute");
  const labelStyles = useLabelStyles();
  const labelTextColor = labelStyles.dispatchRoute.textColor;
  const opt = options.find((o) => o.label === value);
  if (!value) return <span className="truncate text-sm text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: opt?.color || "#6B7280",
        color: labelTextColor,
        borderColor: opt?.color || "#6B7280",
      }}
    >
      <span className="truncate">{value}</span>
    </span>
  );
}

function TranslatorInvoiceStatus({ feeId }: { feeId: string }) {
  const invoices = useInvoices();
  const linked = invoices.find((inv) => inv.feeIds.includes(feeId));
  if (!linked) return <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><span className="text-sm text-muted-foreground cursor-default">尚未請款</span></TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>;
  const labelMap: Record<string, string> = { pending: "待付款", partial: "部份付款", paid: "已付款" };
  return (
    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
      <span className="cursor-default"><Badge variant="outline" className="text-xs whitespace-nowrap">{labelMap[linked.status] || linked.status}</Badge></span>
    </TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>
  );
}

function ClientInvoiceStatusCell({ feeId }: { feeId: string }) {
  const invoices = useClientInvoices();
  const linked = invoices.find((inv) => inv.feeIds.includes(feeId));
  if (!linked) return <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><span className="text-sm text-muted-foreground cursor-default">尚未請款</span></TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>;
  const labelMap: Record<string, string> = { pending: "待收款", partial: "部份到帳", paid: "全額收齊" };
  return (
    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
      <span className="cursor-default"><Badge variant="outline" className="text-xs whitespace-nowrap">{labelMap[linked.status] || linked.status}</Badge></span>
    </TooltipTrigger><TooltipContent className="text-xs">自動填入</TooltipContent></Tooltip></TooltipProvider>
  );
}

function InvoiceLink({ feeId }: { feeId: string }) {
  const navigate = useNavigate();
  const invoices = useInvoices();
  const linked = invoices.filter((inv) => inv.feeIds.includes(feeId));
  if (linked.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {linked.map((inv) => (
        <button
          key={inv.id}
          onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${inv.id}`); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-xs text-primary hover:underline truncate text-left"
          title={inv.title}
        >
          {inv.title || inv.translator}
        </button>
      ))}
    </div>
  );
}

function OpenButton({ feeId }: { feeId: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(`/fees/${feeId}`); }}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover/title:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
      title="開啟"
    >
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

type ExpandType = "notes" | "editLog";

export default function TranslatorFees() {
  const navigate = useNavigate();
  const fees = useFees();
  const { primaryRole, isAdmin, profile } = useAuth();
  const { canViewSection } = usePermissions();
  const [currentRole, setCurrentRole] = useState<UserRole>(isAdmin ? "pm" : "assignee");
  const isManager = isAdmin;
  const canCreateFee = isAdmin || canViewSection("create_fee");

  const visibleFieldKeys = allColumnDefs
    .filter((c) => !c.managerOnly || isManager)
    .map((c) => c.key);

  const columnDefs = allColumnDefs.filter((c) => !c.managerOnly || isManager);

  const tableViews = useTableViews(isAdmin ? "pm" : "assignee");
  const { activeView } = tableViews;

  const [expandedRows, setExpandedRows] = useState<Record<string, ExpandType | null>>({});

  // Filter fees for assignee role: translators only see finalized fees assigned to them
  const effectiveRole = isAdmin ? "pm" : "assignee";
  const baseFees = effectiveRole === "assignee"
    ? fees.filter((f) => f.status === "finalized" && f.assignee === profile?.display_name)
    : fees;
  const visibleFees = tableViews.applyFiltersAndSorts(baseFees);

  const rowSelection = useRowSelection(visibleFees.map((f) => f.id));
  const allInvoices = useInvoices();
  const allClientInvoices = useClientInvoices();

  // Build lock context for a fee (linked invoices)
  const getLockContext = useCallback((fee: TranslatorFee): FeeFieldLockContext => {
    return {
      linkedTranslatorInvoiceIds: allInvoices.filter((inv) => inv.feeIds.includes(fee.id)).map((inv) => inv.id),
      linkedClientInvoiceIds: allClientInvoices.filter((inv) => inv.feeIds.includes(fee.id)).map((inv) => inv.id),
    };
  }, [allInvoices, allClientInvoices]);

  // For multi-select: compute aggregate lock tooltip for a field
  const getMultiLockTooltip = useCallback((field: string): string | undefined => {
    if (rowSelection.selectedCount <= 1) return undefined;
    const selectedFees = visibleFees.filter((f) => rowSelection.selectedIds.has(f.id));
    const lock = getMultiSelectFieldLock(selectedFees, field, getLockContext);
    return lock.locked ? lock.reason : undefined;
  }, [rowSelection.selectedCount, rowSelection.selectedIds, visibleFees, getLockContext]);

  // Column resize
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const col = allColumnDefs.find((c) => c.key === key);
    const startWidth = activeView.columnWidths[key] ?? 100;
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

  const toggleExpand = (feeId: string, type: ExpandType) => {
    setExpandedRows((prev) => ({ ...prev, [feeId]: prev[feeId] === type ? null : type }));
  };

  const handleCreate = () => {
    const newFee = feeStore.createDraft();
    navigate(`/fees/${newFee.id}`);
  };

  // Delete selected fees
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteValidation, setShowDeleteValidation] = useState(false);
  const [deleteValidationIssues, setDeleteValidationIssues] = useState<{ feeId: string; title: string; reason: string }[]>([]);

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(rowSelection.selectedIds);
    for (const id of ids) {
      feeStore.deleteFee(id);
    }
    rowSelection.deselectAll();
    setShowDeleteConfirm(false);
  }, [rowSelection]);

  // Compute single-select disabled reasons for delete button
  const getDeleteDisabledReason = useCallback((): string | undefined => {
    if (rowSelection.selectedCount === 0) return "請先選取項目";
    if (rowSelection.selectedCount === 1) {
      const feeId = Array.from(rowSelection.selectedIds)[0];
      const fee = feeStore.getFeeById(feeId);
      if (!fee) return undefined;
      if (fee.status === "finalized") return "已向譯者開立稿費條，不得刪除";
    }
    return undefined;
  }, [rowSelection.selectedCount, rowSelection.selectedIds]);

  // Multi-select delete validation
  const handleDeleteClick = useCallback(() => {
    if (rowSelection.selectedCount <= 1) {
      setShowDeleteConfirm(true);
      return;
    }
    // Multi-select: check for issues
    const issues: { feeId: string; title: string; reason: string }[] = [];
    for (const id of rowSelection.selectedIds) {
      const fee = feeStore.getFeeById(id);
      if (!fee) continue;
      if (fee.status === "finalized") {
        issues.push({ feeId: fee.id, title: fee.title || "未命名稿費單", reason: "已向譯者開立稿費條，不得刪除" });
      }
    }
    if (issues.length > 0) {
      setDeleteValidationIssues(issues);
      setShowDeleteValidation(true);
    } else {
      setShowDeleteConfirm(true);
    }
  }, [rowSelection]);

  // Apply column order from the view, excluding hidden columns
  const hiddenSet = new Set(activeView.hiddenColumns || []);
  const orderedCols = activeView.columnOrder
    .map((key) => columnDefs.find((c) => c.key === key))
    .filter((c): c is ColumnDef => !!c && !hiddenSet.has(c.key));

  const totalWidth = orderedCols.reduce((s, c) => s + (activeView.columnWidths[c.key] ?? 100), 0) + 140;

  // Undo/redo
  const applyUndoEntry = useCallback((entry: UndoEntry, isUndo: boolean) => {
    const val = isUndo ? entry.oldValue : entry.newValue;
    const fee = feeStore.getFeeById(entry.feeId);
    if (!fee) return;
    if (["client", "contact", "clientCaseId", "clientPoNumber", "dispatchRoute", "reconciled", "rateConfirmed", "invoiced", "sameCase"].includes(entry.field)) {
      const ci = fee.clientInfo || {
        clientTaskItems: [], sameCase: false, isFirstFee: false, notFirstFee: false,
        client: "", contact: "", clientCaseId: "", eciKeywords: "", clientPoNumber: "",
        dispatchRoute: "", reconciled: false, rateConfirmed: false, invoiced: false,
      };
      feeStore.updateFee(entry.feeId, { clientInfo: { ...ci, [entry.field]: val } });
    } else {
      feeStore.updateFee(entry.feeId, { [entry.field]: val });
    }
  }, []);

  const undoRedo = useUndoRedo({ onApply: applyUndoEntry });

  // Inline edit commit: applies to selected fees if multiple selected, otherwise just the one
  const handleCellCommit = useCallback((feeId: string, field: string, value: string | boolean | string[]) => {
    const targetIds = rowSelection.selectedIds.has(feeId) && rowSelection.selectedCount > 1
      ? Array.from(rowSelection.selectedIds)
      : [feeId];

    for (const id of targetIds) {
      const fee = feeStore.getFeeById(id);
      if (!fee) continue;

      // Skip locked items in multi-select
      const lock = getFieldLock(fee, field, getLockContext(fee));
      if (lock.locked) continue;

      // Get old value for undo
      let oldValue: string | boolean | string[];
      if (["client", "contact", "clientCaseId", "clientPoNumber", "dispatchRoute", "reconciled", "rateConfirmed", "invoiced", "sameCase"].includes(field)) {
        oldValue = (fee.clientInfo as any)?.[field] ?? (typeof value === "boolean" ? false : "");
      } else {
        oldValue = (fee as any)[field] ?? "";
      }

      undoRedo.push({ feeId: id, field, oldValue: oldValue as string | boolean, newValue: value as string | boolean });

      // Client info fields
      if (["client", "clientCaseId", "clientPoNumber", "reconciled", "rateConfirmed", "invoiced"].includes(field)) {
        const ci = fee.clientInfo || {
          clientTaskItems: [], sameCase: false, isFirstFee: false, notFirstFee: false,
          client: "", contact: "", clientCaseId: "", eciKeywords: "", clientPoNumber: "",
          dispatchRoute: "", reconciled: false, rateConfirmed: false, invoiced: false,
        };
        feeStore.updateFee(id, { clientInfo: { ...ci, [field]: value } });
      } else {
        feeStore.updateFee(id, { [field]: value });
      }
    }
  }, [rowSelection.selectedIds, rowSelection.selectedCount, undoRedo, getLockContext]);

  // Marquee (rubber-band) selection
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
      // Only start marquee on left click, not on interactive elements
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

          // Find rows that intersect with the marquee box
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

  return (
    <div className="mx-auto max-w-7xl space-y-4">

      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">費用管理</h1>
        </div>
        {canCreateFee && (
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            新增費用
          </Button>
        )}
        {isManager && (
          <TooltipProvider delayDuration={200}>
            {/* Translator Invoice button */}
            {rowSelection.selectedCount >= 2 ? (
              <InvoiceActions
                selectedFees={visibleFees.filter((f) => rowSelection.selectedIds.has(f.id))}
                onDone={() => rowSelection.deselectAll()}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    {rowSelection.selectedCount === 1 ? (
                      <InvoiceActions
                        selectedFees={visibleFees.filter((f) => rowSelection.selectedIds.has(f.id))}
                        onDone={() => rowSelection.deselectAll()}
                      />
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1.5 h-9" disabled>
                        <FileText className="h-4 w-4" />
                        譯者請款
                      </Button>
                    )}
                  </span>
                </TooltipTrigger>
                {rowSelection.selectedCount === 0 && (
                  <TooltipContent>請先選取項目</TooltipContent>
                )}
              </Tooltip>
            )}

            {/* Client Invoice button */}
            {rowSelection.selectedCount >= 2 ? (
              <ClientInvoiceActions
                selectedFees={visibleFees.filter((f) => rowSelection.selectedIds.has(f.id))}
                onDone={() => rowSelection.deselectAll()}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    {rowSelection.selectedCount === 1 ? (
                      <ClientInvoiceActions
                        selectedFees={visibleFees.filter((f) => rowSelection.selectedIds.has(f.id))}
                        onDone={() => rowSelection.deselectAll()}
                      />
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1.5 h-9" disabled>
                        <FileText className="h-4 w-4" />
                        客戶請款
                      </Button>
                    )}
                  </span>
                </TooltipTrigger>
                {rowSelection.selectedCount === 0 && (
                  <TooltipContent>請先選取項目</TooltipContent>
                )}
              </Tooltip>
            )}

            {/* Delete button */}
            {(() => {
              const deleteReason = getDeleteDisabledReason();
              const isDisabled = !!deleteReason;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        disabled={isDisabled}
                        onClick={handleDeleteClick}
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isDisabled && <TooltipContent>{deleteReason}</TooltipContent>}
                </Tooltip>
              );
            })()}
          </TooltipProvider>
        )}
        {!activeView.isDefault && (
          <span className="text-xs text-muted-foreground bg-muted/60 border border-border rounded-md px-2.5 py-1">
            此為自訂視圖，只有新增者本人可見
          </span>
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
        selectedCount={rowSelection.selectedCount}
        hiddenColumns={activeView.hiddenColumns || []}
        onToggleColumn={tableViews.toggleColumnVisibility}
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
              {/* Select-all checkbox */}
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
              <th className="w-[50px] px-2 py-2.5 text-center text-xs font-medium text-muted-foreground" title="備註">
                <MessageSquare className="h-3.5 w-3.5 mx-auto" />
              </th>
              <th className="w-[50px] px-2 py-2.5 text-center text-xs font-medium text-muted-foreground" title="修改紀錄">
                <History className="h-3.5 w-3.5 mx-auto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleFees.map((fee) => {
              const expanded = expandedRows[fee.id];
              const isSelected = rowSelection.selectedIds.has(fee.id);
              return (
                <FeeRow
                  key={fee.id}
                  fee={fee}
                  orderedCols={orderedCols}
                  columnWidths={activeView.columnWidths}
                  expanded={expanded}
                  onToggleExpand={toggleExpand}
                  currentRole={currentRole}
                  isManager={isManager}
                  isSelected={isSelected}
                  onSelect={rowSelection.handleClick}
                  onCellCommit={handleCellCommit}
                  registerRowRef={registerRowRef}
                  getLockContext={getLockContext}
                  getMultiLockTooltip={getMultiLockTooltip}
                  isMultiSelected={rowSelection.selectedCount > 1 && isSelected}
                />
              );
            })}
            {visibleFees.length === 0 && (
              <tr>
                <td colSpan={orderedCols.length + 3} className="text-center py-12 text-muted-foreground">
                  尚無稿費紀錄
                </td>
              </tr>
            )}
          </tbody>
          <TableFooterStats
            itemCount={visibleFees.length}
            orderedCols={orderedCols}
            columnWidths={activeView.columnWidths}
            numericColumns={[
              { key: "taskSummary", getValue: (f: TranslatorFee) => f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0) },
              { key: "clientRevenue", getValue: (f: TranslatorFee) => {
                if (!f.clientInfo || f.clientInfo.notFirstFee) return null;
                return f.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
              }},
              { key: "profit", getValue: (f: TranslatorFee) => {
                if (!f.clientInfo || f.clientInfo.notFirstFee) return null;
                const rev = f.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
                const cost = f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
                return rev - cost;
              }},
            ]}
            data={visibleFees}
            extraColCount={2}
          />
        </table>
      </motion.div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              {rowSelection.selectedCount > 1
                ? `即將刪除 ${rowSelection.selectedCount} 個項目，此操作無法復原。是否確定？`
                : "即將刪除選取的項目，此操作無法復原。是否確定？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete validation warning for multi-select */}
      <AlertDialog open={showDeleteValidation} onOpenChange={setShowDeleteValidation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>部分項目無法刪除</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>以下項目不符合刪除條件：</p>
                <ul className="list-disc pl-5 space-y-1.5 max-h-60 overflow-y-auto">
                  {deleteValidationIssues.map((issue) => (
                    <li key={issue.feeId} className="text-sm">
                      <Link
                        to={`/fees/${issue.feeId}`}
                        className="text-primary hover:underline font-medium"
                        onClick={() => setShowDeleteValidation(false)}
                      >
                        {issue.title}
                      </Link>
                      <span className="text-muted-foreground ml-1">— {issue.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>關閉</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FeeRow({
  fee, orderedCols, columnWidths, expanded, onToggleExpand, currentRole, isManager,
  isSelected, onSelect, onCellCommit, registerRowRef, getLockContext, getMultiLockTooltip, isMultiSelected,
}: {
  fee: TranslatorFee;
  orderedCols: ColumnDef[];
  columnWidths: Record<string, number>;
  expanded: ExpandType | null | undefined;
  onToggleExpand: (id: string, type: ExpandType) => void;
  currentRole: UserRole;
  isManager: boolean;
  isSelected: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onCellCommit: (feeId: string, field: string, value: string | boolean) => void;
  registerRowRef: (id: string, el: HTMLTableRowElement | null) => void;
  getLockContext: (fee: TranslatorFee) => FeeFieldLockContext;
  getMultiLockTooltip: (field: string) => string | undefined;
  isMultiSelected: boolean;
}) {
  const lockCtx = useMemo(() => getLockContext(fee), [fee, getLockContext]);

  const getEditable = useCallback((colKey: string): { editable: boolean; lockedTooltip?: string } => {
    if (!isManager || !editableFields.has(colKey)) return { editable: false };

    // Multi-select: if any selected item locks this field, block editing for all
    if (isMultiSelected) {
      const multiTooltip = getMultiLockTooltip(colKey);
      if (multiTooltip) return { editable: false, lockedTooltip: multiTooltip };
    }

    // Single-item lock
    const lock = getFieldLock(fee, colKey, lockCtx);
    if (lock.locked) return { editable: false, lockedTooltip: lock.reason };

    return { editable: true };
  }, [isManager, fee, lockCtx, isMultiSelected, getMultiLockTooltip]);

  return (
    <>
      <tr
        ref={(el) => registerRowRef(fee.id, el)}
        className={cn(
          "border-b border-border transition-colors group",
          isSelected ? "bg-primary/5" : "hover:bg-secondary/50"
        )}
      >
        <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => {}}
            onClick={(e) => onSelect(fee.id, e as unknown as React.MouseEvent)}
            className="mx-auto"
          />
        </td>
        {orderedCols.map((col) => {
          const { editable, lockedTooltip } = getEditable(col.key);
          return (
            <td
              key={col.key}
              style={{ width: columnWidths[col.key] ?? 100, maxWidth: columnWidths[col.key] ?? 100 }}
              className={cn("px-3 py-3 overflow-hidden border-r border-border/40 last:border-r-0", col.key !== "title" && col.key !== "clientCaseId" && col.key !== "clientPoNumber" && "text-center")}
            >
              {col.render(fee, {
                isManager,
                editable,
                lockedTooltip,
                onCommit: (field, value) => onCellCommit(fee.id, field, value as string | boolean),
              })}
            </td>
          );
        })}
        <td className="px-2 py-3 text-center">
          {fee.notes.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(fee.id, "notes"); }}
              className={cn(
                "inline-flex items-center justify-center gap-0.5 h-6 min-w-6 px-1 rounded transition-colors text-xs tabular-nums",
                expanded === "notes" ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
            >
              <span>{fee.notes.length}</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded === "notes" && "rotate-180")} />
            </button>
          )}
        </td>
        <td className="px-2 py-3 text-center">
          {fee.editLogs.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(fee.id, "editLog"); }}
              className={cn(
                "inline-flex items-center justify-center gap-0.5 h-6 min-w-6 px-1 rounded transition-colors text-xs tabular-nums",
                expanded === "editLog" ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
            >
              <span>{fee.editLogs.length}</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded === "editLog" && "rotate-180")} />
            </button>
          )}
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={orderedCols.length + 3} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 py-4 bg-muted/20 border-b border-border">
                  {expanded === "notes" && <NotesPanel fee={fee} />}
                  {expanded === "editLog" && <EditLogPanel fee={fee} currentRole={currentRole} />}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

function NotesPanel({ fee }: { fee: TranslatorFee }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        備註（{fee.notes.length}）
      </h4>
      {fee.notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">尚無備註</p>
      ) : (
        <ul className="space-y-1.5">
          {fee.notes.map((n) => (
            <li key={n.id} className="text-sm flex items-baseline gap-2">
              <span className="font-medium text-card-foreground">{n.author}</span>
              <span className="text-muted-foreground">{n.text}</span>
              <span className="text-xs text-muted-foreground/60 ml-auto whitespace-nowrap">{formatDate(n.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isClientInfoLog(action: string): boolean {
  return clientInfoLogKeywords.some((kw) => action.includes(kw));
}

function EditLogPanel({ fee, currentRole }: { fee: TranslatorFee; currentRole: UserRole }) {
  const isManager = currentRole === "pm" || currentRole === "executive";
  const filteredLogs = isManager
    ? fee.editLogs
    : fee.editLogs.filter((log) => !isClientInfoLog(`${log.field} ${log.oldValue} → ${log.newValue}`));

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" />
        修改紀錄（{filteredLogs.length}）
      </h4>
      {filteredLogs.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">尚無修改紀錄</p>
      ) : (
        <ul className="space-y-1.5">
          {filteredLogs.map((log) => (
            <li key={log.id} className="text-sm flex items-baseline gap-2">
              <span className="font-medium text-card-foreground">{log.author}</span>
              <span className="text-muted-foreground">{log.field} {log.oldValue} → {log.newValue}</span>
              <span className="text-xs text-muted-foreground/60 ml-auto whitespace-nowrap">{formatDate(log.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
