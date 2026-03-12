import { useNavigate } from "react-router-dom";
import { TableFooterStats, type NumericColumnConfig } from "@/components/TableFooterStats";
import { Plus, GripVertical, ExternalLink, Trash2, Copy, FileText, CheckSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { CreateWithTemplateButton } from "@/components/CreateWithTemplateButton";
import { useAuth } from "@/hooks/use-auth";
import { DeadlineProximityIcon } from "@/components/DeadlineProximityIcon";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTz as formatDate, formatDateTimeTz as formatDateTime } from "@/lib/format-timestamp";
import { useCases, caseStore } from "@/hooks/use-case-store";
import { useFees } from "@/hooks/use-fee-store";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useCaseTableViews, caseFieldMetas } from "@/hooks/use-case-table-views";
import { FilterSortToolbar } from "@/components/fees/FilterSortToolbar";
import { InlineEditCell } from "@/components/fees/InlineEditCell";
import { useSelectOptions, getStatusLabelStyle } from "@/stores/select-options-store";
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
import type { CaseRecord, CaseStatus, CollabRow } from "@/data/case-types";
import { generateFeesForCase, caseHasLinkedFees, type GenerateFeeResult } from "@/lib/generate-case-fees";
import { usePermissions } from "@/hooks/use-permissions";
import { undoStore } from "@/stores/undo-store";
import { useTableContextMenu, TableContextMenuOverlay, type ContextMenuItem } from "@/components/TableContextMenu";

/** Pick the earliest (minimum/soonest) deadline from a set of rows */
function pickEarliestDeadline(rows: CollabRow[], field: "translationDeadline" | "reviewDeadline"): string | null {
  const dates = rows.filter(r => r[field]).map(r => new Date(r[field]!));
  if (dates.length === 0) return null;
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates[0].toISOString();
}

/** Pick the latest (max) deadline from rows */
function pickLatestDeadline(rows: CollabRow[], field: "translationDeadline" | "reviewDeadline"): string | null {
  const dates = rows.filter(r => r[field]).map(r => new Date(r[field]!));
  if (dates.length === 0) return null;
  dates.sort((a, b) => b.getTime() - a.getTime());
  return dates[0].toISOString();
}

function DeadlineText({ value, showIcon }: { value: string | null; showIcon?: boolean }) {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground tabular-nums">
      {formatDateTime(value)}
      {showIcon && <DeadlineProximityIcon deadline={value} />}
    </span>
  );
}

function CollabTranslationDeadlineCell({ collabRows, status }: { collabRows: CollabRow[]; status: string }) {
  const { profile } = useAuth();
  const displayName = profile?.display_name || "";
  const isDraftOrInquiry = status === "draft" || status === "inquiry";
  const showIcon = status === "dispatched";

  if (isDraftOrInquiry) {
    return <DeadlineText value={pickEarliestDeadline(collabRows, "translationDeadline")} />;
  }

  const isTranslator = collabRows.some(r => r.translator === displayName);

  if (isTranslator) {
    const myRows = collabRows.filter(r => r.translator === displayName);
    const myUncompleted = myRows.filter(r => !r.taskCompleted);
    if (myUncompleted.length > 0) {
      return <DeadlineText value={pickEarliestDeadline(myUncompleted, "translationDeadline")} showIcon={showIcon} />;
    }
    return <DeadlineText value={pickLatestDeadline(myRows, "translationDeadline")} showIcon={showIcon} />;
  }

  const uncompleted = collabRows.filter(r => !r.taskCompleted);
  if (uncompleted.length > 0) {
    return <DeadlineText value={pickEarliestDeadline(uncompleted, "translationDeadline")} showIcon={showIcon} />;
  }
  return <DeadlineText value={pickLatestDeadline(collabRows, "translationDeadline")} showIcon={showIcon} />;
}

function CollabReviewDeadlineCell({ collabRows, status }: { collabRows: CollabRow[]; status: string }) {
  const { profile } = useAuth();
  const displayName = profile?.display_name || "";
  const isDraftOrInquiry = status === "draft" || status === "inquiry";
  const showIcon = status === "dispatched" || status === "task_completed";

  if (isDraftOrInquiry) {
    return <DeadlineText value={pickEarliestDeadline(collabRows, "reviewDeadline")} />;
  }

  const isReviewer = collabRows.some(r => r.reviewer === displayName);

  if (isReviewer) {
    const myRows = collabRows.filter(r => r.reviewer === displayName);
    const myUncompleted = myRows.filter(r => !r.delivered);
    if (myUncompleted.length > 0) {
      return <DeadlineText value={pickEarliestDeadline(myUncompleted, "reviewDeadline")} showIcon={showIcon} />;
    }
    return <DeadlineText value={pickLatestDeadline(myRows, "reviewDeadline")} showIcon={showIcon} />;
  }

  const uncompleted = collabRows.filter(r => !r.delivered);
  if (uncompleted.length > 0) {
    return <DeadlineText value={pickEarliestDeadline(uncompleted, "reviewDeadline")} showIcon={showIcon} />;
  }
  return <DeadlineText value={pickLatestDeadline(collabRows, "reviewDeadline")} showIcon={showIcon} />;
}

