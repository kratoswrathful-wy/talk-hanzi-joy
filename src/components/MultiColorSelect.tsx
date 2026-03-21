/**
 * Multi-select version of ColorSelect.
 * Reuses the same selectOptionsStore options but allows selecting multiple values.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Plus, Trash2, Palette, Check, Pencil, X, Search, MoreHorizontal } from "lucide-react";
import AssigneeTag from "@/components/AssigneeTag";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSelectOptions, selectOptionsStore, type SelectOption, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import ColorPicker from "@/components/ColorPicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { pinSelectedAssigneesToTop, sortSelectedAssigneeOptions } from "@/lib/assignee-option-order";

function getColorUsageMap(options: { color: string; label: string }[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const opt of options) {
    const key = opt.color.toUpperCase();
    if (!map[key]) map[key] = [];
    map[key].push(opt.label);
  }
  return map;
}

interface MultiColorSelectProps {
  fieldKey: string;
  values: string[];
  onValuesChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export default function MultiColorSelect({
  fieldKey,
  values,
  onValuesChange,
  disabled = false,
  placeholder = "選擇...",
  className,
}: MultiColorSelectProps) {
  const { options, customColors } = useSelectOptions(fieldKey);
  const labelStyles = useLabelStyles();
  const labelTextColor = fieldKey === "taskType" ? labelStyles.taskType.textColor
    : fieldKey === "billingUnit" ? labelStyles.billingUnit.textColor
    : "#D1DAEA";
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const [renamingOptionId, setRenamingOptionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (addingNew) newInputRef.current?.focus(); }, [addingNew]);
  useEffect(() => { if (renamingOptionId) renameInputRef.current?.focus(); }, [renamingOptionId]);
  useEffect(() => {
    if (open) { setSearchQuery(""); setTimeout(() => searchInputRef.current?.focus(), 50); }
  }, [open]);

  const selectedOptions = useMemo(() => {
    const sel = options.filter((o) => values.includes(o.label));
    if (fieldKey !== "assignee") return sel;
    return sortSelectedAssigneeOptions(options, values);
  }, [options, values, fieldKey]);

  const filteredOptions = searchQuery.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : options;

  const displayOptions = useMemo(() => {
    if (fieldKey !== "assignee") return filteredOptions;
    return pinSelectedAssigneesToTop(options, filteredOptions, values);
  }, [fieldKey, options, filteredOptions, values]);

  const handleToggle = (opt: SelectOption) => {
    if (values.includes(opt.label)) {
      onValuesChange(values.filter((v) => v !== opt.label));
    } else {
      onValuesChange([...values, opt.label]);
    }
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || options.some((o) => o.label === label)) return;
    selectOptionsStore.addOption(fieldKey, label, newColor);
    onValuesChange([...values, label]);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAddingNew(false);
  };

  const handleDelete = (optId: string) => {
    const opt = options.find((o) => o.id === optId);
    selectOptionsStore.deleteOption(fieldKey, optId);
    if (opt) onValuesChange(values.filter((v) => v !== opt.label));
    setMenuOpenId(null);
    setDeleteConfirm(null);
  };

  const handleRename = (optId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || options.some((o) => o.label === trimmed && o.id !== optId)) return;
    const opt = options.find((o) => o.id === optId);
    selectOptionsStore.renameOption(fieldKey, optId, trimmed);
    if (opt) onValuesChange(values.map((v) => v === opt.label ? trimmed : v));
    setRenamingOptionId(null);
    setMenuOpenId(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={(v) => { if (!disabled) setOpen(v); }}>
        <PopoverTrigger asChild>
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            className={cn(
              "flex items-center gap-1 flex-wrap min-h-[36px] px-2 py-1 rounded-md border border-input bg-secondary/50 text-sm transition-colors hover:bg-secondary/70 w-full cursor-pointer",
              disabled && "opacity-50 cursor-not-allowed",
              className
            )}
          >
            {selectedOptions.length > 0 ? (
              selectedOptions.map((opt) =>
                fieldKey === "assignee" ? (
                  <AssigneeTag key={opt.id} label={opt.label} avatarUrl={opt.avatarUrl} />
                ) : (
                  <span
                    key={opt.id}
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: opt.color, color: labelTextColor, borderColor: opt.color }}
                  >
                    {opt.label}
                  </span>
                )
              )
            ) : (
              <span className="text-muted-foreground text-sm">{placeholder}</span>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start" sideOffset={4}>
          <div className="flex flex-col">
            {/* Search */}
            <div className="px-2 pt-2 pb-1">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-input bg-background">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {searchQuery && (
                  <button className="shrink-0" onClick={() => setSearchQuery("")}>
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Options */}
            <div className="max-h-[330px] overflow-y-auto p-1">
              {displayOptions.map((opt) => {
                const isChecked = values.includes(opt.label);
                const isAssignee = fieldKey === "assignee";
                return (
                  <div key={opt.id} className="relative group">
                    <button
                      className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                      isChecked && "bg-destructive/30"
                      )}
                      onClick={() => handleToggle(opt)}
                    >
                      <div className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                        isChecked ? "bg-primary border-primary" : "border-muted-foreground/40"
                      )}>
                        {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      {isAssignee ? (
                        <AssigneeTag label={opt.label} avatarUrl={opt.avatarUrl} />
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: opt.color, color: labelTextColor, borderColor: opt.color }}
                        >
                          {opt.label}
                        </span>
                      )}
                    </button>
                    {/* Menu - hidden for assignee fields */}
                    {!isAssignee && (
                      <Popover
                        open={menuOpenId === opt.id}
                        onOpenChange={(v) => { setMenuOpenId(v ? opt.id : null); setColorPickerOptionId(null); setRenamingOptionId(null); }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[240px] p-0" side="right" align="start" sideOffset={4}>
                          {colorPickerOptionId === opt.id ? (
                            <div className="p-3">
                              <ColorPicker
                                value={opt.color}
                                onChange={(color) => selectOptionsStore.updateOptionColor(fieldKey, opt.id, color)}
                                customColors={customColors}
                                onAddCustomColor={(c) => selectOptionsStore.addCustomColor(fieldKey, c)}
                                onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor(fieldKey, c)}
                                colorUsageMap={getColorUsageMap(options)}
                              />
                            </div>
                          ) : renamingOptionId === opt.id ? (
                            <div className="p-3 space-y-2">
                              <p className="text-xs text-muted-foreground">重新命名</p>
                              <Input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="h-8 text-sm"
                                placeholder="輸入新名稱"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(opt.id);
                                  if (e.key === "Escape") setRenamingOptionId(null);
                                }}
                              />
                              <div className="flex gap-1.5 justify-end">
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRenamingOptionId(null)}>取消</Button>
                                <Button size="sm" className="h-7 text-xs" disabled={!renameValue.trim()} onClick={() => handleRename(opt.id)}>確定</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-1">
                              <button
                                className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                onClick={(e) => { e.stopPropagation(); setRenamingOptionId(opt.id); setRenameValue(opt.label); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                重新命名
                              </button>
                              <button
                                className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                onClick={(e) => { e.stopPropagation(); setColorPickerOptionId(opt.id); }}
                              >
                                <Palette className="h-3.5 w-3.5" />
                                變更顏色
                              </button>
                              <button
                                className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm hover:bg-accent hover:text-accent-foreground text-destructive transition-colors"
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: opt.id, label: opt.label }); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                刪除
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new - hidden for assignee fields (managed in team members) */}
            {fieldKey !== "assignee" && (
              <div className="border-t border-border p-1">
                {addingNew ? (
                  <div className="p-2 space-y-2">
                    <Input
                      ref={newInputRef}
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="輸入名稱"
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAdd();
                        if (e.key === "Escape") setAddingNew(false);
                      }}
                    />
                    <div className="flex gap-1.5 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingNew(false)}>取消</Button>
                      <Button size="sm" className="h-7 text-xs" disabled={!newLabel.trim()} onClick={handleAdd}>新增</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
                    onClick={() => setAddingNew(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新增選項
                  </button>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除「{deleteConfirm?.label}」嗎？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}>確定刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
