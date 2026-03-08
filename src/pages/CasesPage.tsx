import { useNavigate } from "react-router-dom";
import { Plus, GripVertical, ExternalLink, Trash2, Copy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCases, caseStore } from "@/hooks/use-case-store";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useCaseTableViews, caseFieldMetas } from "@/hooks/use-case-table-views";
import { FilterSortToolbar } from "@/components/fees/FilterSortToolbar";
import { InlineEditCell } from "@/components/fees/InlineEditCell";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import AssigneeTag from "@/components/AssigneeTag";
import { useState, useRef, useCallback, useEffect } from "react";
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
import type { CaseRecord } from "@/data/case-types";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
};

interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  render: (c: CaseRecord, opts: { editable: boolean; onCommit: (field: string, value: string | boolean) => void }) => React.ReactNode;
}

function CategoryLabel({ value }: { value: string }) {
  const { options } = useSelectOptions("caseCategory");
  const labelStyles = useLabelStyles();
  const opt = options.find((o) => o.label === value);
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: opt?.color || "#6B7280", color: labelStyles.caseCategory.textColor, borderColor: opt?.color || "#6B7280" }}
    >
      {value}
    </span>
  );
}

function WorkTypeLabels({ values }: { values: string[] }) {
  const { options } = useSelectOptions("taskType");
  const labelStyles = useLabelStyles();
  if (!values || values.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => {
        const opt = options.find((o) => o.label === v);
        return (
          <span
            key={v}
            className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: opt?.color || "#6B7280", color: labelStyles.taskType.textColor, borderColor: opt?.color || "#6B7280" }}
          >
            {v}
          </span>
        );
      })}
    </div>
  );
}

function BillingUnitLabel({ value }: { value: string }) {
  const { options } = useSelectOptions("billingUnit");
  const labelStyles = useLabelStyles();
  const opt = options.find((o) => o.label === value);
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: opt?.color || "#6B7280", color: labelStyles.billingUnit.textColor, borderColor: opt?.color || "#6B7280" }}
    >
      {value}
    </span>
  );
}

function AssigneeLabel({ value }: { value: string }) {
  const { options } = useSelectOptions("assignee");
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  const opt = options.find((o) => o.label === value);
  return <AssigneeTag label={value} avatarUrl={opt?.avatarUrl} />;
}

function OpenButton({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(`/cases/${caseId}`); }}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover/title:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
      title="開啟"
    >
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

const allColumnDefs: ColumnDef[] = [
  {
    key: "title",
    label: "案件編號",
    minWidth: 120,
    render: (c, { editable, onCommit }) => (
      <div className="relative flex items-center group/title">
        <InlineEditCell value={c.title} type="text" editable={editable} onCommit={(v) => onCommit("title", v)} className="flex-1 min-w-0 pr-6">
          <span className="truncate font-medium text-card-foreground">
            {c.title || <span className="text-muted-foreground italic">未命名案件</span>}
          </span>
        </InlineEditCell>
        <OpenButton caseId={c.id} />
      </div>
    ),
  },
  {
    key: "status",
    label: "狀態",
    minWidth: 70,
    render: (c) => <CaseStatusBadge status={c.status} />,
  },
  {
    key: "category",
    label: "類型",
    minWidth: 80,
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={c.category} type="colorSelect" fieldKey="caseCategory" editable={editable} onCommit={(v) => onCommit("category", v)}>
        <CategoryLabel value={c.category} />
      </InlineEditCell>
    ),
  },
  {
    key: "workType",
    label: "工作類型",
    minWidth: 120,
    render: (c) => <WorkTypeLabels values={c.workType} />,
  },
  {
    key: "billingUnit",
    label: "計費單位",
    minWidth: 80,
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={c.billingUnit} type="colorSelect" fieldKey="billingUnit" editable={editable} onCommit={(v) => onCommit("billingUnit", v)}>
        <BillingUnitLabel value={c.billingUnit} />
      </InlineEditCell>
    ),
  },
  {
    key: "unitCount",
    label: "計費單位數",
    minWidth: 80,
    render: (c) => <span className="text-sm tabular-nums">{c.unitCount || "—"}</span>,
  },
  {
    key: "translator",
    label: "譯者",
    minWidth: 90,
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={(c.translator || []).join(", ")} type="colorSelect" fieldKey="assignee" editable={editable} onCommit={(v) => onCommit("translator", v)}>
        <AssigneeLabel value={(c.translator || []).join(", ")} />
      </InlineEditCell>
    ),
  },
  {
    key: "translationDeadline",
    label: "翻譯交期",
    minWidth: 110,
    render: (c) => <span className="text-sm text-muted-foreground tabular-nums">{formatDateTime(c.translationDeadline)}</span>,
  },
  {
    key: "reviewer",
    label: "審稿人員",
    minWidth: 90,
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={c.reviewer} type="colorSelect" fieldKey="assignee" editable={editable} onCommit={(v) => onCommit("reviewer", v)}>
        <AssigneeLabel value={c.reviewer} />
      </InlineEditCell>
    ),
  },
  {
    key: "reviewDeadline",
    label: "審稿交期",
    minWidth: 110,
    render: (c) => <span className="text-sm text-muted-foreground tabular-nums">{formatDateTime(c.reviewDeadline)}</span>,
  },
  {
    key: "taskStatus",
    label: "任務狀態",
    minWidth: 80,
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={c.taskStatus} type="text" editable={editable} onCommit={(v) => onCommit("taskStatus", v)}>
        <span className="text-sm">{c.taskStatus || "—"}</span>
      </InlineEditCell>
    ),
  },
  {
    key: "executionTool",
    label: "執行工具",
    minWidth: 90,
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={c.executionTool} type="text" editable={editable} onCommit={(v) => onCommit("executionTool", v)}>
        <span className="text-sm text-muted-foreground">{c.executionTool || "—"}</span>
      </InlineEditCell>
    ),
  },
  {
    key: "deliveryMethod",
    label: "交件方式",
    minWidth: 90,
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={c.deliveryMethod} type="text" editable={editable} onCommit={(v) => onCommit("deliveryMethod", v)}>
        <span className="text-sm text-muted-foreground">{c.deliveryMethod || "—"}</span>
      </InlineEditCell>
    ),
  },
  {
    key: "createdAt",
    label: "建立時間",
    minWidth: 100,
    render: (c) => <span className="text-sm text-muted-foreground tabular-nums">{formatDate(c.createdAt)}</span>,
  },
];

