import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import ColorSelect from "@/components/ColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReviewCollabRow } from "@/data/case-types";
import { newReviewRowId } from "@/lib/review-rows";
import { selectOptionsStore } from "@/stores/select-options-store";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  rows: ReviewCollabRow[];
  onChange: (rows: ReviewCollabRow[]) => void;
  caseId?: string;
  caseStatus: string;
}

type CatBindOption = {
  kind: "file";
  id: string;
  label: string;
};

function resolveAssigneeUserId(name: string): string | null {
  const n = (name || "").trim();
  if (!n) return null;
  const opts = selectOptionsStore.getField("assignee").options;
  const hit = opts.find((o) => o.label === n);
  return hit ? String(hit.id) : null;
}

export default function ReviewCollaborationTable({ rows, onChange, caseId, caseStatus }: Props) {
  const [catFiles, setCatFiles] = useState<CatBindOption[]>([]);
  const showTaskCompleted = caseStatus !== "draft" && caseStatus !== "inquiry";

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("cat_files")
        .select("id, name")
        .eq("related_lms_case_id", caseId)
        .order("name");
      if (cancelled) return;
      setCatFiles(
        ((data as { id: string; name: string }[] | null) ?? []).map((f) => ({
          kind: "file" as const,
          id: f.id,
          label: f.name || f.id,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const updateRow = useCallback(
    (idx: number, patch: Partial<ReviewCollabRow>) => {
      const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      onChange(next);
    },
    [rows, onChange],
  );

  const addRow = () => {
    onChange([
      ...rows,
      {
        id: newReviewRowId(),
        segment: "",
        reviewer: "",
        reviewerUserId: null,
        reviewDeadline: null,
        taskCompleted: false,
        linkedCatFileId: catFiles[0]?.id ?? null,
        lineRange: null,
        accepted: true,
      },
    ]);
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">審稿分段指派</div>
          <p className="text-xs text-muted-foreground">
            與翻譯切法獨立；此表為 CAT 審稿指派唯一來源（非協作表列內「審稿」註記）。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          ＋ 新增審稿列
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">尚無審稿列。可新增，或由舊「案件審稿人」遷移後自動出現整檔列。</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="grid gap-2 items-end"
              style={{ gridTemplateColumns: "1.2fr 1fr 1fr 0.9fr 80px 40px" }}
            >
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">連結 CAT 檔</div>
                <Select
                  value={row.linkedCatFileId ? `file:${row.linkedCatFileId}` : "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      updateRow(idx, { linkedCatFileId: null, linkedCatViewId: null });
                      return;
                    }
                    const id = v.startsWith("file:") ? v.slice(5) : "";
                    updateRow(idx, { linkedCatFileId: id || null, linkedCatViewId: null });
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="整案未連結檔" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— 未連結 —</SelectItem>
                    {catFiles.map((f) => (
                      <SelectItem key={f.id} value={`file:${f.id}`}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">審稿人員</div>
                <ColorSelect
                  fieldKey="assignee"
                  value={row.reviewer}
                  onValueChange={(v) =>
                    updateRow(idx, { reviewer: v, reviewerUserId: resolveAssigneeUserId(v) })
                  }
                />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">列範圍</div>
                <Input
                  className="h-9"
                  value={row.lineRange ?? ""}
                  placeholder="整檔"
                  onChange={(e) => updateRow(idx, { lineRange: e.target.value.trim() || null })}
                />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">審稿交期</div>
                <DateTimePicker
                  value={row.reviewDeadline}
                  onChange={(v) => updateRow(idx, { reviewDeadline: v })}
                  className="w-full"
                />
              </div>
              {showTaskCompleted ? (
                <div className="flex flex-col items-center gap-1 pb-1">
                  <div className="text-[11px] text-muted-foreground">完成</div>
                  <Checkbox
                    checked={!!row.taskCompleted}
                    onCheckedChange={(c) => updateRow(idx, { taskCompleted: !!c })}
                  />
                </div>
              ) : (
                <div />
              )}
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => removeRow(idx)} title="刪除">
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
