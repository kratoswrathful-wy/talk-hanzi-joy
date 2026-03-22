import { useState, useCallback } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";
import { useClickOutsideCancel } from "@/hooks/use-click-outside";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { cn } from "@/lib/utils";

/** 設定 → 請款管道（拖曳排序、刪除） */
export function BillingChannelSection() {
  const { confirmDelete } = useDeleteConfirm();
  const { options } = useSelectOptions("billingChannel");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const cancelAdding = useCallback(() => {
    setAdding(false);
    setNewLabel("");
  }, []);
  const addingRef = useClickOutsideCancel(adding, cancelAdding);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || options.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("billingChannel", label, PRESET_COLORS[8]);
    setNewLabel("");
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <h2 className="text-base font-semibold">請款管道</h2>
      <div className="space-y-1">
        {options.map((opt, idx) => (
          <div
            key={opt.id}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIdx !== null && dragIdx !== idx) setDragOverIdx(idx);
            }}
            onDrop={() => {
              if (dragIdx === null || dragIdx === idx) return;
              const ids = options.map((o) => o.id);
              const [moved] = ids.splice(dragIdx, 1);
              ids.splice(idx, 0, moved);
              selectOptionsStore.reorderOptions("billingChannel", ids);
              setDragIdx(null);
              setDragOverIdx(null);
            }}
            onDragEnd={() => {
              setDragIdx(null);
              setDragOverIdx(null);
            }}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-grab active:cursor-grabbing group",
              dragOverIdx === idx && "bg-primary/10 border border-dashed border-primary/30",
              dragIdx === idx && "opacity-50",
              dragOverIdx !== idx && "hover:bg-secondary/30"
            )}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm">{opt.label}</span>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(() => selectOptionsStore.deleteOption("billingChannel", opt.id), opt.label);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto">
        {adding ? (
          <div ref={addingRef} className="px-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="輸入名稱"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
            />
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 text-xs w-full" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增管道
          </Button>
        )}
      </div>
    </div>
  );
}