const editableFields = new Set(["title", "category", "billingUnit", "translator", "reviewer", "taskStatus", "executionTool", "deliveryMethod"]);

export default function CasesPage() {
  const navigate = useNavigate();
  const cases = useCases();
  const { isAdmin } = useAuth();
  const tableViews = useCaseTableViews(isAdmin ? "pm" : "assignee");
  const { activeView } = tableViews;

  const visibleFees = tableViews.applyFiltersAndSorts(cases);
  const rowSelection = useRowSelection(visibleFees.map((c) => c.id));

  const visibleFieldKeys = caseFieldMetas.map((f) => f.key);

  // Column resize
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = activeView.columnWidths[key] ?? 100;
    resizingRef.current = { key, startX: e.clientX, startWidth };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const col = allColumnDefs.find((c) => c.key === key);
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

  const handleCreate = async () => {
    const newCase = await caseStore.create({ title: "新案件" });
    if (newCase) navigate(`/cases/${newCase.id}`);
  };

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const handleDeleteSelected = useCallback(async () => {
    for (const id of rowSelection.selectedIds) {
      await caseStore.remove(id);
    }
    rowSelection.deselectAll();
    setShowDeleteConfirm(false);
  }, [rowSelection]);

  const handleCellCommit = useCallback((caseId: string, field: string, value: string | boolean) => {
    const targetIds = rowSelection.selectedIds.has(caseId) && rowSelection.selectedCount > 1
      ? Array.from(rowSelection.selectedIds)
      : [caseId];
    for (const id of targetIds) {
      caseStore.update(id, { [field]: value });
    }
  }, [rowSelection]);

  // Ordered visible columns
  const hiddenSet = new Set(activeView.hiddenColumns || []);
  const orderedCols = activeView.columnOrder
    .map((key) => allColumnDefs.find((c) => c.key === key))
    .filter((c): c is ColumnDef => !!c && !hiddenSet.has(c.key));
  const totalWidth = orderedCols.reduce((s, c) => s + (activeView.columnWidths[c.key] ?? 100), 0) + 60;

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
        if (!isMarquee && (Math.abs(dx - startX) > 5 || Math.abs(dy - startY) > 5)) isMarquee = true;
        if (isMarquee) setMarquee({ startX, startY, currentX: dx, currentY: dy });
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
            if (rowBottom >= boxTop && rowTop <= boxBottom) hitIds.push(id);
          });
          if (hitIds.length > 0) rowSelection.setSelectedIds(new Set(hitIds));
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
        <h1 className="text-2xl font-semibold tracking-tight">案件管理</h1>
        <Button size="sm" className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          新增案件
        </Button>
        {rowSelection.selectedCount > 0 && (
          <>
            <span className="text-xs text-muted-foreground">已選取 {rowSelection.selectedCount} 個項目</span>
            {rowSelection.selectedCount === 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-muted-foreground"
                onClick={async () => {
                  const id = Array.from(rowSelection.selectedIds)[0];
                  const newCase = await caseStore.duplicate(id);
                  if (newCase) navigate(`/cases/${newCase.id}`);
                }}
              >
                <Copy className="h-4 w-4" />
                複製本單
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
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
            {visibleFees.map((c) => {
              const isSelected = rowSelection.selectedIds.has(c.id);
              return (
                <tr
                  key={c.id}
                  ref={(el) => registerRowRef(c.id, el)}
                  className={cn(
                    "border-b border-border/40 transition-colors hover:bg-muted/30",
                    isSelected && "bg-primary/5"
                  )}
                >
                  <td className="w-[40px] px-2 py-1.5 text-center">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => rowSelection.handleClick(c.id, { ctrlKey: true } as any)}
                      className="mx-auto"
                    />
                  </td>
                  {orderedCols.map((col) => (
                    <td
                      key={col.key}
                      style={{ width: activeView.columnWidths[col.key] ?? 100, maxWidth: activeView.columnWidths[col.key] ?? 100 }}
                      className="px-3 py-1.5 overflow-hidden"
                    >
                      {col.render(c, {
                        editable: editableFields.has(col.key),
                        onCommit: (field, value) => handleCellCommit(c.id, field, value),
                      })}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visibleFees.length === 0 && (
              <tr>
                <td colSpan={orderedCols.length + 1} className="h-24 text-center text-muted-foreground">
                  尚無案件紀錄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Delete confirm dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除已選取的 {rowSelection.selectedCount} 個案件嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
