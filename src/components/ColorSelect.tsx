import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Plus, Trash2, Palette, Check, Pencil, X, Search, MessageSquareText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSelectOptions, selectOptionsStore, type SelectOption, PRESET_COLORS } from "@/stores/select-options-store";
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

interface ColorSelectProps {
  fieldKey: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  defaultOpen?: boolean;
}

export default function ColorSelect({
  fieldKey,
  value,
  onValueChange,
  disabled = false,
  placeholder = "選擇...",
  className,
  triggerClassName,
  defaultOpen,
}: ColorSelectProps) {
  const { options, customColors } = useSelectOptions(fieldKey);
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [showNewColorPicker, setShowNewColorPicker] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const [renamingOptionId, setRenamingOptionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingNew) newInputRef.current?.focus();
  }, [addingNew]);

  useEffect(() => {
    if (renamingOptionId) renameInputRef.current?.focus();
  }, [renamingOptionId]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const selectedOption = options.find((o) => o.label === value);

  // Filter options by search query
  const filteredOptions = searchQuery.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : options;

  const handleSelect = (opt: SelectOption) => {
    onValueChange(opt.label);
    setOpen(false);
    setAddingNew(false);
    setSearchQuery("");
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    if (options.some((o) => o.label === label)) return;
    selectOptionsStore.addOption(fieldKey, label, newColor);
    onValueChange(label);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAddingNew(false);
    setOpen(false);
    setSearchQuery("");
  };

  const handleDelete = (optId: string) => {
    const opt = options.find((o) => o.id === optId);
    selectOptionsStore.deleteOption(fieldKey, optId);
    if (opt && opt.label === value) onValueChange("");
    setMenuOpenId(null);
    setDeleteConfirm(null);
  };

  const handleRename = (optId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    if (options.some((o) => o.label === trimmed && o.id !== optId)) return;
    const opt = options.find((o) => o.id === optId);
    selectOptionsStore.renameOption(fieldKey, optId, trimmed);
    if (opt && opt.label === value) onValueChange(trimmed);
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
            aria-disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 h-10 px-3 rounded-md border border-input bg-secondary/50 text-sm transition-colors hover:bg-secondary/70 text-left w-full",
              disabled && "opacity-50 cursor-not-allowed",
              triggerClassName
            )}
          >
            {selectedOption ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: selectedOption.color,
                  color: "#fff",
                  borderColor: selectedOption.color,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: "#fff" }}
                />
                <span className="truncate">{selectedOption.label}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className={cn("p-0 w-[220px]", className)}
          align="start"
          sideOffset={4}
        >
          <div className="flex flex-col">
            {/* Search input */}
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
                  <button
                    className="shrink-0"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Options list - max 15 visible */}
            <div className="max-h-[330px] overflow-y-auto p-1">
              {filteredOptions.map((opt) => (
                <div key={opt.id} className="relative group">
                  <button
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                      value === opt.label && "bg-accent/60"
                    )}
                    onClick={() => handleSelect(opt)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: opt.color,
                          color: "#fff",
                          borderColor: opt.color,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: "#fff" }}
                        />
                        <span className="truncate">{opt.label}</span>
                      </span>
                      {value === opt.label && (
                        <span
                          role="button"
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-destructive/20 transition-colors shrink-0"
                          onClick={(e) => { e.stopPropagation(); onValueChange(""); setOpen(false); }}
                          title="取消選取"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </span>
                      )}
                    </span>
                  </button>
                  {/* "..." menu */}
                  <Popover
                    open={menuOpenId === opt.id}
                    onOpenChange={(v) => {
                      setMenuOpenId(v ? opt.id : null);
                      setColorPickerOptionId(null);
                      setRenamingOptionId(null);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                        onClick={(e) => { e.stopPropagation(); setEditingNoteId(null); }}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[240px] p-0"
                      side="right"
                      align="start"
                      sideOffset={4}
                    >
                      {colorPickerOptionId === opt.id ? (
                        <div className="p-3">
                          <ColorPicker
                            value={opt.color}
                            onChange={(color) => {
                              selectOptionsStore.updateOptionColor(fieldKey, opt.id, color);
                            }}
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
                              if (e.key === "Escape") { setRenamingOptionId(null); }
                            }}
                          />
                          <div className="flex gap-1.5 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRenamingOptionId(null)}>
                              取消
                            </Button>
                            <Button size="sm" className="h-7 text-xs" disabled={!renameValue.trim()} onClick={() => handleRename(opt.id)}>
                              確認
                            </Button>
                          </div>
                        </div>
                      ) : editingNoteId === opt.id ? (
                        <div className="p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">稿費備註</p>
                          <Textarea
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            placeholder="輸入稿費備註..."
                            className="text-xs min-h-[60px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditingNoteId(null);
                            }}
                          />
                          <div className="flex gap-1.5 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingNoteId(null)}>
                              取消
                            </Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => {
                              selectOptionsStore.updateOptionNote(fieldKey, opt.id, noteValue.trim());
                              setEditingNoteId(null);
                              setMenuOpenId(null);
                            }}>
                              儲存
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-1">
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingOptionId(opt.id);
                              setRenameValue(opt.label);
                            }}
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
                          {(fieldKey === "assignee") && (
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingNoteId(opt.id);
                                setNoteValue(opt.note || "");
                              }}
                            >
                              <MessageSquareText className="h-3.5 w-3.5" />
                              稿費備註
                            </button>
                          )}
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ id: opt.id, label: opt.label });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            刪除選項
                          </button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
              {filteredOptions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {searchQuery ? "沒有符合的選項" : "尚無選項"}
                </p>
              )}
            </div>

            {/* Add new - sticky at bottom */}
            <div className="border-t border-border p-1 sticky bottom-0 bg-popover">
              {addingNew ? (
                <div className="px-2 py-1.5 space-y-2">
                  <Input
                    ref={newInputRef}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="輸入選項名稱"
                    className="h-7 text-xs"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAddingNew(false); }}
                  />
                  <ColorPicker
                    value={newColor}
                    onChange={(color) => setNewColor(color)}
                    customColors={customColors}
                    onAddCustomColor={(c) => selectOptionsStore.addCustomColor(fieldKey, c)}
                    onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor(fieldKey, c)}
                    colorUsageMap={getColorUsageMap(options)}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAddingNew(false)}>
                      取消
                    </Button>
                    <Button size="sm" className="h-6 text-xs" disabled={!newLabel.trim()} onClick={handleAdd}>
                      新增
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setAddingNew(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增選項
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除選項</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除「{deleteConfirm?.label}」嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getColorUsageMap(options: SelectOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const opt of options) {
    if (!map[opt.color]) map[opt.color] = [];
    map[opt.color].push(opt.label);
  }
  return map;
}
