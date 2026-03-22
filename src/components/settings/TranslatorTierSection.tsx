import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { useTranslatorTiers, type TranslatorTier } from "@/stores/default-pricing-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { handleTabKeyDown } from "@/lib/settings-editable-cells";

// ─── Translator Tier Section ───

interface TierGroup {
  groupId: string;
  taskTypes: string[];
  billingUnit: string;
  rows: TranslatorTier[];
}

/** Validate rows for three error types */
function validateTierRows(rows: { id: string; minPrice: number; maxPrice: number; translatorPrice: number }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (rows.length === 0) return errors;

  // 1. upper < lower
  for (const r of rows) {
    if (r.maxPrice !== 0 && r.maxPrice < r.minPrice) {
      errors[r.id] = `上限 (${r.maxPrice}) 低於下限 (${r.minPrice})`;
    }
  }

  const sorted = [...rows].sort((a, b) => a.minPrice - b.minPrice);

  // 2. overlap — intervals are (min, max], so overlap when a.min < b.max && b.min < a.max
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const aMax = a.maxPrice === 0 ? Infinity : a.maxPrice;
      const bMax = b.maxPrice === 0 ? Infinity : b.maxPrice;
      if (a.minPrice < bMax && b.minPrice < aMax) {
        if (!errors[a.id]) errors[a.id] = "級距重疊";
        if (!errors[b.id]) errors[b.id] = "級距重疊";
      }
    }
  }

  // 3. gaps (only if no other errors)
  if (Object.keys(errors).length === 0 && sorted.length > 0) {
    const intervals = sorted.map((r) => ({
      id: r.id,
      min: r.minPrice,
      max: r.maxPrice === 0 ? Infinity : r.maxPrice,
    }));

    // Intervals are (min, max]. Next interval should have min === prev max for seamless coverage.
    let coveredUpTo = intervals[0].max;
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].min > coveredUpTo) {
        errors[intervals[i - 1].id] = `空白區段：${coveredUpTo} ~ ${intervals[i].min}`;
        errors[intervals[i].id] = errors[intervals[i].id] || `空白區段：${coveredUpTo} ~ ${intervals[i].min}`;
      }
      if (intervals[i].max > coveredUpTo) {
        coveredUpTo = intervals[i].max;
      }
    }
    if (coveredUpTo !== Infinity) {
      const last = intervals[intervals.length - 1];
      errors[last.id] = errors[last.id] || `未涵蓋至無限大（上限 ${sorted[sorted.length - 1].maxPrice} 之後無級距）`;
    }
  }

  return errors;
}

/** Draft row for the tier group editor modal */
interface DraftTierRow {
  id: string;
  minPrice: string;
  maxPrice: string;
  translatorPrice: string;
}

function generateDraftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}

