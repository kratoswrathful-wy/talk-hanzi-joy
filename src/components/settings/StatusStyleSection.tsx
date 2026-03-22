import { useState } from "react";
import { GripVertical, ChevronDown, ChevronRight, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS, STATUS_TABLE_MAP, ALL_STATUS_TABLES } from "@/stores/select-options-store";
import { useLabelStyles, labelStyleStore } from "@/stores/label-style-store";
import { cn } from "@/lib/utils";
import { getColorUsageMap } from "@/lib/settings-color-usage";

/**
 * 設定 → 狀態標籤：顏色、拖曳排序、各表格使用分佈（STATUS_TABLE_MAP）。
 */
export function StatusStyleSection() {
  const { options: statusOptions, customColors } = useSelectOptions("statusLabel");
  const labelStyles = useLabelStyles();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const [textColorPickerOptionId, setTextColorPickerOptionId] = useState<string | null>(null);
  const [textColorOpen, setTextColorOpen] = useState(false);

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = statusOptions.map((o) => o.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderOptions("statusLabel", ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <div>
        <h2 className="text-base font-semibold">狀態標籤設定</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          管理各表格狀態標籤的顏色與顯示順序
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-muted-foreground font-medium">
          <div className="w-[26px] shrink-0" />
          <div className="min-w-[100px] shrink-0" />
          <div className="flex gap-1 ml-auto">
            {ALL_STATUS_TABLES.map((t) => (
              <span key={t} className="w-[36px] text-center">
                {t}
              </span>
            ))}
          </div>
          <div className="w-[56px] shrink-0" />
        </div>

        {statusOptions.map((opt, idx) => {
          const tables = STATUS_TABLE_MAP[opt.label] || [];
          return (
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
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium min-w-[100px] justify-center shrink-0"
                style={{ backgroundColor: opt.color, color: opt.textColor || "#FFFFFF", borderColor: opt.color }}
              >
                {opt.label}
              </span>

              <div className="flex gap-1 ml-auto">
                {ALL_STATUS_TABLES.map((t) => (
                  <span key={t} className="w-[36px] flex justify-center">
                    {tables.includes(t) ? (
                      <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                        {t}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Popover
                  open={colorPickerOptionId === opt.id}
                  onOpenChange={(v) => {
                    setColorPickerOptionId(v ? opt.id : null);
                    setTextColorPickerOptionId(null);
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                      title="背景顏色"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-3" side="right" align="start" sideOffset={4}>
                    <p className="text-xs text-muted-foreground mb-2">背景顏色</p>
                    <ColorPicker
                      value={opt.color}
                      onChange={(color) => selectOptionsStore.updateOptionColor("statusLabel", opt.id, color)}
                      customColors={customColors}
                      onAddCustomColor={(c) => selectOptionsStore.addCustomColor("statusLabel", c)}
                      onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("statusLabel", c)}
                      colorUsageMap={getColorUsageMap(statusOptions)}
                    />
                  </PopoverContent>
                </Popover>
                <Popover
                  open={textColorPickerOptionId === opt.id}
                  onOpenChange={(v) => {
                    setTextColorPickerOptionId(v ? opt.id : null);
                    setColorPickerOptionId(null);
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                      title="字體顏色"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] font-bold text-muted-foreground">A</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-3" side="right" align="start" sideOffset={4}>
                    <p className="text-xs text-muted-foreground mb-2">字體顏色</p>
                    <ColorPicker
                      value={opt.textColor || "#FFFFFF"}
                      onChange={(color) => selectOptionsStore.updateOptionTextColor("statusLabel", opt.id, color)}
                      customColors={[]}
                      onAddCustomColor={() => {}}
                      onRemoveCustomColor={() => {}}
                      colorUsageMap={{}}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-4 mt-auto">
        <button
          type="button"
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          onClick={() => setTextColorOpen((v) => !v)}
        >
          {textColorOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          標籤字體顏色
        </button>
        {textColorOpen && (
          <div className="mt-2 flex items-center gap-3">
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: statusOptions[0]?.color || PRESET_COLORS[0],
                color: labelStyles.statusLabel.textColor,
                borderColor: statusOptions[0]?.color || PRESET_COLORS[0],
              }}
            >
              預覽
            </span>
            <ColorPicker
              value={labelStyles.statusLabel.textColor}
              onChange={(c) => labelStyleStore.setStatusLabelTextColor(c)}
              customColors={[]}
              onAddCustomColor={() => {}}
              onRemoveCustomColor={() => {}}
              colorUsageMap={{}}
              onResetDefault={() => labelStyleStore.setStatusLabelTextColor("#FFFFFF")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
