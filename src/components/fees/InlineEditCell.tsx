import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import ColorSelect from "@/components/ColorSelect";
import { cn } from "@/lib/utils";

interface Props {
  value: string | boolean;
  type: "text" | "select" | "checkbox" | "colorSelect";
  options?: { value: string; label: string }[];
  /** For colorSelect type: the field key in selectOptionsStore */
  fieldKey?: string;
  editable: boolean;
  /** When set, field is visually locked with this tooltip on hover */
  lockedTooltip?: string;
  onCommit: (newValue: string | boolean) => void;
  className?: string;
  children: React.ReactNode;
}

export function InlineEditCell({ value, type, options, fieldKey, editable, lockedTooltip, onCommit, className, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== String(value)) {
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
    setDraft(String(value));
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
          onValueChange={(v) => { onCommit(v); setEditing(false); }}
          triggerClassName="h-7 text-xs"
          defaultOpen
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
