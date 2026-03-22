import { useState, useCallback, type DragEvent } from "react";
import { Plus, Trash2, GripVertical, Palette, ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";
import { useClickOutsideCancel } from "@/hooks/use-click-outside";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles, labelStyleStore } from "@/stores/label-style-store";
import { cn } from "@/lib/utils";
import { getColorUsageMap } from "@/lib/settings-color-usage";

/** 設定 → 內容性質（拖曳、色票、標籤字色） */
export function CaseCategorySection() {
  const { confirmDelete } = useDeleteConfirm();
  const { options: categoryOptions, customColors } = useSelectOptions("caseCategory");
  const labelStyles = useLabelStyles();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const cancelAdding = useCallback(() => {
    setAdding(false);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
  }, []);
  const addingRef = useClickOutsideCancel(adding, cancelAdding);

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = categoryOptions.map((o) => o.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderOptions("caseCategory", ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || categoryOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("caseCategory", label, newColor);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <div>
        <h2 className="text-base font-semibold">內容性質設定</h2>
        <p className="text-xs text-muted-foreground mt-0.5">管理內容性質選項的顯示順序與顏色</p>
      </div>

      <div className="space-y-1">
        {categoryOptions.map((opt, idx) => (
          <div
            key={opt.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-grab active:cursor-grabbing group",
              dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
              dragIndex === idx && "opacity-50",
              dragOverIndex !== idx && "hover:bg-secondary/30"
            )}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: opt.color,
                color: labelStyles.caseCategory.textColor,
                borderColor: opt.color,
              }}
            >
              {opt.label}
            </span>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover
                open={colorPickerOptionId === opt.id}
                onOpenChange={(v) => setColorPickerOptionId(v ? opt.id : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-3" side="right" align="start" sideOffset={4}>
                  <ColorPicker
                    value={opt.color}
                    onChange={(color) => selectOptionsStore.updateOptionColor("caseCategory", opt.id, color)}
                    customColors={customColors}
                    onAddCustomColor={(c) => selectOptionsStore.addCustomColor("caseCategory", c)}
                    onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("caseCategory", c)}
                    colorUsageMap={getColorUsageMap(categoryOptions)}
                  />
                </PopoverContent>
              </Popover>
              <button
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(() => selectOptionsStore.deleteOption("caseCategory", opt.id), opt.label);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-4">
        {adding ? (
          <div ref={addingRef} className="space-y-2 px-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="輸入內容性質名稱"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <ColorPicker
              value={newColor}
              onChange={(color) => setNewColor(color)}
              customColors={customColors}
              onAddCustomColor={(c) => selectOptionsStore.addCustomColor("caseCategory", c)}
              onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("caseCategory", c)}
              colorUsageMap={getColorUsageMap(categoryOptions)}
            />
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 text-xs w-full" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增內容性質
          </Button>
        )}

        <div className="border-t border-border pt-4">
          <button
            type="button"
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            onClick={() => setTextColorOpen((v) => !v)}
          >
            {textColorOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            標籤字體顏色
          </button>
          {textColorOpen && (
            <div className="mt-2 flex items-center gap-3">
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
                style={{
                  backgroundColor: categoryOptions[0]?.color || PRESET_COLORS[0],
                  color: labelStyles.caseCategory.textColor,
                  borderColor: categoryOptions[0]?.color || PRESET_COLORS[0],
                }}
              >
                預覽
              </span>
              <ColorPicker
                value={labelStyles.caseCategory.textColor}
                onChange={(c) => labelStyleStore.setCaseCategoryTextColor(c)}
                customColors={[]}
                onAddCustomColor={() => {}}
                onRemoveCustomColor={() => {}}
                colorUsageMap={{}}
                onResetDefault={() => labelStyleStore.setCaseCategoryTextColor("#FFFFFF")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
