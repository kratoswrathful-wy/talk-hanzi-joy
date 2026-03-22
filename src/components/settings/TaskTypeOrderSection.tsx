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
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { cn } from "@/lib/utils";
import { getColorUsageMap } from "@/lib/settings-color-usage";

/** 設定 → 任務類型順序／色票／字色 */
export function TaskTypeOrderSection() {
  const { confirmDelete } = useDeleteConfirm();
  const { options: taskTypeOptions, customColors } = useSelectOptions("taskType");
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
    const ids = taskTypeOptions.map((o) => o.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderOptions("taskType", ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleAddTaskType = () => {
    const label = newLabel.trim();
    if (!label || taskTypeOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("taskType", label, newColor);
    const clients = selectOptionsStore.getSortedOptions("client");
    const buOpts = selectOptionsStore.getSortedOptions("billingUnit");
    for (const c of clients) {
      for (const bu of buOpts) {
        if (bu.label === "小時") {
          defaultPricingStore.setClientPrice(c.label, label, bu.label, 450);
        }
      }
    }
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  const handleDeleteTaskType = (optId: string) => {
    const opt = taskTypeOptions.find((o) => o.id === optId);
    confirmDelete(() => selectOptionsStore.deleteOption("taskType", optId), opt?.label);
  };

  const handleColorChange = (optId: string, color: string) => {
    selectOptionsStore.updateOptionColor("taskType", optId, color);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <div>
        <h2 className="text-base font-semibold">任務類型設定</h2>
        <p className="text-xs text-muted-foreground mt-0.5">拖曳調整任務類型的顯示順序，變更會套用到所有客戶</p>
      </div>

      <div className="space-y-1">
        {taskTypeOptions.map((tt, idx) => (
          <div
            key={tt.id}
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
                backgroundColor: tt.color,
                color: labelStyles.taskType.textColor,
                borderColor: tt.color,
              }}
            >
              {tt.label}
            </span>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover
                open={colorPickerOptionId === tt.id}
                onOpenChange={(v) => setColorPickerOptionId(v ? tt.id : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-3" side="right" align="start" sideOffset={4}>
                  <ColorPicker
                    value={tt.color}
                    onChange={(color) => handleColorChange(tt.id, color)}
                    customColors={customColors}
                    onAddCustomColor={(c) => selectOptionsStore.addCustomColor("taskType", c)}
                    onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("taskType", c)}
                    colorUsageMap={getColorUsageMap(taskTypeOptions)}
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTaskType(tt.id);
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
              placeholder="輸入任務類型名稱"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTaskType();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <ColorPicker
              value={newColor}
              onChange={(color) => setNewColor(color)}
              customColors={customColors}
              onAddCustomColor={(c) => selectOptionsStore.addCustomColor("taskType", c)}
              onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("taskType", c)}
              colorUsageMap={getColorUsageMap(taskTypeOptions)}
            />
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 text-xs w-full" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增任務類型
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
                  backgroundColor: taskTypeOptions[0]?.color || PRESET_COLORS[0],
                  color: labelStyles.taskType.textColor,
                  borderColor: taskTypeOptions[0]?.color || PRESET_COLORS[0],
                }}
              >
                預覽
              </span>
              <ColorPicker
                value={labelStyles.taskType.textColor}
                onChange={(c) => labelStyleStore.setTaskTypeTextColor(c)}
                customColors={[]}
                onAddCustomColor={() => {}}
                onRemoveCustomColor={() => {}}
                colorUsageMap={{}}
                onResetDefault={() => labelStyleStore.setTaskTypeTextColor("#FFFFFF")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
