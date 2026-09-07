import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import ColorSelect from "@/components/ColorSelect";
import MultiColorSelect from "@/components/MultiColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
import { shouldAutoOpenOnEnter } from "@/components/fees/inline-edit-auto-open";
import { shouldResyncMultiCommitOnClose } from "@/components/fees/inline-edit-close-sync";
import { cn } from "@/lib/utils";
import type { AssigneeSelectPayload } from "@/lib/assignee-select";
import type { CaseAssignmentMeta } from "@/lib/case-assignment-patch";
import { primaryAssigneeUserId } from "@/lib/assignee-select";

interface Props {
  value: string | boolean | string[] | null;
  type: "text" | "select" | "checkbox" | "colorSelect" | "multiColorSelect" | "datetime";
  options?: { value: string; label: string }[];
  /** For colorSelect/multiColorSelect type: the field key in selectOptionsStore */
  fieldKey?: string;
  editable: boolean;
  /** When set, field is visually locked with this tooltip on hover */
  lockedTooltip?: string;
  onCommit: (
    newValue: string | boolean | string[] | null,
    meta?: CaseAssignmentMeta,
  ) => void;
  /** assignee colorSelect：同步回傳選項 UUID。 */
  onAssigneeSelect?: (selection: AssigneeSelectPayload) => void;
  /** assignee multiColorSelect：同步回傳各選項 UUID。 */
  onAssigneeSelectionsChange?: (selections: AssigneeSelectPayload[]) => void;
  /** assignee 單選時寫入 translator 或 reviewer user id。 */
  assigneeRole?: "translator" | "reviewer";
  className?: string;
  children: React.ReactNode;
}

export function InlineEditCell({ value, type, options, fieldKey, editable, lockedTooltip, onCommit, onAssigneeSelect, onAssigneeSelectionsChange, assigneeRole = "translator", className, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  /** Last multi-select commit in this edit session（Escape 關閉時強制再同步一次，避免顯示停在舊 children） */
  const lastMultiCommitRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (editing && type === "multiColorSelect") {
      lastMultiCommitRef.current = Array.isArray(value) ? [...value] : [];
    }
    if (!editing) {
      lastMultiCommitRef.current = null;
    }
  }, [editing, type, value]);

  const exitEditing = useCallback(() => {
    // Escape 會先還原 focus 到 trigger；延後卸下編輯 UI，避免與 Radix focus 還原打架導致顯示不同步
    queueMicrotask(() => setEditing(false));
  }, []);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== String(value ?? "")) {
      onCommit(draft);
    }
  }, [draft, value, onCommit]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!editable) return;
    e.stopPropagation();

    if (type === "checkbox") {
      onCommit(!(value as boolean));
      return;
    }
    if (type === "datetime") {
      setEditing(true);
      return;
    }
    setDraft(String(value ?? ""));
    setEditing(true);
  }, [editable, type, value, onCommit]);

  if (editing && type === "text") {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); }
        }}
        className="h-7 text-sm px-1.5 py-0"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (editing && type === "select") {
    return (
      <Select
        value={String(value)}
        onValueChange={(v) => { onCommit(v); setEditing(false); }}
        open
        onOpenChange={(open) => { if (!open) setEditing(false); }}
      >
        <SelectTrigger className="h-7 text-xs" onClick={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options?.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (editing && type === "colorSelect" && fieldKey) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <ColorSelect
          fieldKey={fieldKey}
          value={String(value)}
          onValueChange={(v) => {
            if (fieldKey !== "assignee") {
              onCommit(v);
              setEditing(false);
            }
          }}
          onAssigneeSelect={
            fieldKey === "assignee"
              ? (selection) => {
                  onAssigneeSelect?.(selection);
                  onCommit(selection?.label ?? "", assigneeRole === "reviewer"
                    ? { reviewerUserId: selection?.userId ?? null }
                    : { translatorUserId: selection?.userId ?? null });
                  setEditing(false);
                }
              : undefined
          }
          triggerClassName="h-7 text-xs"
          defaultOpen={shouldAutoOpenOnEnter("colorSelect")}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) exitEditing();
          }}
        />
      </div>
    );
  }

  if (editing && type === "multiColorSelect" && fieldKey) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <MultiColorSelect
          fieldKey={fieldKey}
          values={Array.isArray(value) ? value : []}
          onValuesChange={(v) => {
            lastMultiCommitRef.current = v;
            if (fieldKey !== "assignee") onCommit(v);
          }}
          onAssigneeSelectionsChange={
            fieldKey === "assignee"
              ? (selections) => {
                  onAssigneeSelectionsChange?.(selections);
                  onCommit(
                    selections.map((s) => s.label),
                    { translatorUserId: primaryAssigneeUserId(selections) },
                  );
                }
              : undefined
          }
          triggerClassName="h-7 min-h-0 text-xs py-0"
          defaultOpen={shouldAutoOpenOnEnter("multiColorSelect")}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              const latest = lastMultiCommitRef.current;
              if (shouldResyncMultiCommitOnClose(latest) && latest && fieldKey !== "assignee") {
                onCommit(latest);
              }
              exitEditing();
            }
          }}
        />
      </div>
    );
  }

  if (editing && type === "datetime") {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <DateTimePicker
          value={typeof value === "string" ? value : null}
          onChange={(iso) => {
            onCommit(iso);
          }}
          onClose={() => setEditing(false)}
          className="h-7 text-xs"
          defaultOpen={shouldAutoOpenOnEnter("datetime")}
        />
      </div>
    );
  }

  // Locked state with tooltip
  if (!editable && lockedTooltip) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("cursor-not-allowed", className)}>
              {children}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{lockedTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        editable && "cursor-pointer hover:bg-muted/60 rounded px-0.5 -mx-0.5 transition-colors",
        className
      )}
    >
      {children}
    </div>
  );
}
