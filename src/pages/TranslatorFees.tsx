import { useNavigate } from "react-router-dom";
import { Plus, ChevronDown, MessageSquare, History, GripVertical } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { type TranslatorFee, type FeeStatus } from "@/data/fee-mock-data";

const feeStatusLabels: Record<FeeStatus, string> = {
  draft: "草稿",
  finalized: "開立完成",
};
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useFees, feeStore } from "@/hooks/use-fee-store";
import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

type UserRole = "assignee" | "pm" | "executive";
const roleLabels: Record<UserRole, string> = {
  assignee: "開單對象",
  pm: "PM",
  executive: "執行官",
};

// Fields that only PM+ can see
const managerOnlyFields = new Set([
  "client", "contact", "clientCaseId", "clientPoNumber", "hdPath",
  "reconciled", "rateConfirmed", "invoiced", "sameCase",
  "clientRevenue", "profit", "internalNote",
]);

// Fields related to client info for edit log filtering
const clientInfoLogKeywords = [
  "客戶", "聯絡人", "案號", "PO", "硬碟", "對帳", "費率", "請款",
  "同一案件", "主要營收", "營收", "利潤", "客戶端",
];

interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  defaultWidth: number;
  managerOnly?: boolean;
  render: (fee: TranslatorFee) => React.ReactNode;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

