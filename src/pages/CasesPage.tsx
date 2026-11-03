import { useNavigate } from "react-router-dom";
import { TableFooterStats, type NumericColumnConfig } from "@/components/TableFooterStats";
import { Plus, GripVertical, ExternalLink, Trash2, Copy, FileText, CheckSquare, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultilineInput } from "@/components/ui/multiline-input";
import DateTimePicker from "@/components/DateTimePicker";
import { CreateWithTemplateButton } from "@/components/CreateWithTemplateButton";
import { useAuth } from "@/hooks/use-auth";
import { DeadlineProximityIcon } from "@/components/DeadlineProximityIcon";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { TableRowSelectCheckbox } from "@/components/ui/checkbox-patterns";
import { formatDateTz as formatDate, formatDateTimeTz as formatDateTime } from "@/lib/format-timestamp";
import { useCases, useCaseStoreReady, useCaseStoreLoadError, caseStore } from "@/hooks/use-case-store";
import { useFees } from "@/hooks/use-fee-store";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useCaseTableViews, caseFieldMetas } from "@/hooks/use-case-table-views";
import { CASE_TABLE_MANAGER_ONLY_KEYS } from "@/lib/case-table-field-visibility";
import { FilterSortToolbar } from "@/components/fees/FilterSortToolbar";
import { InlineEditCell } from "@/components/fees/InlineEditCell";
import { useSelectOptions, getStatusLabelStyle } from "@/stores/select-options-store";
import type { CaseAssignmentMeta } from "@/lib/case-assignment-patch";
import { useLabelStyles } from "@/stores/label-style-store";
import AssigneeTag from "@/components/AssigneeTag";
import { useState, useRef, useCallback, useEffect, useMemo, useDeferredValue } from "react";
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
import { UiToolbarButtonIcon } from "@/lib/ui-button-icon-render";
import { useToolbarButtonUiProps, useUiButtonLabel } from "@/stores/ui-button-style-store";
import type { CaseRecord, CaseStatus, CollabRow, DeclineRecord } from "@/data/case-types";
import { caseListReviewerPeople, hasReviewRowArrangement, pickReviewDeadlineForList } from "@/lib/review-rows";
import {
  buildCaseTableCellPartial,
  buildCaseTableUndoFieldChanges,
  caseTableBatchDialogTitle,
  classifyAfterReadback,
  classifyCaseTableWriteResult,
  describeCaseTableItemReason,
  describeCaseWriteFailure,
  isCaseTableCellUnchanged,
  isUnknownCaseWriteError,
  summarizeCaseTableBatchWrites,
  type CaseTableWriteItemResult,
} from "@/lib/case-table-cell-write";
import { caseListTranslatorPeople, hasCollabTranslatorArrangement } from "@/lib/collab-translator-list";
import CaseListPeopleCell from "@/components/cases/CaseListPeopleCell";
import type { TemplateFieldValue } from "@/stores/page-template-store";
import { generateFeesForCase, caseHasLinkedFees, type GenerateFeeResult } from "@/lib/generate-case-fees";
import { usePermissions } from "@/hooks/use-permissions";
import { undoStore } from "@/stores/undo-store";
import { useTableContextMenu, TableContextMenuOverlay, type ContextMenuItem } from "@/components/TableContextMenu";
import { InquirySlackDialog } from "@/components/InquirySlackDialog";
import { needsDuplicateSortDialog, DEFAULT_DUPLICATE_SORT, findDuplicateTitleCase } from "@/lib/case-title-duplicate";
import type { CaseDuplicateOutcome, CaseDuplicateSort } from "@/stores/case-store";
import { DuplicateCaseSortDialog } from "@/components/DuplicateCaseSortDialog";
import { copyMultipleCaseInquiryMessagesToClipboard } from "@/lib/copy-case-inquiry-message";
import { CasesListSingleCaseFlowButtons } from "@/components/cases/CasesListSingleCaseFlowButtons";
import { toast } from "@/hooks/use-toast";
import { pendingDuplicateToolsMessageTestId } from "@/lib/case-duplicate-tools";
import { createdCaseNavigationState, feedbackForCaseCreateOutcome } from "@/lib/case-create-outcome";
import { maybeSendTranslatorCaseReplySlack } from "@/lib/slack-case-reply-notify";
import { OptionLabelBadge } from "@/components/OptionLabelBadge";
import { listActiveTranslatorParticipantIds } from "@/lib/case-action-rpc";
import {
  describeTaskCompleteFailure,
  resolveTaskCompleteActorKind,
  shouldNotifyTranslatorTaskComplete,
  shouldOfferTaskCompleteButton,
} from "@/lib/case-task-complete-access";
import { supabase } from "@/integrations/supabase/client";

