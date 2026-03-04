import { useNavigate } from "react-router-dom";
import { Plus, ChevronDown, MessageSquare, History, GripVertical } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { feeStatusLabels, type TranslatorFee } from "@/data/fee-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFees, feeStore } from "@/hooks/use-fee-store";
import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  defaultWidth: number;
  render: (fee: TranslatorFee) => React.ReactNode;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const formatCurrency = (n: number) =>
  n.toLocaleString("zh-TW", { style: "currency", currency: "TWD", minimumFractionDigits: 0 });

const columnDefs: ColumnDef[] = [
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
    render: (f) => (
      <span className="truncate text-sm text-muted-foreground">
        {f.internalNote || "—"}
      </span>
    ),
  },
  {
    key: "taskSummary",
    label: "稿費項目",
    minWidth: 80,
    defaultWidth: 120,
    render: (f) => {
      const total = f.taskItems.reduce((s, i) => s + i.unitCount * i.unitPrice, 0);
      return (
        <span className="text-sm tabular-nums">
          {formatCurrency(total)}
        </span>
      );
    },
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

  // Column order (array of keys)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => columnDefs.map((c) => c.key));
  // Column widths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columnDefs.map((c) => [c.key, c.defaultWidth]))
  );
  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Record<string, ExpandType | null>>({});

  // --- Column resizing ---
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const col = columnDefs.find((c) => c.key === key);
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

  // --- Column drag reorder ---
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    dragColRef.current = key;
    e.dataTransfer.effectAllowed = "move";
    // Minimal drag image
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

  // --- Expand toggle ---
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

  // Total table width for sticky sizing
  const totalWidth = orderedCols.reduce((s, c) => s + (columnWidths[c.key] ?? c.defaultWidth), 0) + 100; // +100 for action cols

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">稿費管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理譯者稿費請款單</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          新增稿費
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card overflow-x-auto"
      >
        <table style={{ minWidth: totalWidth }} className="w-full text-sm">
          {/* Header */}
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
                    "relative select-none px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap group",
                    dragOverCol === col.key && "bg-primary/10"
                  )}
                >
                  <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 shrink-0" />
                    <span>{col.label}</span>
                  </div>
                  {/* Resize handle */}
                  <div
                    onMouseDown={(e) => handleResizeStart(e, col.key)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-border/50 hover:bg-primary/40 transition-colors"
                  />
                </th>
              ))}
              {/* Action columns for expandable sections */}
              <th className="w-[50px] px-2 py-2.5 text-center text-xs font-medium text-muted-foreground" title="備註">
                <MessageSquare className="h-3.5 w-3.5 mx-auto" />
              </th>
              <th className="w-[50px] px-2 py-2.5 text-center text-xs font-medium text-muted-foreground" title="修改紀錄">
                <History className="h-3.5 w-3.5 mx-auto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {fees.map((fee) => {
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
                />
              );
            })}
            {fees.length === 0 && (
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
}: {
  fee: TranslatorFee;
  orderedCols: ColumnDef[];
  columnWidths: Record<string, number>;
  expanded: ExpandType | null | undefined;
  onToggleExpand: (id: string, type: ExpandType) => void;
  onNavigate: () => void;
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
            className="px-3 py-3 overflow-hidden"
          >
            {col.render(fee)}
          </td>
        ))}
        {/* Notes expand button */}
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
        {/* Edit log expand button */}
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
      {/* Expanded content row */}
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
                  {expanded === "editLog" && <EditLogPanel fee={fee} />}
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
              <span className="text-muted-foreground">{n.content}</span>
              <span className="text-xs text-muted-foreground/60 ml-auto whitespace-nowrap">{formatDate(n.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditLogPanel({ fee }: { fee: TranslatorFee }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" />
        修改紀錄（{fee.editLogs.length}）
      </h4>
      {fee.editLogs.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">尚無修改紀錄</p>
      ) : (
        <ul className="space-y-1.5">
          {fee.editLogs.map((log) => (
            <li key={log.id} className="text-sm flex items-baseline gap-2">
              <span className="font-medium text-card-foreground">{log.author}</span>
              <span className="text-muted-foreground">{log.action}</span>
              <span className="text-xs text-muted-foreground/60 ml-auto whitespace-nowrap">{formatDate(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
