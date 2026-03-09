import { useCallback, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ColorSelect from "@/components/ColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Calendar, Copy, Check } from "lucide-react";
import type { CollabRow } from "@/data/case-types";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  rows: CollabRow[];
  onChange: (rows: CollabRow[]) => void;
  caseStatus: string;
}

function CopySegmentButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
      onClick={handleCopy}
      title="複製到剪貼簿"
      type="button"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function CollaborationTable({ rows, onChange, caseStatus }: Props) {
  const { primaryRole, profile } = useAuth();
  const isPmOrAbove = primaryRole === "pm" || primaryRole === "executive";
  const displayName = profile?.display_name || "";
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDispatched = caseStatus === "dispatched";
  const isTaskCompleted = caseStatus === "task_completed";

  // Segment overlay state
  const [segmentOverlay, setSegmentOverlay] = useState<{ idx: number; value: string } | null>(null);

  // Bulk deadline state
  const [bulkDeadlineField, setBulkDeadlineField] = useState<"translationDeadline" | "reviewDeadline" | null>(null);
  const [bulkDeadlineValue, setBulkDeadlineValue] = useState<string | null>(null);

  const updateRow = useCallback(
    (idx: number, patch: Partial<CollabRow>) => {
      const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      onChange(next);
    },
    [rows, onChange]
  );

  // When dispatched, the "accepted" column becomes "taskCompleted"
  const showTaskCompletedInAcceptedCol = isDispatched || isTaskCompleted;

  const columns = [
    { key: "segment", label: "檔案或分段", width: "minmax(210px, 1.75fr)" },
    { key: "translator", label: "譯者", width: "140px" },
    { key: "unitCount", label: "計費單位數", width: "90px" },
    { key: "accepted", label: showTaskCompletedInAcceptedCol ? "任務完成" : "確認承接", width: "80px" },
    { key: "translationDeadline", label: "翻譯交期", width: "180px", bulk: true },
    { key: "reviewer", label: "審稿人員", width: "140px" },
    { key: "reviewDeadline", label: "審稿交期", width: "180px", bulk: true },
    ...(showTaskCompletedInAcceptedCol
      ? []
      : [{ key: "taskCompleted", label: "任務完成", width: "80px" }]),
    { key: "delivered", label: "交件完畢", width: "80px" },
  ];

  const gridTemplate = columns.map((c) => c.width).join(" ");

  const scrollToEnd = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ left: dir === "left" ? 0 : scrollRef.current.scrollWidth, behavior: "smooth" });
  };

  const applyBulkDeadline = () => {
    if (!bulkDeadlineField || !bulkDeadlineValue) return;
    const next = rows.map((r) => ({ ...r, [bulkDeadlineField]: bulkDeadlineValue }));
    onChange(next);
    setBulkDeadlineField(null);
    setBulkDeadlineValue(null);
  };

  return (
    <div className="space-y-1">
      {/* Scroll arrows */}
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => scrollToEnd("left")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => scrollToEnd("right")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="border border-border rounded-lg overflow-x-auto">
        {/* Header */}
        <div
          className="grid items-center gap-0 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground min-w-max"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {columns.map((col) => (
            <div key={col.key} className="px-2 py-2 text-center whitespace-nowrap flex items-center justify-center gap-1">
              {col.label}
              {(col as any).bulk && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setBulkDeadlineField(col.key as "translationDeadline" | "reviewDeadline");
                          setBulkDeadlineValue(null);
                        }}
                      >
                        <Calendar className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>一次套用到所有列</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((row, idx) => {
          const canCheckAccepted =
            caseStatus === "inquiry" &&
            !row.accepted &&
            (isPmOrAbove || (!row.translator || row.translator === displayName));

          // In dispatched mode, the accepted column shows taskCompleted instead
          const canCheckTaskCompletedInAcceptedCol =
            showTaskCompletedInAcceptedCol &&
            !row.taskCompleted &&
            (isPmOrAbove || row.translator === displayName);

          const canCheckTaskCompleted =
            (caseStatus === "dispatched" || caseStatus === "task_completed") &&
            !row.taskCompleted &&
            (isPmOrAbove || row.translator === displayName);

          const canCheckDelivered = isPmOrAbove && !row.delivered;

          return (
            <div
              key={row.id}
              className="grid items-center gap-0 border-b border-border last:border-b-0 text-sm min-w-max"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* Segment */}
              <div className="px-1.5 py-1 flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex-1 text-left h-7 text-xs px-2 py-1 rounded-md border border-border bg-background truncate hover:bg-muted/50 min-w-0"
                        onClick={() => setSegmentOverlay({ idx, value: row.segment })}
                      >
                        {row.segment || <span className="text-muted-foreground">分段名稱</span>}
                      </button>
                    </TooltipTrigger>
                    {row.segment && row.segment.length > 12 && (
                      <TooltipContent side="top" className="max-w-xs break-all">{row.segment}</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <CopySegmentButton value={row.segment} />
              </div>

              {/* Translator */}
              <div className="px-1.5 py-1">
                <ColorSelect
                  fieldKey="assignee"
                  value={row.translator}
                  onValueChange={(v) => updateRow(idx, { translator: v })}
                  className="w-full"
                  disabled={!isPmOrAbove && row.accepted}
                />
              </div>

              {/* Unit count */}
              <div className="px-1.5 py-1">
                <Input
                  type="number"
                  value={row.unitCount || ""}
                  onChange={(e) => updateRow(idx, { unitCount: Number(e.target.value) || 0 })}
                  className="h-7 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Accepted / TaskCompleted (merged column when dispatched) */}
              <div className="flex items-center justify-center px-1.5 py-1">
                {showTaskCompletedInAcceptedCol ? (
                  <Checkbox
                    checked={row.taskCompleted}
                    disabled={!canCheckTaskCompletedInAcceptedCol && !row.taskCompleted}
                    onCheckedChange={(v) => updateRow(idx, { taskCompleted: !!v })}
                  />
                ) : (
                  <Checkbox
                    checked={row.accepted}
                    disabled={!canCheckAccepted && !row.accepted}
                    onCheckedChange={(v) => {
                      if (!!v && !row.translator) {
                        updateRow(idx, { accepted: true, translator: displayName });
                      } else {
                        updateRow(idx, { accepted: !!v });
                      }
                    }}
                  />
                )}
              </div>

              {/* Translation deadline */}
              <div className="px-1.5 py-1">
                <DateTimePicker
                  value={row.translationDeadline}
                  onChange={(v) => updateRow(idx, { translationDeadline: v })}
                  className="w-full"
                />
              </div>

              {/* Reviewer */}
              <div className="px-1.5 py-1">
                <ColorSelect
                  fieldKey="assignee"
                  value={row.reviewer}
                  onValueChange={(v) => updateRow(idx, { reviewer: v })}
                  className="w-full"
                  disabled={!isPmOrAbove}
                />
              </div>

              {/* Review deadline */}
              <div className="px-1.5 py-1">
                <DateTimePicker
                  value={row.reviewDeadline}
                  onChange={(v) => updateRow(idx, { reviewDeadline: v })}
                  className="w-full"
                />
              </div>

              {/* Task completed - only shown when NOT dispatched (otherwise merged into accepted col) */}
              {!showTaskCompletedInAcceptedCol && (
                <div className="flex items-center justify-center px-1.5 py-1">
                  <Checkbox
                    checked={row.taskCompleted}
                    disabled={!canCheckTaskCompleted && !row.taskCompleted}
                    onCheckedChange={(v) => updateRow(idx, { taskCompleted: !!v })}
                  />
                </div>
              )}

              {/* Delivered */}
              <div className="flex items-center justify-center px-1.5 py-1">
                <Checkbox
                  checked={row.delivered}
                  disabled={!canCheckDelivered && !row.delivered}
                  onCheckedChange={(v) => updateRow(idx, { delivered: !!v })}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Segment overlay dialog */}
      <AlertDialog open={!!segmentOverlay} onOpenChange={(open) => { if (!open) setSegmentOverlay(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>編輯分段名稱</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={segmentOverlay?.value ?? ""}
            onChange={(e) => setSegmentOverlay((prev) => prev ? { ...prev, value: e.target.value } : null)}
            placeholder="分段名稱"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (segmentOverlay) {
                updateRow(segmentOverlay.idx, { segment: segmentOverlay.value });
              }
              setSegmentOverlay(null);
            }}>確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk deadline dialog */}
      <AlertDialog open={!!bulkDeadlineField} onOpenChange={(open) => { if (!open) { setBulkDeadlineField(null); setBulkDeadlineValue(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeadlineField === "translationDeadline" ? "批次設定翻譯交期" : "批次設定審稿交期"}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <DateTimePicker
            value={bulkDeadlineValue}
            onChange={(v) => setBulkDeadlineValue(v)}
            className="w-full"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={applyBulkDeadline} disabled={!bulkDeadlineValue}>套用到所有列</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