function getTodayYYMMDD(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

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
  const showIcon = !isDraftOrInquiry && status !== "task_completed" && status !== "delivered";

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

function ReviewDeadlineListCell({
  caseRecord,
  editable,
  onCommit,
}: {
  caseRecord: CaseRecord;
  editable: boolean;
  onCommit: (v: string) => void;
}) {
  const value = pickReviewDeadlineForList({
    reviewRows: caseRecord.reviewRows,
    fallbackDeadline: caseRecord.reviewDeadline,
  });
  const showIcon =
    caseRecord.status !== "draft" &&
    caseRecord.status !== "inquiry" &&
    caseRecord.status !== "delivered";
  const hasReviewRows = hasReviewRowArrangement(caseRecord.reviewRows);
  const display = (
    <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground tabular-nums">
      {formatDateTime(value)}
      {showIcon && <DeadlineProximityIcon deadline={value} />}
    </span>
  );
  if (hasReviewRows) return display;
  return (
    <InlineEditCell value={caseRecord.reviewDeadline} type="datetime" editable={editable} onCommit={onCommit}>
      {display}
    </InlineEditCell>
  );
}

const caseTableFieldLabels: Record<string, string> = {
  title: "案件編號", status: "狀態", category: "類型", billingUnit: "計費單位",
  translator: "譯者", reviewer: "審稿人員", executionTool: "執行工具", deliveryMethod: "交件方式",
  workType: "工作類型",
};

const caseTableStatusLabels: Record<string, string> = {
  draft: "草稿", inquiry: "詢案中", dispatched: "已派出", task_completed: "任務完成",
  delivered: "已交件", feedback: "處理回饋", feedback_completed: "回饋處理完畢",
};

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
  render: (c: CaseRecord, opts: { editable: boolean; onCommit: (field: string, value: string | boolean | string[] | null, meta?: CaseAssignmentMeta) => void }) => React.ReactNode;
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

function AssigneeLabelById({ id }: { id: string }) {
  const { options } = useSelectOptions("assignee");
  if (!id) return <span className="text-sm text-muted-foreground">—</span>;
  const opt = options.find((o) => o.id === id);
  return <AssigneeTag label={opt?.label || id} avatarUrl={opt?.avatarUrl} />;
}

function OpenButton({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(`/cases/${caseId}`); }}
      onMouseDown={(e) => e.stopPropagation()}
      data-testid="case-list-open"
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
    render: (c, { editable, onCommit }) => {
      // Unique translators who declined
      const declineNames = Array.from(new Set((c.declineRecords || []).map((d: DeclineRecord) => d.translator).filter(Boolean)));
      const declineCount = declineNames.length;
      return (
        <div className="relative flex items-center group/title gap-1.5">
          {c.iconUrl && (
            <img src={c.iconUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0 border border-border" />
          )}
          {declineCount > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/15 text-[11px] font-semibold text-destructive cursor-default">
                    {declineCount}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs font-medium mb-0.5">無法承接</p>
                  {declineNames.map((name, i) => (
                    <p key={i} className="text-xs">{name}</p>
                  ))}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <InlineEditCell value={c.title} type="text" editable={editable} onCommit={(v) => onCommit("title", v)} className="flex-1 min-w-0 pr-6">
            <span className="truncate font-medium text-card-foreground">
              {c.title || <span className="text-muted-foreground italic">未命名案件</span>}
            </span>
          </InlineEditCell>
          <OpenButton caseId={c.id} />
        </div>
      );
    },
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
    minWidth: 148,
    render: (c, { editable, onCommit }) => {
      const people = caseListTranslatorPeople({
        collabRows: c.collabRows,
        translator: c.translator,
      });
      const canEditFromList = editable && !hasCollabTranslatorArrangement(c.collabRows);
      const editorValue = (c.translator || [])[0] || "";
      return (
        <InlineEditCell
          value={editorValue}
          type="colorSelect"
          fieldKey="assignee"
          editable={canEditFromList}
          lockedTooltip={hasCollabTranslatorArrangement(c.collabRows) ? "此案件有分段譯者，請到案件頁修改" : undefined}
          assigneeRole="translator"
          onCommit={(v, meta) => onCommit("translator", v ? [String(v)] : [], meta)}
        >
          <CaseListPeopleCell people={people} />
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
      const showIcon =
        c.status !== "draft" &&
        c.status !== "inquiry" &&
        c.status !== "task_completed" &&
        c.status !== "delivered";
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
    minWidth: 148,
    render: (c, { editable, onCommit }) => {
      const canEditFromList = editable && !hasReviewRowArrangement(c.reviewRows);
      return (
        <InlineEditCell
          value={c.reviewer}
          type="colorSelect"
          fieldKey="assignee"
          assigneeRole="reviewer"
          editable={canEditFromList}
          lockedTooltip={hasReviewRowArrangement(c.reviewRows) ? "此案件有分段審稿，請到案件頁修改" : undefined}
          onCommit={(v, meta) => onCommit("reviewer", v, meta)}
        >
          <CaseListPeopleCell people={caseListReviewerPeople({ reviewRows: c.reviewRows, reviewer: c.reviewer })} />
        </InlineEditCell>
      );
    },
  },
  {
    key: "reviewDeadline",
    label: "審稿交期",
    minWidth: 110,
    render: (c, { editable, onCommit }) => (
      <ReviewDeadlineListCell
        caseRecord={c}
        editable={editable}
        onCommit={(v) => onCommit("reviewDeadline", v)}
      />
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
    key: "createdBy",
    label: "建立者",
    minWidth: 90,
    render: (c) => <AssigneeLabelById id={c.createdBy || ""} />,
  },
  {
    key: "client",
    label: "客戶",
    minWidth: 90,
    render: (c) => <OptionLabelBadge fieldKey="client" value={c.client || ""} />,
  },
  {
    key: "dispatchRoute",
    label: "派案途徑",
    minWidth: 90,
    render: (c) => <OptionLabelBadge fieldKey="dispatchRoute" value={c.dispatchRoute || ""} />,
  },
  {
    key: "contact",
    label: "聯絡人",
    minWidth: 100,
    render: (c) => <OptionLabelBadge fieldKey="contact" value={c.contact || ""} />,
  },
  {
    key: "keyword",
    label: "關鍵字",
    minWidth: 110,
    render: (c) => <span className="text-sm text-muted-foreground truncate">{c.keyword || "—"}</span>,
  },
  {
    key: "clientPoNumber",
    label: "客戶 PO#",
    minWidth: 100,
    render: (c) => <span className="text-sm text-muted-foreground truncate">{c.clientPoNumber || "—"}</span>,
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
  const casesReady = useCaseStoreReady();
  const casesLoadError = useCaseStoreLoadError();
  const allFees = useFees();
  const { user, profile, primaryRole } = useAuth();
  const isPmOrAbove = primaryRole === "pm" || primaryRole === "executive";
  const isTranslatorRole = primaryRole === "member";
  const { checkPerm } = usePermissions();
  const [selectedActiveTranslatorUserIds, setSelectedActiveTranslatorUserIds] = useState<string[]>([]);
  const [creatingCase, setCreatingCase] = useState(false);
  const creatingCaseRef = useRef(false);
  const tableViews = useCaseTableViews(user?.id, profile?.display_name || "");
  const { activeView } = tableViews;

  const visibleFees = tableViews.applyFiltersAndSorts(cases);
  const deferredVisibleFees = useDeferredValue(visibleFees);
  const rowSelection = useRowSelection(visibleFees.map((c) => c.id));

  const selectedCasesForSlack = useMemo(
    () => visibleFees.filter((c) => rowSelection.selectedIds.has(c.id)),
    [visibleFees, rowSelection.selectedIds]
  );

  /** 與案件個別頁相同：僅在「任務完成」或「回饋處理完畢」時顯示交件完畢（PM／執行長） */
  const canShowMarkDeliveredBulk = useMemo(() => {
    if (!isPmOrAbove || rowSelection.selectedCount < 2) return false;
    for (const id of rowSelection.selectedIds) {
      const c = cases.find((x) => x.id === id);
      if (!c) return false;
      if (c.status !== "task_completed" && c.status !== "feedback_completed") return false;
    }
    return true;
  }, [isPmOrAbove, rowSelection.selectedIds, rowSelection.selectedCount, cases]);

  const selectedSingleCase = useMemo(() => {
    if (rowSelection.selectedCount !== 1) return null;
    const id = Array.from(rowSelection.selectedIds)[0];
    return cases.find((c) => c.id === id) ?? null;
  }, [rowSelection.selectedCount, rowSelection.selectedIds, cases]);

  // 任務完成授權以 case_participants 為準；顯示名不得當授權來源。
  useEffect(() => {
    const caseId = selectedSingleCase?.id;
    if (!caseId) {
      setSelectedActiveTranslatorUserIds([]);
      return;
    }
    let cancelled = false;
    void listActiveTranslatorParticipantIds(supabase, caseId).then(({ data }) => {
      if (!cancelled) setSelectedActiveTranslatorUserIds(data);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSingleCase?.id, selectedSingleCase?.revision, selectedSingleCase?.status]);

  const offerSelectedTaskComplete = shouldOfferTaskCompleteButton(
    resolveTaskCompleteActorKind({
      isPmOrAbove,
      viewerUserId: user?.id,
      activeTranslatorUserIds: selectedActiveTranslatorUserIds,
    }),
  );

  const visibleFieldKeys = caseFieldMetas
    .filter((f) => !CASE_TABLE_MANAGER_ONLY_KEYS.has(f.key) || isPmOrAbove)
    .map((f) => f.key);
  const permittedFieldKeys = useMemo(() =>
    caseFieldMetas
      .filter((f) => !CASE_TABLE_MANAGER_ONLY_KEYS.has(f.key) || isPmOrAbove)
      .filter((f) => checkPerm("case_management", `table_field_${f.key}`, "view"))
      .map((f) => f.key),
    [checkPerm, isPmOrAbove]
  );

  const uiMarkDelivered = useToolbarButtonUiProps("cases_mark_delivered");
  const uiSlack = useToolbarButtonUiProps("cases_slack");
  const uiCopy = useToolbarButtonUiProps("cases_copy");
  const uiGenFees = useToolbarButtonUiProps("cases_gen_fees");
  const uiInquiryMsg = useToolbarButtonUiProps("cases_inquiry_message");
  const lbMarkDelivered = useUiButtonLabel("cases_mark_delivered") ?? "交件完畢";
  const lbSlack = useUiButtonLabel("cases_slack") ?? "Slack 詢案";
  const lbCopy = useUiButtonLabel("cases_copy") ?? "複製本頁";
  const lbGenFees = useUiButtonLabel("cases_gen_fees") ?? "產生費用單";
  const lbInquiryMsg = useUiButtonLabel("cases_inquiry_message") ?? "詢案訊息";

  // Register cases module with global undo store
  useEffect(() => {
    undoStore.registerModule("cases", async (change, direction) => {
      if (change.type === "update" && change.fieldChanges) {
        const updates: Record<string, unknown> = {};
        for (const [field, vals] of Object.entries(change.fieldChanges)) {
          updates[field] = direction === "undo" ? vals.oldValue : vals.newValue;
        }
        const error = await caseStore.update(change.recordId, updates as Partial<CaseRecord>);
        if (error) {
          const feedback = describeCaseWriteFailure(error);
          toast({ title: "復原未寫入", description: feedback.description, variant: "destructive" });
        }
      } else if (change.type === "delete" && direction === "undo" && change.deletedSnapshot) {
        await caseStore.create(change.deletedSnapshot as Partial<CaseRecord>);
      } else if (change.type === "create" && direction === "undo") {
        await caseStore.remove(change.recordId);
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

  const handleCreate = async (templateValues: Record<string, TemplateFieldValue> = {}) => {
    // 防連點：建案在途時忽略後續點擊，避免結果不明時多建一筆。
    if (creatingCaseRef.current) return;
    creatingCaseRef.current = true;
    setCreatingCase(true);
    try {
      const outcome = await caseStore.createWithOutcome({ title: "新案件", ...templateValues });
      const feedback = feedbackForCaseCreateOutcome({
        kind: outcome.kind,
        caseId: outcome.kind === "no_session" ? undefined : outcome.id,
        errorCode: outcome.kind === "create_failed" ? outcome.errorCode : undefined,
        omittedAssignmentLabels: outcome.kind === "created" ? outcome.omittedAssignmentLabels : undefined,
      });
      if (feedback.navigateToCase && outcome.kind === "created") {
        navigate(`/cases/${outcome.id}`, { state: createdCaseNavigationState(feedback) });
        return;
      }
      toast({
        title: feedback.title,
        description: feedback.description,
        variant: feedback.variant,
      });
    } catch {
      toast({
        title: "建案結果不明",
        description: "目前無法確認是否已建立。請不要再按一次新增，重新整理列表確認後再決定。",
        variant: "destructive",
      });
    } finally {
      creatingCaseRef.current = false;
      setCreatingCase(false);
    }
  };

  // Delete with undo support
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [inquirySlackOpen, setInquirySlackOpen] = useState(false);
  const [casesDupDialogOpen, setCasesDupDialogOpen] = useState(false);
  const [casesDupSortOpen, setCasesDupSortOpen] = useState(false);
  const [pendingDuplicateId, setPendingDuplicateId] = useState<string | null>(null);
  const [casesDupInfo, setCasesDupInfo] = useState<{
    newTitle: string;
    newCaseId: string;
    renames: { oldTitle: string; newTitle: string }[];
    feePatchCount: number;
    translatorInvoicePatchCount: number;
    clientInvoicePatchCount: number;
    toolsPending: boolean;
    toolsMessage?: string;
  } | null>(null);
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

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineProposedDeadline, setDeclineProposedDeadline] = useState<string | null>(null);
  const [declineAvailableCount, setDeclineAvailableCount] = useState("");
  const [declineMessage, setDeclineMessage] = useState("");
  const [deleteDraftFlowOpen, setDeleteDraftFlowOpen] = useState(false);

  const assertPublishUniqueTitle = useCallback((c: CaseRecord) => {
    const dup = findDuplicateTitleCase(c.id, c.title, caseStore.getAll());
    if (!dup) return true;
    const t = dup.title.trim();
    toast({ title: "無法公布", description: `已有其他案件使用相同標題「${t}」。請先修改標題。`, variant: "destructive" });
    return false;
  }, []);

  const handleFlowPublishSingle = useCallback(async () => {
    if (!selectedSingleCase) return;
    if (!assertPublishUniqueTitle(selectedSingleCase)) return;
    const error = await caseStore.update(selectedSingleCase.id, { status: "inquiry" as CaseStatus });
    if (error) {
      toast({ title: "無法公布", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "案件已公布" });
  }, [selectedSingleCase, assertPublishUniqueTitle]);

  const persistFlowUpdate = useCallback(async (
    id: string,
    partial: Partial<CaseRecord>,
    successTitle: string,
    failTitle: string,
  ) => {
    const error = await caseStore.update(id, partial);
    if (error) {
      const feedback = describeCaseWriteFailure(error);
      toast({ title: failTitle, description: feedback.description, variant: "destructive" });
      return false;
    }
    toast({ title: successTitle });
    return true;
  }, []);

  const handleFlowRevertToDraft = useCallback(async () => {
    if (!selectedSingleCase) return;
    await persistFlowUpdate(selectedSingleCase.id, { status: "draft" as CaseStatus }, "已收回為草稿", "無法收回為草稿");
  }, [selectedSingleCase, persistFlowUpdate]);

  const handleFlowCancelDispatch = useCallback(async () => {
    if (!selectedSingleCase) return;
    await persistFlowUpdate(selectedSingleCase.id, { status: "inquiry" as CaseStatus }, "已取消指派", "無法取消指派");
  }, [selectedSingleCase, persistFlowUpdate]);

  const handleFlowRevertRevision = useCallback(async () => {
    if (!selectedSingleCase) return;
    const rows = selectedSingleCase.collabRows ?? [];
    const partial = selectedSingleCase.multiCollab && rows.length > 0
      ? { status: "dispatched" as CaseStatus, collabRows: rows.map((r) => ({ ...r, taskCompleted: false, delivered: false })) }
      : { status: "dispatched" as CaseStatus };
    await persistFlowUpdate(selectedSingleCase.id, partial, "已退回修正", "無法退回修正");
  }, [selectedSingleCase, persistFlowUpdate]);

  const handleFlowRevertToFeedback = useCallback(async () => {
    if (!selectedSingleCase) return;
    await persistFlowUpdate(selectedSingleCase.id, { status: "feedback" as CaseStatus }, "已退回處理", "無法退回處理");
  }, [selectedSingleCase, persistFlowUpdate]);

  const handleFlowAcceptCase = useCallback(async () => {
    if (!selectedSingleCase) return;
    const error = await caseStore.acceptPublicInquiry(selectedSingleCase.id);
    if (error) {
      toast({ title: "無法承接", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已承接本案" });
    if (user?.id) {
      void maybeSendTranslatorCaseReplySlack({
        userId: user.id,
        slackMessageDefaults: profile?.slack_message_defaults,
        caseId: selectedSingleCase.id,
        caseTitle: selectedSingleCase.title || "",
        kind: "accept",
      });
    }
  }, [selectedSingleCase, profile, user]);

  const handleFlowFinalizeAssign = useCallback(async () => {
    if (!selectedSingleCase) return;
    await caseStore.flushWrites(selectedSingleCase.id);
    if (!selectedSingleCase.multiCollab) {
      const { data: ids, error } = await listActiveTranslatorParticipantIds(
        supabase,
        selectedSingleCase.id,
      );
      if (error) {
        toast({ title: "無法確認譯者授權", description: error.message, variant: "destructive" });
        return;
      }
      if (ids.length === 0) {
        toast({
          title: "無法確定指派",
          description: "單檔派出前須先以可信帳號指派譯者（不可僅有顯示名）。",
          variant: "destructive",
        });
        return;
      }
    }
    const error = await caseStore.update(selectedSingleCase.id, {
      status: "dispatched" as CaseStatus,
    });
    if (error) {
      toast({ title: "無法確定指派", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已確定指派" });
  }, [selectedSingleCase]);

  const handleFlowTaskComplete = useCallback(async () => {
    if (!selectedSingleCase) return;
    const kind = resolveTaskCompleteActorKind({
      isPmOrAbove,
      viewerUserId: user?.id,
      activeTranslatorUserIds: selectedActiveTranslatorUserIds,
    });
    if (kind === "none") {
      toast({
        title: "無法完成任務",
        description: "您不是本案有效受派譯者，也不是可代完成的管理者。",
        variant: "destructive",
      });
      return;
    }
    const error =
      kind === "manager"
        ? await caseStore.pmCompleteCaseTranslation(selectedSingleCase.id)
        : await caseStore.completeCaseTranslation(selectedSingleCase.id);
    if (error) {
      toast({
        title: "無法完成任務",
        description: describeTaskCompleteFailure({
          kind,
          code: (error as { code?: string }).code ?? "",
          message: error.message,
        }),
        variant: "destructive",
      });
      return;
    }
    toast({ title: kind === "manager" ? "已由管理身分代為完成" : "任務已完成" });
    if (shouldNotifyTranslatorTaskComplete(kind) && user?.id) {
      void maybeSendTranslatorCaseReplySlack({
        userId: user.id,
        slackMessageDefaults: profile?.slack_message_defaults,
        caseId: selectedSingleCase.id,
        caseTitle: selectedSingleCase.title || "",
        kind: "task_complete",
      });
    }
  }, [selectedSingleCase, profile, user, isPmOrAbove, selectedActiveTranslatorUserIds]);

  const handleFlowFeedbackComplete = useCallback(async () => {
    if (!selectedSingleCase) return;
    await persistFlowUpdate(selectedSingleCase.id, { status: "feedback_completed" as CaseStatus }, "回饋處理完畢", "無法完成回饋處理");
  }, [selectedSingleCase, persistFlowUpdate]);

  const handleFlowMarkDelivered = useCallback(async () => {
    if (!selectedSingleCase) return;
    const rows = selectedSingleCase.collabRows ?? [];
    const partial = selectedSingleCase.multiCollab && rows.length > 0
      ? { status: "delivered" as CaseStatus, collabRows: rows.map((r) => ({ ...r, delivered: true })) }
      : { status: "delivered" as CaseStatus };
    await persistFlowUpdate(selectedSingleCase.id, partial, "已交件完畢", "無法交件完畢");
  }, [selectedSingleCase, persistFlowUpdate]);

  const handleFlowFeedbackOpen = useCallback(async () => {
    if (!selectedSingleCase) return;
    await persistFlowUpdate(selectedSingleCase.id, { status: "feedback" as CaseStatus }, "處理回饋中", "無法改為處理回饋");
  }, [selectedSingleCase, persistFlowUpdate]);

  const handleDeclineConfirm = useCallback(async () => {
    if (!selectedSingleCase) return;
    const decline = {
      proposedDeadline: declineProposedDeadline || undefined,
      availableCount: declineAvailableCount ? Number(declineAvailableCount) : undefined,
      message: declineMessage.trim() || undefined,
    };
    const error = await caseStore.declinePublicInquiry(selectedSingleCase.id, decline);
    if (error) {
      toast({ title: "無法記錄", description: error.message, variant: "destructive" });
      return;
    }
    const caseId = selectedSingleCase.id;
    const caseTitle = selectedSingleCase.title || "";
    setDeclineOpen(false);
    setDeclineProposedDeadline(null);
    setDeclineAvailableCount("");
    setDeclineMessage("");
    toast({ title: "已記錄無法承接" });
    if (user?.id) {
      void maybeSendTranslatorCaseReplySlack({
        userId: user.id,
        slackMessageDefaults: profile?.slack_message_defaults,
        caseId,
        caseTitle,
        kind: "decline",
        decline,
      });
    }
  }, [selectedSingleCase, profile, declineProposedDeadline, declineAvailableCount, declineMessage, user]);

  const handleDeleteDraftFlow = useCallback(async () => {
    if (!selectedSingleCase) return;
    const id = selectedSingleCase.id;
    const snap = { ...selectedSingleCase };
    await caseStore.remove(id);
    undoStore.pushDelete("cases", [snap], "刪除案件");
    rowSelection.deselectAll();
    setDeleteDraftFlowOpen(false);
    toast({ title: "已刪除案件" });
  }, [selectedSingleCase, rowSelection]);

  const runCasesDuplicate = useCallback(
    async (id: string, sort: CaseDuplicateSort) => {
      const result: CaseDuplicateOutcome = await caseStore.duplicate(id, sort);
      if (result.created === false) {
        toast({
          title: result.reason === "create_unknown" ? "建案結果未知" : "無法複製",
          description: result.message,
          variant: "destructive",
        });
        return;
      }
      setCasesDupInfo({
        newTitle: result.newCase.title,
        newCaseId: result.newCase.id,
        renames: result.renames,
        feePatchCount: result.feePatches.length,
        translatorInvoicePatchCount: result.translatorInvoicePatches.length,
        clientInvoicePatchCount: result.clientInvoicePatches.length,
        toolsPending: result.ok === false,
        toolsMessage: result.ok === false ? result.message : undefined,
      });
      setCasesDupDialogOpen(true);
      // 新案資料還讀不回來時留在清單頁：避免跳到讀不到的案件頁而看不見新案識別與未完成說明。
      if (caseStore.getById(result.newCase.id)) {
        navigate(`/cases/${result.newCase.id}`, {
          state: { autoFocusTitle: true, duplicateExpectedTitle: result.newCase.title },
        });
      }
      if (result.ok === false) {
        toast({
          title: "案件已建立，工具未完成",
          description: result.message,
          variant: "destructive",
        });
      }
    },
    [navigate]
  );

  const beginDuplicate = useCallback(
    (id: string) => {
      const row = cases.find((c) => c.id === id);
      if (!row) return;
      const todayStr = getTodayYYMMDD();
      if (needsDuplicateSortDialog(row.title, todayStr, caseStore.getAll())) {
        setPendingDuplicateId(id);
        setCasesDupSortOpen(true);
        return;
      }
      void runCasesDuplicate(id, DEFAULT_DUPLICATE_SORT);
    },
    [cases, runCasesDuplicate]
  );

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

  const handleCopyInquiryMessages = useCallback(() => {
    if (rowSelection.selectedCount === 0) return;
    const idSet = rowSelection.selectedIds;
    const ordered = visibleFees.filter((c) => idSet.has(c.id));
    copyMultipleCaseInquiryMessagesToClipboard(
      ordered.map((c) => ({ id: c.id, title: c.title || "（無標題）" }))
    );
  }, [visibleFees, rowSelection.selectedCount, rowSelection.selectedIds]);

  const [tableSavePending, setTableSavePending] = useState(0);

  // Mark selected as delivered with undo
  const handleMarkDelivered = useCallback(async () => {
    setTableSavePending((n) => n + 1);
    try {
      const successEntries: { recordId: string; oldValue: unknown }[] = [];
      const failed: { title: string; reason: string }[] = [];
      const keepSelected = new Set<string>();
      for (const id of rowSelection.selectedIds) {
        const c = cases.find((x) => x.id === id);
        if (!c) continue;
        if (c.status === "delivered") continue;
        const error = await caseStore.update(id, { status: "delivered" as CaseStatus });
        if (error) {
          failed.push({
            title: c.title || "（無標題）",
            reason: describeCaseTableItemReason(classifyCaseTableWriteResult(error), error),
          });
          keepSelected.add(id);
          continue;
        }
        successEntries.push({ recordId: id, oldValue: c.status });
      }
      if (successEntries.length > 0) {
        undoStore.pushBatchUpdate(
          "cases",
          successEntries,
          "status",
          "delivered",
          `將 ${successEntries.length} 個案件標記為已交件`,
        );
      }
      if (failed.length > 0) {
        toast({
          title: "部分案件未能交件完畢",
          description: failed.map((item) => `${item.title}：${item.reason}`).join("；"),
          variant: "destructive",
        });
        rowSelection.setSelectedIds(keepSelected);
      } else {
        rowSelection.deselectAll();
      }
    } finally {
      setTableSavePending((n) => Math.max(0, n - 1));
    }
  }, [rowSelection, cases]);

  // Batch edit feedback dialog
  const [batchEditResult, setBatchEditResult] = useState<{
    field: string;
    value: string;
    title: string;
    successCount: number;
    unchangedCount: number;
    failed: { title: string; reason: string }[];
    unknown: { title: string; reason: string }[];
    locked: { title: string; reason: string }[];
  } | null>(null);

  const handleCellCommit = useCallback(async (
    caseId: string,
    field: string,
    value: string | boolean | string[] | null,
    meta?: CaseAssignmentMeta,
  ) => {
    const isBatch = rowSelection.selectedIds.has(caseId) && rowSelection.selectedCount > 1;
    const targetIds = isBatch ? Array.from(rowSelection.selectedIds) : [caseId];
    const items: CaseTableWriteItemResult[] = [];
    const locked: { title: string; reason: string }[] = [];
    const undoChanges: { recordId: string; fieldChanges: Record<string, { oldValue: unknown; newValue: unknown }> }[] = [];

    setTableSavePending((n) => n + 1);
    try {
      for (const id of targetIds) {
        const c = cases.find((x) => x.id === id);
        if (!c) continue;
        const title = c.title || "（無標題）";

        if (field === "translator" && hasCollabTranslatorArrangement(c.collabRows)) {
          locked.push({ title, reason: "此案件有分段譯者，請到案件頁修改" });
          continue;
        }
        if (field === "reviewer" && hasReviewRowArrangement(c.reviewRows)) {
          locked.push({ title, reason: "此案件有分段審稿，請到案件頁修改" });
          continue;
        }
        if (isCaseTableCellUnchanged(c, field, value, meta)) {
          items.push({ id, title, kind: "unchanged", reason: describeCaseTableItemReason("unchanged") });
          continue;
        }

        const patch = buildCaseTableCellPartial(field, value, meta);
        const error = await caseStore.update(id, patch);
        let kind = classifyCaseTableWriteResult(error);
        if (kind === "unknown" || (error && isUnknownCaseWriteError(error))) {
          const readback = await caseStore.reloadCaseFull(id);
          kind = classifyAfterReadback({
            writeError: error,
            intended: patch as Record<string, unknown>,
            live: readback.ok ? readback.record : null,
            readbackOk: readback.ok,
          });
        }
        const reason = describeCaseTableItemReason(kind, error);
        items.push({ id, title, kind, reason });
        if (kind === "success") {
          undoChanges.push({
            recordId: id,
            fieldChanges: buildCaseTableUndoFieldChanges(field, c, value, meta),
          });
        }
      }

      if (undoChanges.length > 0) {
        undoStore.push({
          label: `更新 ${undoChanges.length} 個案件的${caseTableFieldLabels[field] || field}`,
          changes: undoChanges.map((entry) => ({
            module: "cases",
            recordId: entry.recordId,
            type: "update" as const,
            fieldChanges: entry.fieldChanges,
          })),
        });
      }

      if (isBatch) {
        const displayValue = field === "status"
          ? caseTableStatusLabels[String(value)] || String(value)
          : Array.isArray(value) ? value.join(", ") : String(value ?? "");
        const summary = summarizeCaseTableBatchWrites(items);
        setBatchEditResult({
          field: caseTableFieldLabels[field] || field,
          value: displayValue,
          title: caseTableBatchDialogTitle(summary),
          successCount: summary.successCount,
          unchangedCount: summary.unchangedCount,
          failed: [
            ...locked,
            ...items.filter((item) => item.kind === "failed").map((item) => ({
              title: item.title,
              reason: item.reason || "儲存失敗",
            })),
          ],
          unknown: items.filter((item) => item.kind === "unknown").map((item) => ({
            title: item.title,
            reason: item.reason || "結果不明",
          })),
          locked,
        });
      } else {
        const only = items[0];
        if (only?.kind === "failed") {
          toast({ title: "尚未寫入", description: only.reason, variant: "destructive" });
        } else if (only?.kind === "unknown") {
          toast({ title: "儲存結果不明", description: only.reason, variant: "destructive" });
        } else if (locked[0]) {
          toast({ title: "此欄不能從總表修改", description: locked[0].reason });
        }
      }
    } finally {
      setTableSavePending((n) => Math.max(0, n - 1));
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
      onClick: () => {
        const ids = rowSelection.selectedIds.has(rowId) ? Array.from(rowSelection.selectedIds) : [rowId];
        beginDuplicate(ids[0]);
      },
    });
    // 交件完畢 — PM+ only
    if (isPmOrAbove) {
      items.push({
        key: "markDelivered",
        label: "交件完畢",
        icon: <CheckSquare className="h-4 w-4" />,
        onClick: () => handleMarkDelivered(),
      });
    }
    return items;
  }, [rowSelection.selectedIds, isPmOrAbove, handleMarkDelivered, beginDuplicate]);

  // Ordered visible columns（§9.2：譯者排除 manager-only 欄）
  const hiddenSet = new Set(activeView.hiddenColumns || []);
  const permittedColSet = new Set(permittedFieldKeys);
  const orderedCols = activeView.columnOrder
    .map((key) => allColumnDefs.find((c) => c.key === key))
    .filter((c): c is ColumnDef => !!c && !hiddenSet.has(c.key) && permittedColSet.has(c.key));
  for (const col of allColumnDefs) {
    if (
      !activeView.columnOrder.includes(col.key) &&
      !hiddenSet.has(col.key) &&
      permittedColSet.has(col.key)
    ) {
      orderedCols.push(col);
    }
  }
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

  if (!casesReady) {
    return (
      <div className="mx-auto flex max-w-7xl min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          載入案件中…（新裝置／新瀏覽器或案件很多時，第一次開此頁可能需數秒，請勿關閉分頁）
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {casesLoadError ? (
        <div
          data-testid="cases-list-load-error"
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
        >
          <p>案件清單載入失敗。已保留先前資料（若有）；這不是「目前沒有案件」。</p>
          <Button
            size="sm"
            variant="outline"
            data-testid="cases-list-retry-button"
            onClick={() => void caseStore.retryLoad()}
          >
            重試
          </Button>
        </div>
      ) : null}
      {/* 第一行：標題 → 新增案件（PM+）→ 流程按鈕（批次交件、單筆流程）；譯者僅見標題與流程按鈕 */}
      <div className="space-y-2">
        <div className="flex w-full flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight shrink-0">案件管理</h1>
          {tableSavePending > 0 ? (
            <span className="text-sm text-muted-foreground" data-testid="cases-table-saving">儲存中…</span>
          ) : null}
          {isPmOrAbove && (
            <CreateWithTemplateButton
              module="cases"
              onCreate={handleCreate}
              label="新增案件"
              size="sm"
              uiButtonId="cases_add"
              busy={creatingCase}
            />
          )}
          {canShowMarkDeliveredBulk ? (
            <Button
              size="sm"
              className={uiMarkDelivered.className}
              style={uiMarkDelivered.style}
              onClick={handleMarkDelivered}
            >
              <UiToolbarButtonIcon uiButtonId="cases_mark_delivered" />
              {lbMarkDelivered}
            </Button>
          ) : null}
          {rowSelection.selectedCount === 1 && selectedSingleCase ? (
            <CasesListSingleCaseFlowButtons
              caseData={selectedSingleCase}
              profile={profile}
              isPmOrAbove={isPmOrAbove}
              isTranslatorRole={isTranslatorRole}
              offerTaskComplete={offerSelectedTaskComplete}
              onOpenDecline={() => setDeclineOpen(true)}
              onRevertToDraft={handleFlowRevertToDraft}
              onCancelDispatch={handleFlowCancelDispatch}
              onRevertRevision={handleFlowRevertRevision}
              onRevertToFeedback={handleFlowRevertToFeedback}
              onOpenDeleteDraft={() => setDeleteDraftFlowOpen(true)}
              onPublish={handleFlowPublishSingle}
              onAcceptCase={handleFlowAcceptCase}
              onFinalizeAssign={handleFlowFinalizeAssign}
              onTaskComplete={handleFlowTaskComplete}
              onFeedbackComplete={handleFlowFeedbackComplete}
              onMarkDelivered={handleFlowMarkDelivered}
              onFeedbackOpen={handleFlowFeedbackOpen}
            />
          ) : null}
        </div>
        {/* 第二行：操作按鈕（PM+）；譯者不渲染此列，版面與先前一致 */}
        {isPmOrAbove ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button
              size="sm"
              className={uiInquiryMsg.className}
              style={uiInquiryMsg.style}
              disabled={rowSelection.selectedCount === 0}
              onClick={handleCopyInquiryMessages}
            >
              <UiToolbarButtonIcon uiButtonId="cases_inquiry_message" />
              {lbInquiryMsg}
            </Button>
            <Button
              size="sm"
              className={uiSlack.className}
              style={uiSlack.style}
              disabled={rowSelection.selectedCount === 0}
              onClick={() => setInquirySlackOpen(true)}
            >
              <UiToolbarButtonIcon uiButtonId="cases_slack" />
              {lbSlack}
            </Button>
            <Button
              size="sm"
              className={uiCopy.className}
              style={uiCopy.style}
              disabled={rowSelection.selectedCount !== 1}
              onClick={() => {
                const id = Array.from(rowSelection.selectedIds)[0];
                beginDuplicate(id);
              }}
            >
              <UiToolbarButtonIcon uiButtonId="cases_copy" />
              {lbCopy}
            </Button>
            <Button
              size="sm"
              className={uiGenFees.className}
              style={uiGenFees.style}
              disabled={rowSelection.selectedCount === 0}
              onClick={handleGenerateFees}
            >
              <UiToolbarButtonIcon uiButtonId="cases_gen_fees" />
              {lbGenFees}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              disabled={rowSelection.selectedCount === 0}
              onClick={() => setShowDeleteConfirm(true)}
              title="刪除選取案件"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
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
        permittedFieldKeys={permittedFieldKeys}
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
              <th
                className="w-[40px] px-2 py-2.5 text-center cursor-pointer select-none"
                onClick={() => {
                  if (rowSelection.isAllSelected) rowSelection.deselectAll();
                  else rowSelection.selectAll();
                }}
              >
                <TableRowSelectCheckbox checked={rowSelection.isAllSelected} aria-label="全選" />
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
            {deferredVisibleFees.map((c) => {
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
                  <td
                    className="w-[40px] px-2 py-1.5 align-top text-center cursor-pointer select-none"
                    onClick={(e) => rowSelection.handleClick(c.id, e)}
                  >
                    <TableRowSelectCheckbox checked={isSelected} aria-label="選取列" />
                  </td>
                  {orderedCols.map((col) => (
                    <td
                      key={col.key}
                      style={{ width: activeView.columnWidths[col.key] ?? 100, maxWidth: activeView.columnWidths[col.key] ?? 100 }}
                      className={cn(
                        "px-3 py-1.5 align-top",
                        col.key === "translator" || col.key === "reviewer"
                          ? "overflow-visible"
                          : "overflow-hidden",
                        col.key === "unitCount" && "text-center",
                      )}
                    >
                      {col.render(c, {
                        editable: editableFields.has(col.key),
                        onCommit: (field, value, meta) => handleCellCommit(c.id, field, value, meta),
                      })}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visibleFees.length === 0 && (
              <tr>
                <td
                  colSpan={orderedCols.length + 1}
                  className="h-24 text-center text-muted-foreground"
                  data-testid={casesLoadError ? "cases-list-load-error-empty" : "cases-list-empty"}
                >
                  {casesLoadError ? "案件清單載入失敗" : "尚無案件紀錄"}
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

      <AlertDialog open={deleteDraftFlowOpen} onOpenChange={setDeleteDraftFlowOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原，確定要刪除此案件嗎？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteDraftFlow()}>確定刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={declineOpen}
        onOpenChange={(v) => {
          if (!v) {
            setDeclineOpen(false);
            setDeclineProposedDeadline(null);
            setDeclineAvailableCount("");
            setDeclineMessage("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>無法承接</AlertDialogTitle>
            <AlertDialogDescription>
              以下三項皆為選填（0–3 項），填完後按確認即可。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 px-1">
            <div className="space-y-1.5">
              <Label className="text-sm">按照此字數和內容，期限延到何時你可以接案？</Label>
              <DateTimePicker value={declineProposedDeadline} onChange={setDeclineProposedDeadline} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">如果交期無法變動，請問你大約可以做多少字？</Label>
              <Input
                type="number"
                placeholder="字數"
                value={declineAvailableCount}
                onChange={(e) => setDeclineAvailableCount(e.target.value)}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">請問你是否有其他情況或派案提議想說明？</Label>
              <MultilineInput
                placeholder="請輸入…"
                value={declineMessage}
                onChange={(e) => setDeclineMessage(e.target.value)}
                minRows={2}
                maxRows={5}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeclineOpen(false);
                setDeclineProposedDeadline(null);
                setDeclineAvailableCount("");
                setDeclineMessage("");
              }}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeclineConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              確認
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DuplicateCaseSortDialog
        open={casesDupSortOpen}
        onOpenChange={(v) => {
          setCasesDupSortOpen(v);
          if (!v) setPendingDuplicateId(null);
        }}
        onConfirm={(sort) => {
          if (pendingDuplicateId) void runCasesDuplicate(pendingDuplicateId, sort);
          setPendingDuplicateId(null);
        }}
      />

      {/* Duplicate overlay */}
      <AlertDialog open={casesDupDialogOpen} onOpenChange={setCasesDupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{casesDupInfo?.toolsPending ? "案件已複製，工具未完成" : "已複製頁面"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{casesDupInfo?.toolsPending ? "新案件已建立，工具尚未確認寫入。未刪除新案，也不會自動再建立一筆。" : "已複製頁面並切換至新頁面。"}</p>
                <p>新頁面名稱：<span className="font-medium text-foreground">{casesDupInfo?.newTitle}</span></p>
                {casesDupInfo?.toolsPending && (
                  <p className="text-sm" data-testid="duplicate-tools-pending">
                    <span data-testid={pendingDuplicateToolsMessageTestId(casesDupInfo.toolsMessage ?? "")}>
                      {casesDupInfo.toolsMessage}
                    </span>
                  </p>
                )}
                {casesDupInfo?.renames && casesDupInfo.renames.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">以下更名的案件：</p>
                    <ul className="list-disc list-inside text-sm">
                      {casesDupInfo.renames.map((r, i) => (
                        <li key={i}>{r.oldTitle} → {r.newTitle}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {casesDupInfo &&
                  (casesDupInfo.feePatchCount > 0 ||
                    casesDupInfo.translatorInvoicePatchCount > 0 ||
                    casesDupInfo.clientInvoicePatchCount > 0) && (
                  <p className="text-sm text-muted-foreground">
                    已同步更新：稿費標題 {casesDupInfo.feePatchCount} 筆；譯者請款 {casesDupInfo.translatorInvoicePatchCount}{" "}
                    筆；客戶請款 {casesDupInfo.clientInvoicePatchCount} 筆。
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {casesDupInfo?.toolsPending && casesDupInfo.newCaseId && (
              <Button
                type="button"
                variant="outline"
                data-testid="retry-duplicate-tools"
                onClick={async () => {
                  const retried = await caseStore.retryDuplicateTools(casesDupInfo.newCaseId);
                  if (retried.status === "already_complete" || retried.ok) {
                    setCasesDupInfo((prev) => (prev ? { ...prev, toolsPending: false, toolsMessage: undefined } : prev));
                    toast({ title: retried.status === "already_complete" ? "工具已核實完成" : "工具已寫入既有新案" });
                  } else {
                    setCasesDupInfo((prev) => (prev ? { ...prev, toolsMessage: retried.message } : prev));
                    toast({
                      title: retried.status === "target_conflict" || retried.status === "source_changed"
                        ? "工具重試已停止"
                        : "工具重試未完成",
                      description: retried.message,
                      variant: "destructive",
                    });
                  }
                }}
              >
                重試複製工具
              </Button>
            )}
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
            <AlertDialogTitle>{batchEditResult?.title || "批次編輯結果"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  「{batchEditResult?.field}」改為「{batchEditResult?.value}」：
                  成功 {batchEditResult?.successCount ?? 0} 筆
                  {batchEditResult && batchEditResult.unchangedCount > 0 ? `、未變更 ${batchEditResult.unchangedCount} 筆` : ""}
                  {batchEditResult && batchEditResult.failed.length > 0 ? `、失敗 ${batchEditResult.failed.length} 筆` : ""}
                  {batchEditResult && batchEditResult.unknown.length > 0 ? `、結果不明 ${batchEditResult.unknown.length} 筆` : ""}
                  。
                </p>
                {batchEditResult?.failed && batchEditResult.failed.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">未寫入：</p>
                    <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                      {batchEditResult.failed.map((l, i) => (
                        <li key={`failed-${i}`} className="text-muted-foreground">{l.title}：{l.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {batchEditResult?.unknown && batchEditResult.unknown.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">結果不明，請重整後確認，不要再送同一變更：</p>
                    <ul className="list-disc list-inside text-sm mt-1 space-y-0.5">
                      {batchEditResult.unknown.map((l, i) => (
                        <li key={`unknown-${i}`} className="text-muted-foreground">{l.title}：{l.reason}</li>
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

      <InquirySlackDialog
        open={inquirySlackOpen}
        onOpenChange={setInquirySlackOpen}
        cases={selectedCasesForSlack}
      />
    </div>
  );
}