/** Standalone modal for creating/editing a full tier group */
function TierGroupEditorModal({
  taskTypeOptions,
  billingUnits,
  onCommit,
  onClose,
}: {
  taskTypeOptions: { id: string; label: string; color: string }[];
  billingUnits: string[];
  onCommit: (taskTypes: string[], billingUnit: string, rows: { minPrice: number; maxPrice: number; translatorPrice: number }[]) => void;
  onClose: () => void;
}) {
  const labelStyles = useLabelStyles();
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState("字");
  const [draftRows, setDraftRows] = useState<DraftTierRow[]>([
    { id: generateDraftId(), minPrice: "", maxPrice: "", translatorPrice: "" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleTaskType = (label: string) => {
    setSelectedTaskTypes((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  };

  const updateRow = (id: string, field: keyof Omit<DraftTierRow, "id">, value: string) => {
    if (!/^[0-9]*\.?[0-9]*$/.test(value)) return;
    setDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    // Clear error for this row
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const addRow = () => {
    setDraftRows((prev) => [...prev, { id: generateDraftId(), minPrice: "", maxPrice: "", translatorPrice: "" }]);
  };

  const removeRow = (id: string) => {
    setDraftRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = () => {
    if (selectedTaskTypes.length === 0) {
      toast.error("請至少選擇一個任務類型");
      return;
    }
    if (draftRows.length === 0) {
      toast.error("請至少新增一筆級距");
      return;
    }

    // Convert to numbers
    const parsed = draftRows.map((r) => ({
      id: r.id,
      minPrice: Number(r.minPrice) || 0,
      maxPrice: Number(r.maxPrice) || 0,
      translatorPrice: Number(r.translatorPrice) || 0,
    }));

    // Validate
    const validationErrors = validateTierRows(parsed);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    onCommit(
      selectedTaskTypes,
      selectedUnit,
      parsed.map((r) => ({ minPrice: r.minPrice, maxPrice: r.maxPrice, translatorPrice: r.translatorPrice }))
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">新增級距組合</h3>
          <p className="text-xs text-muted-foreground">
            選擇任務類型、計費單位，並設定完整的級距範圍。上限輸入 0 代表無限大 (∞)。
          </p>
        </div>

        {/* Task type selection */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">任務類型</p>
          <div className="flex flex-wrap gap-2">
            {taskTypeOptions.map((tt) => (
              <button
                key={tt.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                  selectedTaskTypes.includes(tt.label)
                    ? "ring-2 ring-primary/50 scale-105"
                    : "opacity-70 hover:opacity-100"
                )}
                style={{
                  backgroundColor: tt.color,
                  color: labelStyles.taskType.textColor,
                  borderColor: tt.color,
                }}
                onClick={() => toggleTaskType(tt.label)}
              >
                {tt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Billing unit */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">計費單位</p>
          <div className="flex gap-2">
            {billingUnits.map((u) => (
              <Button
                key={u}
                variant={selectedUnit === u ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedUnit(u)}
              >
                {u}
              </Button>
            ))}
          </div>
        </div>

        {/* Tier rows */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">級距設定</p>
          <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 px-1 text-xs text-muted-foreground font-medium">
            <span>下限 <span className="font-normal opacity-60">(&gt;)</span></span>
            <span>上限 <span className="font-normal opacity-60">(≤, 0=∞)</span></span>
            <span>譯者單價</span>
            <span />
          </div>

          {draftRows.map((row, idx) => (
            <div key={row.id}>
              <div className={cn(
                "grid grid-cols-[1fr_1fr_1fr_28px] gap-2 items-center px-1",
                errors[row.id] && "ring-1 ring-destructive/50 rounded-md bg-destructive/5 p-1"
              )}>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={row.minPrice}
                  onChange={(e) => updateRow(row.id, "minPrice", e.target.value)}
                  placeholder="0"
                  className="h-7 text-xs"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={row.maxPrice}
                  onChange={(e) => updateRow(row.id, "maxPrice", e.target.value)}
                  placeholder="0"
                  className="h-7 text-xs"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={row.translatorPrice}
                  onChange={(e) => updateRow(row.id, "translatorPrice", e.target.value)}
                  placeholder="0"
                  className="h-7 text-xs"
                />
                <div className="flex justify-center">
                  {draftRows.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              {errors[row.id] && (
                <p className="text-xs text-destructive px-1 mt-0.5">{errors[row.id]}</p>
              )}
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={addRow}
          >
            <Plus className="h-3 w-3" />
            新增級距
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2 border-t border-border">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSubmit}>
            確定
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TranslatorTierSection() {
  const { tiers, addTier, addTierToGroup, updateTierRow, removeTierRow } = useTranslatorTiers();
  const { confirmDelete } = useDeleteConfirm();
  const { options: taskTypeOptions } = useSelectOptions("taskType");
  const { options: buOptions } = useSelectOptions("billingUnit");
  const labelStyles = useLabelStyles();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [uncommittedIds, setUncommittedIds] = useState<Set<string>>(new Set());
  const [showEditor, setShowEditor] = useState(false);

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorGroupId, setErrorGroupId] = useState<string | null>(null);
  const [errorTierIds, setErrorTierIds] = useState<Record<string, string>>({});
  const [modalEditingField, setModalEditingField] = useState<string | null>(null);
  const [modalEditValue, setModalEditValue] = useState("");

  const handleSaveField = useCallback((tierId: string, field: "minPrice" | "maxPrice" | "translatorPrice") => {
    const num = Number(editValue);
    if (!isNaN(num) && num >= 0) {
      updateTierRow(tierId, { [field]: num });
    }
    setEditingField(null);
    setUncommittedIds((prev) => {
      if (!prev.has(tierId)) return prev;
      const next = new Set(prev);
      next.delete(tierId);
      return next;
    });
  }, [editValue, updateTierRow]);

  const handleModalSaveField = useCallback((tierId: string, field: "minPrice" | "maxPrice" | "translatorPrice") => {
    const num = Number(modalEditValue);
    if (!isNaN(num) && num >= 0) {
      updateTierRow(tierId, { [field]: num });
    }
    setModalEditingField(null);
  }, [modalEditValue, updateTierRow]);

  const billingUnits = buOptions.map((o) => o.label);
  const groups: TierGroup[] = [];
  const seenGroups = new Set<string>();
  for (const tier of tiers) {
    if (seenGroups.has(tier.groupId)) continue;
    seenGroups.add(tier.groupId);
    const groupTiers = tiers.filter((t) => t.groupId === tier.groupId);
    const taskTypes = [...new Set(groupTiers.map((t) => t.taskType))];
    const rowMap = new Map<string, TranslatorTier>();
    for (const t of groupTiers) {
      const rk = `${t.minPrice}::${t.maxPrice}::${t.translatorPrice}`;
      if (!rowMap.has(rk)) rowMap.set(rk, t);
    }
    const committedRows = [...rowMap.values()].filter((t) => !uncommittedIds.has(t.id));
    const uncommittedRows = [...rowMap.values()].filter((t) => uncommittedIds.has(t.id));
    const rows = [...committedRows.sort((a, b) => a.minPrice - b.minPrice), ...uncommittedRows];
    groups.push({ groupId: tier.groupId, taskTypes, billingUnit: tier.billingUnit, rows });
  }

  // Re-validate when modal is open
  useEffect(() => {
    if (errorModalOpen && errorGroupId) {
      const group = groups.find((g) => g.groupId === errorGroupId);
      if (!group) { setErrorModalOpen(false); return; }
      const committedRows = group.rows.filter((r) => !uncommittedIds.has(r.id));
      const errors = validateTierRows(committedRows);
      setErrorTierIds(errors);
      if (Object.keys(errors).length === 0) { setErrorModalOpen(false); setErrorGroupId(null); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers, errorModalOpen, errorGroupId]);

  // Validate all groups on tier change
  useEffect(() => {
    if (errorModalOpen) return;
    for (const group of groups) {
      const committedRows = group.rows.filter((r) => !uncommittedIds.has(r.id));
      const errors = validateTierRows(committedRows);
      if (Object.keys(errors).length > 0) {
        setErrorTierIds(errors);
        setErrorGroupId(group.groupId);
        setErrorModalOpen(true);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers, errorModalOpen]);

  const fieldKey = (tierId: string, field: string) => `${tierId}::${field}`;

  const renderTierValue = (tier: TranslatorTier, field: "minPrice" | "maxPrice" | "translatorPrice", inModal = false) => {
    const currentEditingField = inModal ? modalEditingField : editingField;
    const currentEditValue = inModal ? modalEditValue : editValue;
    const setCurrentEditingField = inModal ? setModalEditingField : setEditingField;
    const setCurrentEditValue = inModal ? setModalEditValue : setEditValue;
    const saveFn = inModal ? handleModalSaveField : handleSaveField;
    const key = fieldKey(tier.id, field);
    const isEditing = currentEditingField === key;
    const displayValue = field === "maxPrice" && tier[field] === 0 ? "∞" : tier[field];
    return (
      <div key={field} data-cell-container>
        {isEditing ? (
          <Input
            type="text"
            inputMode="decimal"
            value={currentEditValue}
            onChange={(e) => {
              if (/^[0-9]*\.?[0-9]*$/.test(e.target.value)) setCurrentEditValue(e.target.value);
            }}
            onBlur={() => saveFn(tier.id, field)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveFn(tier.id, field);
              if (e.key === "Escape") setCurrentEditingField(null);
              if (!inModal) handleTabKeyDown(e, () => saveFn(tier.id, field));
            }}
            autoFocus
            className="h-7 text-xs"
          />
        ) : (
          <button
            data-editable-cell
            className="w-full text-left text-sm tabular-nums hover:text-primary transition-colors cursor-pointer"
            onClick={() => {
              setCurrentEditingField(key);
              setCurrentEditValue(String(tier[field]));
            }}
          >
            {displayValue}
          </button>
        )}
      </div>
    );
  };

  const renderTaskTypeBadges = (taskTypes: string[]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {taskTypes.map((tt) => {
        const ttOpt = taskTypeOptions.find((o) => o.label === tt);
        return ttOpt ? (
          <span
            key={tt}
            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: ttOpt.color,
              color: labelStyles.taskType.textColor,
              borderColor: ttOpt.color,
            }}
          >
            {tt}
          </span>
        ) : (
          <span key={tt} className="text-sm font-medium">{tt}</span>
        );
      })}
    </div>
  );

  const errorGroup = errorGroupId ? groups.find((g) => g.groupId === errorGroupId) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">譯者單價級距</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          依客戶報價範圍設定對應的譯者單價。上限輸入 0 代表無限大 (∞)。
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          尚未設定級距，點擊下方按鈕新增
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.groupId} className="space-y-2">
              <div className="flex items-center gap-2">
                {renderTaskTypeBadges(group.taskTypes)}
                <span className="text-xs text-muted-foreground">／{group.billingUnit}</span>
              </div>

              <div className="grid grid-cols-[1fr_1fr_1fr_36px] gap-2 px-2 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">
                <span>下限</span>
                <span>上限 <span className="font-normal text-[10px] opacity-70">(0=∞)</span></span>
                <span>譯者單價</span>
                <span />
              </div>

              {group.rows.map((tier) => (
                <div
                  key={tier.id}
                  className={cn(
                    "grid grid-cols-[1fr_1fr_1fr_36px] gap-2 items-center px-2 py-1.5 rounded-md transition-colors",
                    uncommittedIds.has(tier.id) ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-secondary/30"
                  )}
                >
                  {renderTierValue(tier, "minPrice")}
                  {renderTierValue(tier, "maxPrice")}
                  {renderTierValue(tier, "translatorPrice")}
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        confirmDelete(() => {
                          removeTierRow(tier.id);
                          setUncommittedIds((prev) => {
                            if (!prev.has(tier.id)) return prev;
                            const next = new Set(prev);
                            next.delete(tier.id);
                            return next;
                          });
                        }, "此級距");
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground"
                onClick={() => {
                  const newIds = addTierToGroup(group.groupId, 0, 0, 0);
                  if (newIds.length > 0) {
                    setUncommittedIds((prev) => {
                      const next = new Set(prev);
                      newIds.forEach((id) => next.add(id));
                      return next;
                    });
                    const repId = newIds[0];
                    setEditingField(fieldKey(repId, "minPrice"));
                    setEditValue("0");
                  }
                }}
              >
                <Plus className="h-3 w-3" />
                新增級距
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="gap-1 text-xs"
        onClick={() => setShowEditor(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        新增級距組合
      </Button>

      {showEditor && (
        <TierGroupEditorModal
          taskTypeOptions={taskTypeOptions}
          billingUnits={billingUnits}
          onCommit={(taskTypes, billingUnit, rows) => {
            const gid = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
            for (const row of rows) {
              taskTypes.forEach((tt) => addTier(tt, billingUnit, row.minPrice, row.maxPrice, row.translatorPrice, gid));
            }
            setShowEditor(false);
          }}
          onClose={() => setShowEditor(false)}
        />
      )}

      {errorModalOpen && errorGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-destructive/50 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-destructive flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
                級距設定錯誤
              </h3>
              <p className="text-xs text-muted-foreground">
                以下級距存在錯誤，請修正數值或刪除有問題的級距後才能繼續操作。
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {renderTaskTypeBadges(errorGroup.taskTypes)}
                <span className="text-xs text-muted-foreground">／{errorGroup.billingUnit}</span>
              </div>

              <div className="grid grid-cols-[1fr_1fr_1fr_36px] gap-2 px-2 py-1.5 text-xs text-muted-foreground font-medium border-b border-border">
                <span>下限</span>
                <span>上限</span>
                <span>譯者單價</span>
                <span />
              </div>

              {errorGroup.rows.filter((r) => !uncommittedIds.has(r.id)).map((tier) => (
                <div key={tier.id}>
                  <div
                    className={cn(
                      "grid grid-cols-[1fr_1fr_1fr_36px] gap-2 items-center px-2 py-1.5 rounded-md transition-colors",
                      errorTierIds[tier.id]
                        ? "ring-1 ring-destructive/50 bg-destructive/5"
                        : "hover:bg-secondary/30"
                    )}
                  >
                    {renderTierValue(tier, "minPrice", true)}
                    {renderTierValue(tier, "maxPrice", true)}
                    {renderTierValue(tier, "translatorPrice", true)}
                    <div className="flex justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => confirmDelete(() => removeTierRow(tier.id), "此級距")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {errorTierIds[tier.id] && (
                    <p className="text-xs text-destructive px-2 mt-0.5">{errorTierIds[tier.id]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}