import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Palette, ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles, labelStyleStore } from "@/stores/label-style-store";
import { cn } from "@/lib/utils";

function getColorUsageMap(options: { label: string; color: string }[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const o of options) {
    if (!map[o.color]) map[o.color] = [];
    map[o.color].push(o.label);
  }
  return map;
}

export default function ToolManagementPage() {
  const { options: toolOptions, customColors } = useSelectOptions("executionTool");
  const labelStyles = useLabelStyles();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const [textColorOpen, setTextColorOpen] = useState(false);

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = toolOptions.map((o) => o.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderOptions("executionTool", ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || toolOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("executionTool", label, newColor);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">工具管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理執行工具選項的顯示順序與顏色，變更會套用到所有案件
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-1">
          {toolOptions.map((opt, idx) => (
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
                style={{ backgroundColor: opt.color, color: labelStyles.executionTool.textColor, borderColor: opt.color }}
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
                      onChange={(color) => selectOptionsStore.updateOptionColor("executionTool", opt.id, color)}
                      customColors={customColors}
                      onAddCustomColor={(c) => selectOptionsStore.addCustomColor("executionTool", c)}
                      onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("executionTool", c)}
                      colorUsageMap={getColorUsageMap(toolOptions)}
                    />
                  </PopoverContent>
                </Popover>
                <button
                  className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                  onClick={(e) => { e.stopPropagation(); selectOptionsStore.deleteOption("executionTool", opt.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="space-y-2 px-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="輸入工具名稱"
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
              onAddCustomColor={(c) => selectOptionsStore.addCustomColor("executionTool", c)}
              onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("executionTool", c)}
              colorUsageMap={getColorUsageMap(toolOptions)}
            />
            <div className="flex gap-1.5 justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(false)}>
                取消
              </Button>
              <Button size="sm" className="h-7 text-xs" disabled={!newLabel.trim()} onClick={handleAdd}>
                新增
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            新增工具
          </Button>
        )}

        {/* Label text color picker - collapsible */}
        <div className="border-t border-border pt-4">
          <button
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            onClick={() => setTextColorOpen((v) => !v)}
          >
            {textColorOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            標籤字體顏色
          </button>
          {textColorOpen && (
            <div className="mt-2 flex items-center gap-3">
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: toolOptions[0]?.color || PRESET_COLORS[0], color: labelStyles.executionTool.textColor, borderColor: toolOptions[0]?.color || PRESET_COLORS[0] }}
              >
                預覽
              </span>
              <ColorPicker
                value={labelStyles.executionTool.textColor}
                onChange={(c) => labelStyleStore.setExecutionToolTextColor(c)}
                customColors={[]}
                onAddCustomColor={() => {}}
                onRemoveCustomColor={() => {}}
                colorUsageMap={{}}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
