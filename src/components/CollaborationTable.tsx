import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import ColorSelect from "@/components/ColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
import type { CollabRow } from "@/data/case-types";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  rows: CollabRow[];
  onChange: (rows: CollabRow[]) => void;
  caseStatus: string;
}

export default function CollaborationTable({ rows, onChange, caseStatus }: Props) {
  const { primaryRole, profile } = useAuth();
  const isPmOrAbove = primaryRole === "pm" || primaryRole === "executive";
  const displayName = profile?.display_name || "";

  const updateRow = useCallback(
    (idx: number, patch: Partial<CollabRow>) => {
      const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      onChange(next);
    },
    [rows, onChange]
  );

  const columns = [
    { key: "segment", label: "檔案或分段", width: "minmax(120px, 1fr)" },
    { key: "translator", label: "譯者", width: "140px" },
    { key: "unitCount", label: "計費單位數", width: "90px" },
    { key: "accepted", label: "確認承接", width: "80px" },
    { key: "translationDeadline", label: "翻譯交期", width: "180px" },
    { key: "reviewer", label: "審稿人員", width: "140px" },
    { key: "reviewDeadline", label: "審稿交期", width: "180px" },
    { key: "taskCompleted", label: "任務完成", width: "80px" },
    { key: "delivered", label: "交件完畢", width: "80px" },
  ];

  const gridTemplate = columns.map((c) => c.width).join(" ");

  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      {/* Header */}
      <div
        className="grid items-center gap-0 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((col) => (
          <div key={col.key} className="px-2 py-2 text-center whitespace-nowrap">
            {col.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row, idx) => {
        // Permission: can this user check "accepted"?
        // In inquiry: translator can check accepted on their own row (or empty row), PM+ can always
        const canCheckAccepted =
          caseStatus === "inquiry" &&
          !row.accepted &&
          (isPmOrAbove || (!row.translator || row.translator === displayName));

        // Permission: can this user check "taskCompleted"?
        const canCheckTaskCompleted =
          (caseStatus === "dispatched" || caseStatus === "task_completed") &&
          !row.taskCompleted &&
          (isPmOrAbove || row.translator === displayName);

        // Permission: can this user check "delivered"?
        const canCheckDelivered = isPmOrAbove && !row.delivered;

        return (
          <div
            key={row.id}
            className="grid items-center gap-0 border-b border-border last:border-b-0 text-sm"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {/* Segment */}
            <div className="px-1.5 py-1">
              <Input
                value={row.segment}
                onChange={(e) => updateRow(idx, { segment: e.target.value })}
                className="h-7 text-xs"
                placeholder="分段名稱"
              />
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

            {/* Accepted */}
            <div className="flex items-center justify-center px-1.5 py-1">
              <Checkbox
                checked={row.accepted}
                disabled={!canCheckAccepted && !row.accepted}
                onCheckedChange={(v) => {
                  if (!!v && !row.translator) {
                    // Auto-fill translator when member checks accepted
                    updateRow(idx, { accepted: true, translator: displayName });
                  } else {
                    updateRow(idx, { accepted: !!v });
                  }
                }}
              />
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

            {/* Task completed */}
            <div className="flex items-center justify-center px-1.5 py-1">
              <Checkbox
                checked={row.taskCompleted}
                disabled={!canCheckTaskCompleted && !row.taskCompleted}
                onCheckedChange={(v) => updateRow(idx, { taskCompleted: !!v })}
              />
            </div>

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
  );
}
