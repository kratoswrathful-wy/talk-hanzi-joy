import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Plus, Trash2, Palette, Check, Pencil, X, DollarSign } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSelectOptions, selectOptionsStore, type SelectOption, PRESET_COLORS } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
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

const PRICING_FIELD_MAP: Record<string, { pricingKey: "assignee" | "client"; label: string }> = {
  assignee: { pricingKey: "assignee", label: "預設單價" },
  client: { pricingKey: "client", label: "預設報價" },
};

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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const [renamingOptionId, setRenamingOptionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null);
  const [pricingOptionId, setPricingOptionId] = useState<string | null>(null);
  const [pricingValue, setPricingValue] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pricingInputRef = useRef<HTMLInputElement>(null);

  const pricingConfig = PRICING_FIELD_MAP[fieldKey];

  useEffect(() => {
    if (addingNew) newInputRef.current?.focus();
  }, [addingNew]);

  useEffect(() => {
    if (renamingOptionId) renameInputRef.current?.focus();
  }, [renamingOptionId]);

  useEffect(() => {
    if (pricingOptionId) pricingInputRef.current?.focus();
  }, [pricingOptionId]);

  const selectedOption = options.find((o) => o.label === value);

  const handleSelect = (opt: SelectOption) => {
    onValueChange(opt.label);
    setOpen(false);
    setAddingNew(false);
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

  const handleSavePricing = (optLabel: string) => {
    if (!pricingConfig) return;
    const num = Number(pricingValue);
    if (isNaN(num) || num < 0) return;
    defaultPricingStore.setPrice(pricingConfig.pricingKey, optLabel, num);
    setPricingOptionId(null);
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
                  backgroundColor: selectedOption.color + "22",
                  color: selectedOption.color,
                  borderColor: selectedOption.color + "44",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: selectedOption.color }}
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
            {/* Options list - max 15 visible */}
            <div className="max-h-[330px] overflow-y-auto p-1">
              {options.map((opt) => (
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
                          backgroundColor: opt.color + "22",
                          color: opt.color,
                          borderColor: opt.color + "44",
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color }}
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
                      setPricingOptionId(null);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                        onClick={(e) => e.stopPropagation()}
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
                      ) : pricingOptionId === opt.id && pricingConfig ? (
                        <div className="p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">{pricingConfig.label}</p>
                          <Input
                            ref={pricingInputRef}
                            type="text"
                            inputMode="decimal"
                            value={pricingValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^[0-9]*\.?[0-9]*$/.test(v)) setPricingValue(v);
                            }}
                            className="h-8 text-sm"
                            placeholder="輸入預設價格"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSavePricing(opt.label);
                              if (e.key === "Escape") setPricingOptionId(null);
                            }}
                          />
                          <div className="flex gap-1.5 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPricingOptionId(null)}>
                              取消
                            </Button>
                            <Button size="sm" className="h-7 text-xs" disabled={!pricingValue.trim()} onClick={() => handleSavePricing(opt.label)}>
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
                          {pricingConfig && (
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentPrice = defaultPricingStore.getPrice(pricingConfig.pricingKey, opt.label);
                                setPricingValue(currentPrice !== undefined ? String(currentPrice) : "");
                                setPricingOptionId(opt.id);
                              }}
                            >
                              <DollarSign className="h-3.5 w-3.5" />
                              {pricingConfig.label}
                              {(() => {
                                const p = defaultPricingStore.getPrice(pricingConfig.pricingKey, opt.label);
                                return p !== undefined ? (
                                  <span className="ml-auto text-xs text-muted-foreground">{p}</span>
                                ) : null;
                              })()}
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
              {options.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">尚無選項</p>
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
                  <div className="flex flex-wrap gap-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        className={cn(
                          "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                          newColor === c ? "border-foreground scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => setNewColor(c)}
                      />
                    ))}
                  </div>
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除選項「{deleteConfirm?.label}」嗎？此操作無法復原。
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

/** Map color (uppercase hex) → list of option labels using it */
function getColorUsageMap(options: SelectOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const opt of options) {
    const key = opt.color.toUpperCase();
    if (!map[key]) map[key] = [];
    map[key].push(opt.label);
  }
  return map;
}
