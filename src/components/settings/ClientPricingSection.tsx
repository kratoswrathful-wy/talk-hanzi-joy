import { useState, useCallback } from "react";
import { Plus, Trash2, GripVertical, Palette, ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";
import { useClickOutsideCancel } from "@/hooks/use-click-outside";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles, labelStyleStore } from "@/stores/label-style-store";
import { useClientPricing, defaultPricingStore, clientPricingKey } from "@/stores/default-pricing-store";
import { useCurrencies } from "@/stores/currency-store";
import { cn } from "@/lib/utils";
import { getColorUsageMap } from "@/lib/settings-color-usage";
import { handleTabKeyDown } from "@/lib/settings-editable-cells";

/** 設定 → 客戶與預設報價（含 Tab 切換可編輯格） */
export function ClientPricingSection() {
  const { confirmDelete } = useDeleteConfirm();
  const { options: clientOptions, customColors } = useSelectOptions("client");
  const { options: billingUnitOptions } = useSelectOptions("billingUnit");
  const labelStyles = useLabelStyles();
  const { options: taskTypeOptions } = useSelectOptions("taskType");
  const { getAllClientPricing, setClientPrice, removeClientPrice } = useClientPricing();
  const { currencies } = useCurrencies();
  const allPricing = getAllClientPricing();

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [colorPickerClientId, setColorPickerClientId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newCurrency, setNewCurrency] = useState(currencies[0]?.code || "TWD");
  const [textColorOpen, setTextColorOpen] = useState(false);
  const cancelAdding = useCallback(() => {
    setAdding(false);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setNewCurrency(currencies[0]?.code || "TWD");
  }, [currencies]);
  const addingRef = useClickOutsideCancel(adding, cancelAdding);

  const toggleClient = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = useCallback(
    (client: string, taskType: string, billingUnit: string) => {
      const num = Number(editValue);
      if (!isNaN(num) && num >= 0) {
        if (num === 0) {
          removeClientPrice(client, taskType, billingUnit);
        } else {
          setClientPrice(client, taskType, billingUnit, num);
        }
      }
      setEditingCell(null);
    },
    [editValue, setClientPrice, removeClientPrice]
  );

  const handleAddClient = () => {
    const label = newLabel.trim();
    if (!label || clientOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("client", label, newColor, { currency: newCurrency });
    for (const tt of taskTypeOptions) {
      for (const bu of billingUnitOptions) {
        if (bu.label === "小時") {
          defaultPricingStore.setClientPrice(label, tt.label, bu.label, 450);
        }
      }
    }
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setNewCurrency(currencies[0]?.code || "TWD");
    setAdding(false);
  };

  const cellKey = (client: string, taskType: string, billingUnit: string) =>
    `${client}::${taskType}::${billingUnit}`;

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <div>
        <h2 className="text-base font-semibold">客戶設定</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          管理客戶並依任務類型設定預設報價，選擇客戶後將自動帶入對應價格
        </p>
      </div>

      {clientOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">尚無客戶，點擊下方按鈕新增</p>
      ) : (
        <div className="space-y-1">
          {clientOptions.map((client, idx) => {
            const pricing = allPricing[client.label] || {};
            const isExpanded = expandedClients.has(client.id);
            return (
              <div key={client.id}>
                <div
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
                  }}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === idx) return;
                    const ids = clientOptions.map((o) => o.id);
                    const [moved] = ids.splice(dragIndex, 1);
                    ids.splice(idx, 0, moved);
                    selectOptionsStore.reorderOptions("client", ids);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded-md transition-colors group cursor-grab active:cursor-grabbing",
                    dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
                    dragIndex === idx && "opacity-50",
                    dragOverIndex !== idx && "hover:bg-secondary/30"
                  )}
                >
                  <button
                    type="button"
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => toggleClient(client.id)}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: client.color,
                        color: labelStyles.client.textColor,
                        borderColor: client.color,
                      }}
                    >
                      {client.label}
                    </span>
                    {client.currency && (
                      <span className="text-[10px] text-muted-foreground font-medium ml-1">{client.currency}</span>
                    )}
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Popover open={colorPickerClientId === client.id} onOpenChange={(v) => setColorPickerClientId(v ? client.id : null)}>
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
                          value={client.color}
                          onChange={(color) => selectOptionsStore.updateOptionColor("client", client.id, color)}
                          customColors={customColors}
                          onAddCustomColor={(c) => selectOptionsStore.addCustomColor("client", c)}
                          onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("client", c)}
                          colorUsageMap={getColorUsageMap(clientOptions)}
                        />
                      </PopoverContent>
                    </Popover>
                    <button
                      type="button"
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(() => selectOptionsStore.deleteOption("client", client.id), client.label);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="ml-6 mt-1 mb-2 space-y-1">
                    <div className="flex items-center gap-2 px-2 py-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">預設貨幣</Label>
                      <select
                        value={client.currency || "TWD"}
                        onChange={(e) => selectOptionsStore.updateOptionCurrency("client", client.id, e.target.value)}
                        className="h-6 rounded border border-input bg-background px-1.5 text-xs"
                      >
                        {currencies.map((c) => (
                          <option key={c.id} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-[1fr_60px_100px_36px] gap-2 px-2 text-xs text-muted-foreground font-medium border-b border-border pb-1">
                      <span>任務類型</span>
                      <span>單位</span>
                      <span className="text-right">報價</span>
                      <span />
                    </div>
                    {taskTypeOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2">尚無任務類型</p>
                    ) : (
                      taskTypeOptions.flatMap((tt) =>
                        billingUnitOptions.map((bu) => {
                          const key = cellKey(client.label, tt.label, bu.label);
                          const pricingKey = clientPricingKey(tt.label, bu.label);
                          const currentPrice = pricing[pricingKey];
                          const isEditing = editingCell === key;

                          return (
                            <div
                              key={`${tt.id}-${bu.id}`}
                              className="grid grid-cols-[1fr_60px_100px_36px] gap-2 items-center px-2 py-1 rounded-md hover:bg-secondary/30 transition-colors"
                            >
                              <span
                                className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit"
                                style={{
                                  backgroundColor: tt.color,
                                  color: labelStyles.taskType.textColor,
                                  borderColor: tt.color,
                                }}
                              >
                                {tt.label}
                              </span>

                              <span className="text-xs text-muted-foreground">{bu.label}</span>

                              <div data-cell-container>
                                {isEditing ? (
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={editValue}
                                    onChange={(e) => {
                                      if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) setEditValue(e.target.value);
                                    }}
                                    onBlur={() => handleSave(client.label, tt.label, bu.label)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSave(client.label, tt.label, bu.label);
                                      if (e.key === "Escape") setEditingCell(null);
                                      handleTabKeyDown(e, () => handleSave(client.label, tt.label, bu.label));
                                    }}
                                    autoFocus
                                    className="h-7 text-xs text-right"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    data-editable-cell
                                    className="w-full text-right text-sm tabular-nums hover:text-primary transition-colors cursor-pointer"
                                    onClick={() => {
                                      setEditingCell(key);
                                      setEditValue(currentPrice !== undefined ? String(currentPrice) : "");
                                    }}
                                  >
                                    {currentPrice !== undefined ? (
                                      currentPrice
                                    ) : (
                                      <span className="text-muted-foreground text-xs">未設定</span>
                                    )}
                                  </button>
                                )}
                              </div>

                              <div className="flex justify-center">
                                {currentPrice !== undefined && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      confirmDelete(
                                        () => removeClientPrice(client.label, tt.label, bu.label),
                                        `${client.label} / ${tt.label} / ${bu.label} 報價`
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-auto space-y-4">
        {adding ? (
          <div ref={addingRef} className="space-y-2 px-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="輸入客戶名稱"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddClient();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">貨幣</Label>
              <select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs flex-1"
              >
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </div>
            <ColorPicker
              value={newColor}
              onChange={(color) => setNewColor(color)}
              customColors={customColors}
              onAddCustomColor={(c) => selectOptionsStore.addCustomColor("client", c)}
              onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("client", c)}
              colorUsageMap={getColorUsageMap(clientOptions)}
            />
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 text-xs w-full" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增客戶
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
                  backgroundColor: clientOptions[0]?.color || PRESET_COLORS[0],
                  color: labelStyles.client.textColor,
                  borderColor: clientOptions[0]?.color || PRESET_COLORS[0],
                }}
              >
                預覽
              </span>
              <ColorPicker
                value={labelStyles.client.textColor}
                onChange={(c) => labelStyleStore.setClientTextColor(c)}
                customColors={[]}
                onAddCustomColor={() => {}}
                onRemoveCustomColor={() => {}}
                colorUsageMap={{}}
                onResetDefault={() => labelStyleStore.setClientTextColor("#FFFFFF")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