const caseStatusLabels: Record<CaseStatus, string> = {
  draft: "草稿",
  inquiry: "詢案中",
  dispatched: "已派出",
  task_completed: "任務完成",
  delivered: "已交件",
  feedback: "處理回饋",
  feedback_completed: "回饋處理完畢",
};

function CaseStatusBadge({ status }: { status: CaseStatus }) {
  useSelectOptions("statusLabel");
  const label = caseStatusLabels[status];
  const style = getStatusLabelStyle(label);
  return (
    <Badge
      variant="default"
      className="text-xs whitespace-nowrap border"
      style={{ backgroundColor: style.bgColor, color: style.textColor, borderColor: style.bgColor }}
    >
      {label}
    </Badge>
  );
}

// Timezone-aware formatters: each usage passes userTz from useAuth

interface ColumnDef {
  key: string;
  label: string;
  minWidth: number;
  render: (c: CaseRecord, opts: { editable: boolean; onCommit: (field: string, value: string | boolean | string[]) => void }) => React.ReactNode;
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

function TranslatorAvatarTag({ name }: { name: string }) {
  const { options } = useSelectOptions("assignee");
  const opt = options.find((o) => o.label === name);
  return <AssigneeTag label={name} avatarUrl={opt?.avatarUrl} />;
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
    render: (c, { editable, onCommit }) => (
      <InlineEditCell
        value={c.status}
        type="select"
        options={[
          { value: "draft", label: "草稿" },
          { value: "inquiry", label: "詢案中" },
          { value: "dispatched", label: "已派出" },
          { value: "task_completed", label: "任務完成" },
          { value: "delivered", label: "已交件" },
          { value: "feedback", label: "處理回饋" },
          { value: "feedback_completed", label: "回饋處理完畢" },
        ]}
        editable={editable}
        onCommit={(v) => onCommit("status", v)}
      >
        <CaseStatusBadge status={c.status} />
      </InlineEditCell>
    ),
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
    render: (c, { editable, onCommit }) => (
      <InlineEditCell value={c.workType} type="multiColorSelect" fieldKey="workType" editable={editable} onCommit={(v) => onCommit("workType", v)}>
        <WorkTypeLabels values={c.workType} />
      </InlineEditCell>
    ),
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
    render: (c) => {
      const total = c.workGroups && c.workGroups.length > 0
        ? c.workGroups.reduce((sum, g) => sum + (g.unitCount || 0), 0)
        : c.unitCount || 0;
      return <span className="text-sm tabular-nums">{total || "—"}</span>;
    },
  },
  {
    key: "translator",
    label: "譯者",
    minWidth: 90,
    render: (c, { editable, onCommit }) => {
      const translators = c.translator || [];
      return (
        <InlineEditCell value={translators} type="multiColorSelect" fieldKey="assignee" editable={editable} onCommit={(v) => onCommit("translator", v)}>
          {translators.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {translators.map((name) => (
                <TranslatorAvatarTag key={name} name={name} />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </InlineEditCell>
      );
    },
  },
  {
    key: "translationDeadline",
    label: "翻譯交期",
    minWidth: 110,
    render: (c, { editable, onCommit }) => {
      if (c.multiCollab && c.collabRows?.length > 0) {
        return <CollabTranslationDeadlineCell collabRows={c.collabRows} status={c.status} />;
      }
      const showIcon = c.status === "dispatched";
      return (
        <InlineEditCell value={c.translationDeadline} type="datetime" editable={editable} onCommit={(v) => onCommit("translationDeadline", v)}>
          <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground tabular-nums">
            {formatDateTime(c.translationDeadline)}
            {showIcon && <DeadlineProximityIcon deadline={c.translationDeadline} />}
          </span>
        </InlineEditCell>
      );
    },
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
    render: (c, { editable, onCommit }) => {
      if (c.multiCollab && c.collabRows?.length > 0) {
        return <CollabReviewDeadlineCell collabRows={c.collabRows} status={c.status} />;
      }
      const showIcon = c.status === "dispatched" || c.status === "task_completed";
      return (
        <InlineEditCell value={c.reviewDeadline} type="datetime" editable={editable} onCommit={(v) => onCommit("reviewDeadline", v)}>
          <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground tabular-nums">
            {formatDateTime(c.reviewDeadline)}
            {showIcon && <DeadlineProximityIcon deadline={c.reviewDeadline} />}
          </span>
        </InlineEditCell>
      );
    },
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

const editableFields = new Set(["title", "status", "category", "workType", "billingUnit", "translator", "translationDeadline", "reviewer", "reviewDeadline", "executionTool", "deliveryMethod"]);

export default function CasesPage() {
  const navigate = useNavigate();
  const cases = useCases();
  const allFees = useFees();
  const { isAdmin, user, profile } = useAuth();
  const { checkPerm } = usePermissions();
  const tableViews = useCaseTableViews(user?.id, profile?.display_name || "");
  const { activeView } = tableViews;

  const visibleFees = tableViews.applyFiltersAndSorts(cases);
  const rowSelection = useRowSelection(visibleFees.map((c) => c.id));

  const visibleFieldKeys = caseFieldMetas.map((f) => f.key);

  // Register cases module with global undo store
  useEffect(() => {
    undoStore.registerModule("cases", (change, direction) => {
      if (change.type === "update" && change.fieldChanges) {
        const updates: Record<string, any> = {};
        for (const [field, vals] of Object.entries(change.fieldChanges)) {
          updates[field] = direction === "undo" ? vals.oldValue : vals.newValue;
        }
        caseStore.update(change.recordId, updates);
      } else if (change.type === "delete" && direction === "undo" && change.deletedSnapshot) {
        // Re-create the deleted record
        caseStore.create(change.deletedSnapshot as any);
      } else if (change.type === "create" && direction === "undo") {
        caseStore.remove(change.recordId);
      }
    });
  }, []);

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

  const handleCreate = async (templateValues: Record<string, any> = {}) => {
    const newCase = await caseStore.create({ title: "新案件", ...templateValues });
    if (newCase) navigate(`/cases/${newCase.id}`);
  };

  // Delete with undo support
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [casesDupDialogOpen, setCasesDupDialogOpen] = useState(false);
  const [casesDupInfo, setCasesDupInfo] = useState<{ newTitle: string; renames: { oldTitle: string; newTitle: string }[] } | null>(null);
  const handleDeleteSelected = useCallback(async () => {
    // Snapshot deleted records for undo
    const snapshots: CaseRecord[] = [];
    for (const id of rowSelection.selectedIds) {
      const c = cases.find((x) => x.id === id);
      if (c) snapshots.push({ ...c });
    }
    for (const id of rowSelection.selectedIds) {
      await caseStore.remove(id);
    }
    if (snapshots.length > 0) {
      undoStore.pushDelete("cases", snapshots, `刪除 ${snapshots.length} 個案件`);
    }
    rowSelection.deselectAll();
    setShowDeleteConfirm(false);
  }, [rowSelection, cases]);

  // Generate fees for selected cases
  const [feeGenResult, setFeeGenResult] = useState<{ generated: GenerateFeeResult[]; skipped: { title: string }[] } | null>(null);
  const handleGenerateFees = useCallback(() => {
    const generated: GenerateFeeResult[] = [];
    const skipped: { title: string }[] = [];
    for (const id of rowSelection.selectedIds) {
      const c = cases.find((x) => x.id === id);
      if (!c) continue;
      if (caseHasLinkedFees(c.id)) {
        skipped.push({ title: c.title });
        continue;
      }
      const result = generateFeesForCase(c, profile?.id || "");
      generated.push(result);
    }
    setFeeGenResult({ generated, skipped });
  }, [rowSelection, cases, profile]);

  // Mark selected as delivered with undo
  const handleMarkDelivered = useCallback(async () => {
    const entries: { recordId: string; oldValue: any }[] = [];
    for (const id of rowSelection.selectedIds) {
      const c = cases.find((x) => x.id === id);
      if (c) entries.push({ recordId: id, oldValue: c.status });
      await caseStore.update(id, { status: "delivered" as CaseStatus });
    }
    if (entries.length > 0) {
      undoStore.pushBatchUpdate("cases", entries, "status", "delivered", `將 ${entries.length} 個案件標記為已交件`);
    }
    rowSelection.deselectAll();
  }, [rowSelection, cases]);

  // Batch edit feedback dialog
  const [batchEditResult, setBatchEditResult] = useState<{ field: string; value: string; count: number; locked: { title: string; reason: string }[] } | null>(null);

  // Field label map for batch edit feedback
  const fieldLabelMap: Record<string, string> = {
    title: "案件編號", status: "狀態", category: "類型", billingUnit: "計費單位",
    translator: "譯者", reviewer: "審稿人員", executionTool: "執行工具", deliveryMethod: "交件方式",
    workType: "工作類型",
  };
  const statusLabelMap: Record<string, string> = {
    draft: "草稿", inquiry: "詢案中", dispatched: "已派出", task_completed: "任務完成",
    delivered: "已交件", feedback: "處理回饋", feedback_completed: "回饋處理完畢",
  };

  const handleCellCommit = useCallback((caseId: string, field: string, value: string | boolean | string[] | null) => {
    const isBatch = rowSelection.selectedIds.has(caseId) && rowSelection.selectedCount > 1;
    const targetIds = isBatch ? Array.from(rowSelection.selectedIds) : [caseId];

    const undoEntries: { recordId: string; oldValue: any }[] = [];
    let editedCount = 0;
    const locked: { title: string; reason: string }[] = [];

    for (const id of targetIds) {
      const c = cases.find((x) => x.id === id);
      if (!c) continue;

      const oldValue = (c as any)[field] ?? "";
      undoEntries.push({ recordId: id, oldValue });
      caseStore.update(id, { [field]: value });
      editedCount++;
    }

    // Push undo
    if (undoEntries.length > 0) {
      undoStore.pushBatchUpdate("cases", undoEntries, field, value,
        `更新 ${undoEntries.length} 個案件的${fieldLabelMap[field] || field}`);
    }

    // Show batch feedback dialog when multiple items edited
    if (isBatch) {
      const displayValue = field === "status"
        ? statusLabelMap[String(value)] || String(value)
        : Array.isArray(value) ? value.join(", ") : String(value);
      setBatchEditResult({
        field: fieldLabelMap[field] || field,
        value: displayValue,
        count: editedCount,
        locked,
      });
    }
  }, [rowSelection.selectedIds, rowSelection.selectedCount, cases]);

  // Right-click context menu
  const ctxMenu = useTableContextMenu(rowSelection.selectedIds, rowSelection.setSelectedIds);

  const buildContextMenuItems = useCallback((rowId: string): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    // 複製頁面
    items.push({
      key: "duplicate",
      label: "複製頁面",
      icon: <Copy className="h-4 w-4" />,
      onClick: async () => {
        const ids = rowSelection.selectedIds.has(rowId) ? Array.from(rowSelection.selectedIds) : [rowId];
        // Only duplicate first selected
        const result = await caseStore.duplicate(ids[0]);
        if (result) {
          setCasesDupInfo({ newTitle: result.newCase.title, renames: result.renames });
          setCasesDupDialogOpen(true);
          navigate(`/cases/${result.newCase.id}`);
        }
      },
    });
    // 交件完畢 — PM+ only
    if (isAdmin) {
      items.push({
        key: "markDelivered",
        label: "交件完畢",
        icon: <CheckSquare className="h-4 w-4" />,
        onClick: () => handleMarkDelivered(),
      });
    }
    return items;
  }, [rowSelection.selectedIds, isAdmin, handleMarkDelivered, navigate]);

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
        {isAdmin && (
          <CreateWithTemplateButton
            module="cases"
            onCreate={handleCreate}
            label="新增案件"
          />
        )}
        {/* 交件完畢 button — PM+ only */}
        {isAdmin && rowSelection.selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1"
            onClick={handleMarkDelivered}
          >
            <CheckSquare className="h-4 w-4" />
            交件完畢
          </Button>
        )}
        {activeView.isDefault ? (
          <span className="text-xs text-muted-foreground bg-muted/60 border border-border rounded-md px-2.5 py-1">
            一切檢視設定僅對本人生效
          </span>
        ) : (
          <span className="text-xs text-muted-foreground bg-muted/60 border border-border rounded-md px-2.5 py-1">
            此為自訂視圖，只有新增者本人可見
          </span>
        )}
        {rowSelection.selectedCount > 0 && isAdmin && (
          <>
            <span className="text-xs text-muted-foreground">已選取 {rowSelection.selectedCount} 個項目</span>
            {rowSelection.selectedCount === 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-muted-foreground"
                onClick={async () => {
                  const id = Array.from(rowSelection.selectedIds)[0];
                  const result = await caseStore.duplicate(id);
                  if (result) {
                    setCasesDupInfo({ newTitle: result.newCase.title, renames: result.renames });
                    setCasesDupDialogOpen(true);
                    navigate(`/cases/${result.newCase.id}`);
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                複製本單
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1 text-muted-foreground"
              onClick={handleGenerateFees}
            >
              <FileText className="h-4 w-4" />
              產生費用單
            </Button>
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
        fieldMetasList={caseFieldMetas}
        statusOptionsList={[
          { value: "draft", label: "草稿" },
          { value: "inquiry", label: "詢案中" },
          { value: "dispatched", label: "已派出" },
          { value: "task_completed", label: "任務完成" },
          { value: "delivered", label: "已交件" },
          { value: "feedback", label: "處理回饋" },
          { value: "feedback_completed", label: "回饋處理完畢" },
        ]}
        selectedIds={[...rowSelection.selectedIds]}
        onPinTop={tableViews.pinTop}
        onPinBottom={tableViews.pinBottom}
        onUnpinItem={tableViews.unpinItem}
        pinnedTop={activeView.pinnedTop || []}
        pinnedBottom={activeView.pinnedBottom || []}
      />

      {/* Fixed right-side scroll buttons */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8 bg-card shadow-md" onClick={() => tableContainerRef.current?.scrollTo({ left: 0, behavior: "smooth" })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 bg-card shadow-md" onClick={() => tableContainerRef.current?.scrollTo({ left: tableContainerRef.current.scrollWidth, behavior: "smooth" })}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

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
                  onContextMenu={(e) => ctxMenu.handleContextMenu(e, c.id)}
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
                      className={cn("px-3 py-1.5 overflow-hidden", col.key === "unitCount" && "text-center")}
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
          <TableFooterStats
            itemCount={visibleFees.length}
            orderedCols={orderedCols}
            columnWidths={activeView.columnWidths}
            numericColumns={[
              { key: "unitCount", getValue: (c: CaseRecord) => {
                const total = c.workGroups && c.workGroups.length > 0
                  ? c.workGroups.reduce((sum, g) => sum + (g.unitCount || 0), 0)
                  : c.unitCount || 0;
                return total || null;
              }, isCurrency: false },
            ]}
            data={visibleFees}
          />
        </table>
      </motion.div>

      {/* Delete confirm dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除已選取的 {rowSelection.selectedCount} 個案件嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>確定刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate overlay */}
      <AlertDialog open={casesDupDialogOpen} onOpenChange={setCasesDupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>已複製頁面</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>已複製頁面並切換至新頁面。</p>
                <p>新頁面名稱：<span className="font-medium text-foreground">{casesDupInfo?.newTitle}</span></p>
                {casesDupInfo?.renames && casesDupInfo.renames.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">以下頁面名稱已變更：</p>
                    <ul className="list-disc list-inside text-sm">
                      {casesDupInfo.renames.map((r, i) => (
                        <li key={i}>{r.oldTitle} → {r.newTitle}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCasesDupDialogOpen(false)}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fee generation result dialog */}
      <AlertDialog open={!!feeGenResult} onOpenChange={(open) => { if (!open) setFeeGenResult(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>產生費用單結果</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {feeGenResult?.generated && feeGenResult.generated.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">已成功產生費用單：</p>
                    <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                      {feeGenResult.generated.map((r) => (
                        <li key={r.caseId}>
                          <span className="text-foreground">{r.caseTitle}</span>
                          <span className="text-muted-foreground">（{r.feeCount} 筆）</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {feeGenResult?.skipped && feeGenResult.skipped.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">以下案件已有連結費用頁面，未產生新費用：</p>
                    <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                      {feeGenResult.skipped.map((s, i) => (
                        <li key={i} className="text-muted-foreground">{s.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {feeGenResult?.generated.length === 0 && feeGenResult?.skipped.length === 0 && (
                  <p className="text-muted-foreground">未選取任何案件。</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFeeGenResult(null)}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch edit feedback dialog */}
      <AlertDialog open={!!batchEditResult} onOpenChange={(open) => { if (!open) setBatchEditResult(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批次編輯完成</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  已將 <span className="font-medium text-foreground">{batchEditResult?.count}</span> 個項目的
                  <span className="font-medium text-foreground">「{batchEditResult?.field}」</span>
                  變更為 <span className="font-medium text-foreground">「{batchEditResult?.value}」</span>
                </p>
                {batchEditResult?.locked && batchEditResult.locked.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">以下項目因鎖定而未變更：</p>
                    <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                      {batchEditResult.locked.map((l, i) => (
                        <li key={i} className="text-muted-foreground">{l.title}：{l.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBatchEditResult(null)}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Right-click context menu */}
      <TableContextMenuOverlay
        menu={ctxMenu.menu}
        items={ctxMenu.menu ? buildContextMenuItems(ctxMenu.menu.rowId) : []}
        onClose={ctxMenu.closeMenu}
      />
    </div>
  );
}
