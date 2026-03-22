import { useState, useCallback } from "react";
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

/** 設定 → 內部註記狀態 / 內部註記性質（可拖曳排序、色票、標籤字色） */
export function NoteSelectSection({
  fieldKey,
  title,
  addLabel,
}: {
  fieldKey: string;
  title: string;
  addLabel: string;
}) {
  const { confirmDelete } = useDeleteConfirm();
  const { options, customColors } = useSelectOptions(fieldKey);
  const labelStyles = useLabelStyles();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const cancelAdding = useCallback(() => {
    setAdding(false);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
  }, []);
  const addingRef = useClickOutsideCancel(adding, cancelAdding);

  const textColorValue =
    fieldKey === "noteStatus" ? labelStyles.noteStatus.textColor : labelStyles.noteNature.textColor;
  const setTextColor =
    fieldKey === "noteStatus" ? labelStyleStore.setNoteStatusTextColor : labelStyleStore.setNoteNatureTextColor;

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || options.some((o) => o.label === label)) return;
    selectOptionsStore.addOption(fieldKey, label, newColor);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <h2 className="text-base font-semibold">{title}</h2>
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
              selectOptionsStore.reorderOptions(fieldKey, ids);
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
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: opt.color, color: "#fff", borderColor: opt.color }}
            >
              {opt.label}
            </span>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover open={colorPickerId === opt.id} onOpenChange={(v) => setColorPickerId(v ? opt.id : null)}>
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
                    onChange={(color) => selectOptionsStore.updateOptionColor(fieldKey, opt.id, color)}
                    customColors={customColors}
                    onAddCustomColor={(c) => selectOptionsStore.addCustomColor(fieldKey, c)}
                    onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor(fieldKey, c)}
                    colorUsageMap={getColorUsageMap(options)}
                  />
                </PopoverContent>
              </Popover>
              <button
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(() => selectOptionsStore.deleteOption(fieldKey, opt.id), opt.label);
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
              placeholder="輸入名稱"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <ColorPicker
              value={newColor}
              onChange={setNewColor}
              customColors={customColors}
              onAddCustomColor={(c) => selectOptionsStore.addCustomColor(fieldKey, c)}
              onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor(fieldKey, c)}
              colorUsageMap={getColorUsageMap(options)}
            />
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 text-xs w-full" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
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
                  backgroundColor: options[0]?.color || PRESET_COLORS[0],
                  color: textColorValue,
                  borderColor: options[0]?.color || PRESET_COLORS[0],
                }}
              >
                預覽
              </span>
              <ColorPicker
                value={textColorValue}
                onChange={(c) => setTextColor(c)}
                customColors={[]}
                onAddCustomColor={() => {}}
                onRemoveCustomColor={() => {}}
                colorUsageMap={{}}
                onResetDefault={() => setTextColor("#FFFFFF")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