const allColumnDefs: ColumnDef[] = [
  {
    key: "title",
    label: "標題",
    minWidth: 120,
    defaultWidth: 220,
    render: (f) => (
      <span className="truncate font-medium text-card-foreground">
        {f.title || <span className="text-muted-foreground italic">未命名稿費單</span>}
      </span>
    ),
  },
  {
    key: "status",
    label: "狀態",
    minWidth: 70,
    defaultWidth: 90,
    render: (f) => (
      <Badge
        variant={f.status === "draft" ? "outline" : "default"}
        className={cn(
          "text-xs whitespace-nowrap",
          f.status === "finalized" && "bg-success/15 text-success border-success/30 hover:bg-success/20"
        )}
      >
        {feeStatusLabels[f.status]}
      </Badge>
    ),
  },
  {
    key: "assignee",
    label: "開單對象",
    minWidth: 70,
    defaultWidth: 100,
    render: (f) => <span className="truncate text-sm">{f.assignee || "—"}</span>,
  },
  {
    key: "internalNote",
    label: "關聯案件",
    minWidth: 100,
    defaultWidth: 160,
    managerOnly: true,
    render: (f) => (
      <span className="truncate text-sm text-muted-foreground">
        {f.internalNote || "—"}
      </span>
    ),
  },
  {
    key: "taskSummary",
    label: "稿費總額",
    minWidth: 80,
    defaultWidth: 120,
    render: (f) => {
      const total = f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
      return <span className="text-sm tabular-nums">{formatCurrency(total)}</span>;
    },
  },
  {
    key: "client",
    label: "客戶",
    minWidth: 70,
    defaultWidth: 100,
    managerOnly: true,
    render: (f) => <span className="truncate text-sm">{f.clientInfo?.client || "—"}</span>,
  },
  {
    key: "clientCaseId",
    label: "案號",
    minWidth: 80,
    defaultWidth: 120,
    managerOnly: true,
    render: (f) => <span className="truncate text-sm text-muted-foreground">{f.clientInfo?.clientCaseId || f.clientInfo?.eciKeywords || "—"}</span>,
  },
  {
    key: "clientPoNumber",
    label: "客戶 PO",
    minWidth: 80,
    defaultWidth: 100,
    managerOnly: true,
    render: (f) => <span className="truncate text-sm text-muted-foreground">{f.clientInfo?.clientPoNumber || "—"}</span>,
  },
  {
    key: "clientRevenue",
    label: "營收",
    minWidth: 80,
    defaultWidth: 100,
    managerOnly: true,
    render: (f) => {
      if (!f.clientInfo || f.clientInfo.notFirstFee) return <span className="text-sm text-muted-foreground">N/A</span>;
      const rev = f.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
      return <span className="text-sm tabular-nums">{formatCurrency(rev)}</span>;
    },
  },
  {
    key: "profit",
    label: "利潤",
    minWidth: 80,
    defaultWidth: 100,
    managerOnly: true,
    render: (f) => {
      if (!f.clientInfo || f.clientInfo.notFirstFee) return <span className="text-sm text-muted-foreground">N/A</span>;
      const rev = f.clientInfo.clientTaskItems.reduce((s, i) => s + Number(i.unitCount) * Number(i.clientPrice), 0);
      const cost = f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
      const p = rev - cost;
      return <span className={cn("text-sm tabular-nums font-medium", p >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(p)}</span>;
    },
  },
  {
    key: "reconciled",
    label: "對帳",
    minWidth: 50,
    defaultWidth: 60,
    managerOnly: true,
    render: (f) => (
      <div className="flex justify-center">
        <Checkbox checked={!!f.clientInfo?.reconciled} disabled className="pointer-events-none" />
      </div>
    ),
  },
  {
    key: "rateConfirmed",
    label: "費率",
    minWidth: 50,
    defaultWidth: 60,
    managerOnly: true,
    render: (f) => (
      <div className="flex justify-center">
        <Checkbox checked={!!f.clientInfo?.rateConfirmed} disabled className="pointer-events-none" />
      </div>
    ),
  },
  {
    key: "invoiced",
    label: "請款",
    minWidth: 50,
    defaultWidth: 60,
    managerOnly: true,
    render: (f) => (
      <div className="flex justify-center">
        <Checkbox checked={!!f.clientInfo?.invoiced} disabled className="pointer-events-none" />
      </div>
    ),
  },
  {
    key: "createdBy",
    label: "建立者",
    minWidth: 60,
    defaultWidth: 80,
    render: (f) => <span className="truncate text-sm">{f.createdBy}</span>,
  },
  {
    key: "createdAt",
    label: "建立時間",
    minWidth: 90,
    defaultWidth: 110,
    render: (f) => <span className="text-sm text-muted-foreground tabular-nums">{formatDate(f.createdAt)}</span>,
  },
];

type ExpandType = "notes" | "editLog";

export default function TranslatorFees() {
  const navigate = useNavigate();
  const fees = useFees();
  const [currentRole, setCurrentRole] = useState<UserRole>("pm");

  const isManager = currentRole === "pm" || currentRole === "executive";
  const columnDefs = allColumnDefs.filter((c) => !c.managerOnly || isManager);

  const [columnOrder, setColumnOrder] = useState<string[]>(() => allColumnDefs.map((c) => c.key));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(allColumnDefs.map((c) => [c.key, c.defaultWidth]))
  );
  const [expandedRows, setExpandedRows] = useState<Record<string, ExpandType | null>>({});

  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const col = allColumnDefs.find((c) => c.key === key);
    resizingRef.current = { key, startX: e.clientX, startWidth: columnWidths[key] ?? col?.defaultWidth ?? 100 };

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const minW = col?.minWidth ?? 60;
      const newW = Math.max(minW, resizingRef.current.startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.key]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [columnWidths]);

  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    dragColRef.current = key;
    e.dataTransfer.effectAllowed = "move";
    const el = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(el, 20, 20);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (dragColRef.current && dragColRef.current !== key) {
      setDragOverCol(key);
    }
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const sourceKey = dragColRef.current;
    if (!sourceKey || sourceKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const srcIdx = next.indexOf(sourceKey);
      const tgtIdx = next.indexOf(targetKey);
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, sourceKey);
      return next;
    });
    dragColRef.current = null;
    setDragOverCol(null);
  };

  const handleDragEnd = () => {
    dragColRef.current = null;
    setDragOverCol(null);
  };

  const toggleExpand = (feeId: string, type: ExpandType) => {
    setExpandedRows((prev) => ({
      ...prev,
      [feeId]: prev[feeId] === type ? null : type,
    }));
  };

  const handleCreate = () => {
    const newFee = feeStore.createDraft();
    navigate(`/fees/${newFee.id}`);
  };

  const orderedCols = columnOrder
    .map((key) => columnDefs.find((c) => c.key === key))
    .filter(Boolean) as ColumnDef[];

  const totalWidth = orderedCols.reduce((s, c) => s + (columnWidths[c.key] ?? c.defaultWidth), 0) + 100;

  // Filter fees for assignee role: hide drafts
  const visibleFees = currentRole === "assignee"
    ? fees.filter((f) => f.status !== "draft")
    : fees;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Role Switcher */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium">測試角色：</span>
        {(Object.keys(roleLabels) as UserRole[]).map((role) => (
          <Button
            key={role}
            variant={currentRole === role ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs px-2.5"
            onClick={() => setCurrentRole(role)}
          >
            {roleLabels[role]}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">費用管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理譯者費用請款單</p>
        </div>
        {isManager && (
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            新增費用
          </Button>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card overflow-x-auto"
      >
        <table style={{ minWidth: totalWidth }} className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {orderedCols.map((col) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={(e) => handleDragStart(e, col.key)}
                  onDragOver={(e) => handleDragOver(e, col.key)}
                  onDrop={(e) => handleDrop(e, col.key)}
                  onDragEnd={handleDragEnd}
                  style={{ width: columnWidths[col.key] ?? col.defaultWidth }}
                  className={cn(
                    "relative select-none px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap group border-r border-border/40 last:border-r-0",
                    dragOverCol === col.key && "bg-primary/10"
                  )}
                >
                  <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing">
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
              return (
                <FeeRow
                  key={fee.id}
                  fee={fee}
                  orderedCols={orderedCols}
                  columnWidths={columnWidths}
                  expanded={expanded}
                  onToggleExpand={toggleExpand}
                  onNavigate={() => navigate(`/fees/${fee.id}`)}
                  currentRole={currentRole}
                />
              );
            })}
            {visibleFees.length === 0 && (
              <tr>
                <td colSpan={orderedCols.length + 2} className="text-center py-12 text-muted-foreground">
                  尚無稿費紀錄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}

function FeeRow({
  fee,
  orderedCols,
  columnWidths,
  expanded,
  onToggleExpand,
  onNavigate,
  currentRole,
}: {
  fee: TranslatorFee;
  orderedCols: ColumnDef[];
  columnWidths: Record<string, number>;
  expanded: ExpandType | null | undefined;
  onToggleExpand: (id: string, type: ExpandType) => void;
  onNavigate: () => void;
  currentRole: UserRole;
}) {
  return (
    <>
      <tr
        className="border-b border-border hover:bg-secondary/50 transition-colors cursor-pointer group"
        onClick={onNavigate}
      >
        {orderedCols.map((col) => (
          <td
            key={col.key}
            style={{ width: columnWidths[col.key] ?? col.defaultWidth, maxWidth: columnWidths[col.key] ?? col.defaultWidth }}
            className="px-3 py-3 overflow-hidden border-r border-border/40 last:border-r-0"
          >
            {col.render(fee)}
          </td>
        ))}
        <td className="px-2 py-3 text-center">
          {fee.notes.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(fee.id, "notes"); }}
              className={cn(
                "inline-flex items-center justify-center gap-0.5 h-6 min-w-6 px-1 rounded transition-colors text-xs tabular-nums",
                expanded === "notes" ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
              title="備註"
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
              title="修改紀錄"
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
            <td colSpan={orderedCols.length + 2} className="p-0">
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
  // Filter edit logs: assignee can only see non-client-info logs
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
