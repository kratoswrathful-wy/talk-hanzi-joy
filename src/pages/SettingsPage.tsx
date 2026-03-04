import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useSelectOptions } from "@/stores/select-options-store";
import { useDefaultPricing } from "@/stores/default-pricing-store";

function PricingSection({
  title,
  description,
  fieldKey,
  pricingKey,
  priceLabel,
}: {
  title: string;
  description: string;
  fieldKey: string;
  pricingKey: "assignee" | "client";
  priceLabel: string;
}) {
  const { options } = useSelectOptions(fieldKey);
  const { prices, setPrice, removePrice } = useDefaultPricing(pricingKey);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleSave = (name: string) => {
    const num = Number(editValue);
    if (!isNaN(num) && num >= 0) {
      setPrice(name, num);
    }
    setEditingName(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[1fr_120px_40px] gap-2 px-2 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">
          <span>名稱</span>
          <span className="text-right">{priceLabel}</span>
          <span />
        </div>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            尚無選項，請先在下拉選單中新增
          </p>
        ) : (
          options.map((opt) => {
            const currentPrice = prices[opt.label];
            const isEditing = editingName === opt.label;

            return (
              <div
                key={opt.id}
                className="grid grid-cols-[1fr_120px_40px] gap-2 items-center px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
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
                    {opt.label}
                  </span>
                </div>

                {isEditing ? (
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editValue}
                    onChange={(e) => {
                      if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) setEditValue(e.target.value);
                    }}
                    onBlur={() => handleSave(opt.label)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave(opt.label);
                      if (e.key === "Escape") setEditingName(null);
                    }}
                    autoFocus
                    className="h-7 text-xs text-right"
                  />
                ) : (
                  <button
                    className="text-right text-sm tabular-nums hover:text-primary transition-colors cursor-pointer"
                    onClick={() => {
                      setEditingName(opt.label);
                      setEditValue(currentPrice !== undefined ? String(currentPrice) : "");
                    }}
                  >
                    {currentPrice !== undefined ? currentPrice : (
                      <span className="text-muted-foreground text-xs">未設定</span>
                    )}
                  </button>
                )}

                <div className="flex justify-center">
                  {currentPrice !== undefined && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removePrice(opt.label)}
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

      <PricingSection
        title="譯者預設單價"
        description="設定每位譯者的預設單價，建立費用單時將自動帶入"
        fieldKey="assignee"
        pricingKey="assignee"
        priceLabel="預設單價"
      />

      <PricingSection
        title="客戶預設報價"
        description="設定每位客戶的預設報價，建立費用單時將自動帶入"
        fieldKey="client"
        pricingKey="client"
        priceLabel="預設報價"
      />
    </div>
  );
}
