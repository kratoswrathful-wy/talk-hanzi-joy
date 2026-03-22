import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";
import { useCurrencies } from "@/stores/currency-store";
import { cn } from "@/lib/utils";

/** 設定 → 貨幣與新台幣匯率 */
export function CurrencySettingsSection() {
  const { confirmDelete } = useDeleteConfirm();
  const { currencies, addCurrency, updateCurrency, deleteCurrency, reorderCurrencies } = useCurrencies();
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRate, setNewRate] = useState("1");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");

  const handleAdd = () => {
    const code = newCode.trim().toUpperCase();
    const label = newLabel.trim();
    const rate = Number(newRate);
    if (!code || !label || isNaN(rate) || rate <= 0) return;
    if (currencies.some((c) => c.code === code)) return;
    addCurrency(code, label, rate);
    setNewCode("");
    setNewLabel("");
    setNewRate("1");
    setAdding(false);
  };

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = currencies.map((c) => c.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    reorderCurrencies(ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 gap-4 flex flex-col">
      <div>
        <h2 className="text-base font-semibold">貨幣設定</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          管理貨幣種類及其新台幣匯率。客戶報價將使用此匯率換算利潤。
        </p>
      </div>

      <div className="space-y-1">
        {currencies.map((cur, idx) => (
          <div
            key={cur.id}
            draggable
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
            }}
            onDrop={() => handleDrop(idx)}
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
            <div className="flex items-center gap-3 flex-1">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium w-12">{cur.code}</span>
              <span className="text-sm text-muted-foreground">{cur.label}</span>
              <span className="text-xs text-muted-foreground ml-auto mr-2">1 {cur.code} =</span>
              {editingId === cur.id ? (
                <Input
                  value={editRate}
                  onChange={(e) => {
                    if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) setEditRate(e.target.value);
                  }}
                  onBlur={() => {
                    const rate = Number(editRate);
                    if (!isNaN(rate) && rate > 0) updateCurrency(cur.id, { twdRate: rate });
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const rate = Number(editRate);
                      if (!isNaN(rate) && rate > 0) updateCurrency(cur.id, { twdRate: rate });
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="h-6 w-16 text-xs text-right"
                />
              ) : (
                <button
                  type="button"
                  className="text-sm tabular-nums hover:text-primary cursor-pointer w-16 text-right"
                  onClick={() => {
                    setEditingId(cur.id);
                    setEditRate(String(cur.twdRate));
                  }}
                >
                  {cur.twdRate}
                </button>
              )}
              <span className="text-xs text-muted-foreground">TWD</span>
            </div>
            {cur.code !== "TWD" ? (
              <button
                type="button"
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                onClick={() => confirmDelete(() => deleteCurrency(cur.id), cur.label)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="h-6 w-6 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-2 px-2">
          <div className="flex items-center gap-2">
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="貨幣代碼 (如 USD)"
              className="h-7 text-xs flex-1"
              autoFocus
            />
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="名稱 (如 美元)"
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">新台幣匯率</Label>
            <Input
              value={newRate}
              onChange={(e) => {
                if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) setNewRate(e.target.value);
              }}
              placeholder="30"
              className="h-7 text-xs w-20"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAdd}>
              新增
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-1 text-xs w-full" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          新增貨幣
        </Button>
      )}
    </div>
  );
}
