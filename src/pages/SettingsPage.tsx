import { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useSelectOptions } from "@/stores/select-options-store";
import { useClientPricing, useTranslatorTiers } from "@/stores/default-pricing-store";

/** Find the next editable cell in DOM order and click it */
function focusNextEditableCell(currentElement: HTMLElement, reverse = false) {
  const allCells = Array.from(
    document.querySelectorAll<HTMLElement>("[data-editable-cell]")
  );
  if (allCells.length === 0) return;

  // Find closest ancestor or self that is an editable cell, or find by parent
  const container = currentElement.closest("[data-cell-container]");
  const currentIndex = allCells.findIndex(
    (cell) => cell === container || container?.contains(cell) || cell.contains(currentElement)
  );

  const nextIndex = reverse
    ? (currentIndex - 1 + allCells.length) % allCells.length
    : (currentIndex + 1) % allCells.length;

  allCells[nextIndex]?.click();
}

function handleTabKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  onSave: () => void
) {
  if (e.key === "Tab") {
    e.preventDefault();
    onSave();
    // Use rAF to wait for state update and re-render
    requestAnimationFrame(() => {
      focusNextEditableCell(e.target as HTMLElement, e.shiftKey);
    });
  }
}

function ClientPricingSection() {
  const { options: clientOptions } = useSelectOptions("client");
  const { options: taskTypeOptions } = useSelectOptions("clientTaskType");
  const { getAllClientPricing, setClientPrice, removeClientPrice } = useClientPricing();
  const allPricing = getAllClientPricing();

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleSave = useCallback((client: string, taskType: string) => {
    const num = Number(editValue);
    if (!isNaN(num) && num >= 0) {
      if (num === 0) {
        removeClientPrice(client, taskType);
      } else {
        setClientPrice(client, taskType, num);
      }
    }
    setEditingCell(null);
  }, [editValue, setClientPrice, removeClientPrice]);

  const cellKey = (client: string, taskType: string) => `${client}::${taskType}`;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">客戶預設報價</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          依客戶與任務類型設定預設報價，選擇客戶後將自動帶入對應價格
        </p>
      </div>

      {clientOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          尚無客戶選項，請先在費用單的客戶欄位中新增
        </p>
      ) : (
        <div className="space-y-4">
          {clientOptions.map((client) => {
            const pricing = allPricing[client.label] || {};
            return (
              <div key={client.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: client.color + "22",
                      color: client.color,
                      borderColor: client.color + "44",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: client.color }}
                    />
                    {client.label}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_100px_36px] gap-2 px-2 text-xs text-muted-foreground font-medium border-b border-border pb-1">
                  <span>任務類型</span>
                  <span className="text-right">報價</span>
                  <span />
                </div>
                {taskTypeOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2">尚無任務類型</p>
                ) : (
                  taskTypeOptions.map((tt) => {
                    const key = cellKey(client.label, tt.label);
                    const currentPrice = pricing[tt.label];
                    const isEditing = editingCell === key;

                    return (
                      <div
                        key={tt.id}
                        className="grid grid-cols-[1fr_100px_36px] gap-2 items-center px-2 py-1 rounded-md hover:bg-secondary/30 transition-colors"
                      >
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium w-fit"
                          style={{
                            backgroundColor: tt.color + "22",
                            color: tt.color,
                            borderColor: tt.color + "44",
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: tt.color }}
                          />
                          {tt.label}
                        </span>

                        <div data-cell-container>
                          {isEditing ? (
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={editValue}
                              onChange={(e) => {
                                if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) setEditValue(e.target.value);
                              }}
                              onBlur={() => handleSave(client.label, tt.label)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave(client.label, tt.label);
                                if (e.key === "Escape") setEditingCell(null);
                                handleTabKeyDown(e, () => handleSave(client.label, tt.label));
                              }}
                              autoFocus
                              className="h-7 text-xs text-right"
                            />
                          ) : (
                            <button
                              data-editable-cell
                              className="w-full text-right text-sm tabular-nums hover:text-primary transition-colors cursor-pointer"
                              onClick={() => {
                                setEditingCell(key);
                                setEditValue(currentPrice !== undefined ? String(currentPrice) : "");
                              }}
                            >
                              {currentPrice !== undefined ? currentPrice : (
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
                              onClick={() => removeClientPrice(client.label, tt.label)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TranslatorTierSection() {
  const { tiers, addTier, updateTier, removeTier } = useTranslatorTiers();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleSaveField = useCallback((tierId: string, field: "minPrice" | "maxPrice" | "translatorPrice") => {
    const num = Number(editValue);
    if (!isNaN(num) && num >= 0) {
      updateTier(tierId, { [field]: num });
    }
    setEditingField(null);
  }, [editValue, updateTier]);

  const fieldKey = (tierId: string, field: string) => `${tierId}::${field}`;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">譯者單價級距</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          根據客戶報價的範圍，自動對應譯者的預設單價
        </p>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_1fr_1fr_36px] gap-2 px-2 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">
          <span>客戶報價下限 (&gt;)</span>
          <span>客戶報價上限 (≦)</span>
          <span>對應譯者單價</span>
          <span />
        </div>

        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            尚未設定級距，點擊下方按鈕新增
          </p>
        ) : (
          tiers.map((tier) => (
            <div
              key={tier.id}
              className="grid grid-cols-[1fr_1fr_1fr_36px] gap-2 items-center px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors"
            >
              {(["minPrice", "maxPrice", "translatorPrice"] as const).map((field) => {
                const key = fieldKey(tier.id, field);
                const isEditing = editingField === key;

                return (
                  <div key={field} data-cell-container>
                    {isEditing ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => {
                          if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) setEditValue(e.target.value);
                        }}
                        onBlur={() => handleSaveField(tier.id, field)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveField(tier.id, field);
                          if (e.key === "Escape") setEditingField(null);
                          handleTabKeyDown(e, () => handleSaveField(tier.id, field));
                        }}
                        autoFocus
                        className="h-7 text-xs"
                      />
                    ) : (
                      <button
                        data-editable-cell
                        className="w-full text-left text-sm tabular-nums hover:text-primary transition-colors cursor-pointer"
                        onClick={() => {
                          setEditingField(key);
                          setEditValue(String(tier[field]));
                        }}
                      >
                        {tier[field]}
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => removeTier(tier.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="gap-1 text-xs"
        onClick={() => addTier(0, 0, 0)}
      >
        <Plus className="h-3.5 w-3.5" />
        新增級距
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理應用程式偏好設定</p>
      </div>

      <ClientPricingSection />
      <TranslatorTierSection />
    </div>
  );
}
