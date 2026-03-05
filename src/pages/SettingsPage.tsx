import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, GripVertical, Pencil, Shield } from "lucide-react";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useClientPricing, useTranslatorTiers } from "@/stores/default-pricing-store";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type PermissionConfig } from "@/hooks/use-permissions";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Find the next editable cell in DOM order and click it */
function focusNextEditableCell(currentElement: HTMLElement, reverse = false) {
  const allCells = Array.from(
    document.querySelectorAll<HTMLElement>("[data-editable-cell]")
  );
  if (allCells.length === 0) return;

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
    requestAnimationFrame(() => {
      focusNextEditableCell(e.target as HTMLElement, e.shiftKey);
    });
  }
}

// ─── Client Management Section ───

function ClientManagementSection() {
  const { options: clientOptions } = useSelectOptions("client");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || clientOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("client", label, newColor);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">客戶管理</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          新增或移除客戶，變更會同步至費用清單
        </p>
      </div>

      <div className="space-y-1">
        {clientOptions.map((opt) => (
          <div
            key={opt.id}
            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors"
          >
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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => selectOptionsStore.deleteOption("client", opt.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-2 px-2">
          <Input
            ref={inputRef}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="輸入客戶名稱"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setAdding(false);
            }}
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
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={!newLabel.trim()} onClick={handleAdd}>
              新增
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          新增客戶
        </Button>
      )}
    </div>
  );
}

// ─── Client Pricing Section ───

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
          尚無客戶選項，請先在上方新增客戶
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

// ─── Task Type Order Section (drag reorder) ───

function TaskTypeOrderSection() {
  const { options: taskTypeOptions } = useSelectOptions("clientTaskType");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (idx: number) => {
    setDragIndex(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) {
      setDragOverIndex(idx);
    }
  };

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = taskTypeOptions.map((o) => o.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderOptions("clientTaskType", ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">任務類型順序</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          拖曳調整任務類型的顯示順序，變更會套用到所有客戶
        </p>
      </div>

      <div className="space-y-1">
        {taskTypeOptions.map((tt, idx) => (
          <div
            key={tt.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-grab active:cursor-grabbing",
              dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
              dragIndex === idx && "opacity-50",
              dragOverIndex !== idx && "hover:bg-secondary/30"
            )}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
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
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Translator Notes Section (DB-backed) ───

interface MemberWithSettings {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  isInvitation: boolean;
  note: string;
  no_fee: boolean;
}

function TranslatorNotesSection() {
  const [members, setMembers] = useState<MemberWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [{ data: profiles }, { data: invitations }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("email, display_name, avatar_url"),
      supabase.from("invitations").select("email, role").is("accepted_at", null),
      supabase.from("member_translator_settings").select("*"),
    ]);

    const settingsMap = new Map<string, { note: string; no_fee: boolean }>();
    (settings || []).forEach((s: any) => settingsMap.set(s.email, { note: s.note || "", no_fee: s.no_fee || false }));

    const result: MemberWithSettings[] = [];

    // Registered members
    (profiles || []).forEach((p: any) => {
      const s = settingsMap.get(p.email) || { note: "", no_fee: false };
      result.push({
        email: p.email,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        isInvitation: false,
        note: s.note,
        no_fee: s.no_fee,
      });
    });

    // Invited but not registered
    const registeredEmails = new Set((profiles || []).map((p: any) => p.email));
    (invitations || []).forEach((inv: any) => {
      if (!registeredEmails.has(inv.email)) {
        const s = settingsMap.get(inv.email) || { note: "", no_fee: false };
        result.push({
          email: inv.email,
          display_name: null,
          avatar_url: null,
          isInvitation: true,
          note: s.note,
          no_fee: s.no_fee,
        });
      }
    });

    setMembers(result);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const upsertSetting = async (email: string, updates: { note?: string; no_fee?: boolean }) => {
    const existing = members.find((m) => m.email === email);
    const currentNote = existing?.note || "";
    const currentNoFee = existing?.no_fee || false;

    const { error } = await supabase.from("member_translator_settings").upsert(
      {
        email,
        note: updates.note ?? currentNote,
        no_fee: updates.no_fee ?? currentNoFee,
      },
      { onConflict: "email" }
    );

    if (error) {
      toast.error("儲存失敗：" + error.message);
    } else {
      // Optimistic update
      setMembers((prev) =>
        prev.map((m) =>
          m.email === email
            ? { ...m, note: updates.note ?? m.note, no_fee: updates.no_fee ?? m.no_fee }
            : m
        )
      );
    }
  };

  const handleSaveNote = (email: string) => {
    upsertSetting(email, { note: editValue.trim() });
    setEditingEmail(null);
  };

  const handleToggleNoFee = (email: string, checked: boolean) => {
    upsertSetting(email, { no_fee: checked });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">譯者稿費備註</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          為每位譯者設定稿費相關備註，例如「正職譯者，稿費基準為翻譯每字 +0.1」
        </p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">載入中…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">尚無團隊成員</p>
        ) : (
          members.map((member) => {
            const displayLabel = member.display_name || member.email;
            const initials = displayLabel.slice(0, 2).toUpperCase();
            const isEditing = editingEmail === member.email;

            return (
              <div
                key={member.email}
                className="px-2 py-2 rounded-md hover:bg-secondary/30 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{displayLabel}</span>
                    {member.isInvitation && (
                      <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">待接受</span>
                    )}
                    <div className="flex items-center gap-1.5 ml-8">
                      <Checkbox
                        id={`no-fee-${member.email}`}
                        checked={member.no_fee}
                        onCheckedChange={(checked) => handleToggleNoFee(member.email, !!checked)}
                      />
                      <Label htmlFor={`no-fee-${member.email}`} className="text-xs cursor-pointer text-muted-foreground">
                        不開單譯者
                      </Label>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => {
                      setEditingEmail(member.email);
                      setEditValue(member.note);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>

                {isEditing ? (
                  <div className="space-y-2 pl-8">
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="輸入稿費備註..."
                      className="text-xs min-h-[60px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingEmail(null);
                      }}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditingEmail(null)}>
                        取消
                      </Button>
                      <Button size="sm" className="h-6 text-xs" onClick={() => handleSaveNote(member.email)}>
                        儲存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="pl-8">
                    {member.note ? (
                      <p className="text-xs text-muted-foreground px-1">{member.note}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 px-1 italic">尚未設定備註</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Translator Tier Section ───

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

// ─── Permission Management Section (Executive only) ───

const fieldLabelMap: Record<string, string> = {
  title: "標題",
  assignee: "譯者",
  taskType: "任務類型",
  billingUnit: "計費單位",
  unitPrice: "單價",
  unitCount: "計費單位數",
  client: "客戶",
  contact: "聯絡人",
  clientCaseId: "客戶案號",
  clientPoNumber: "PO 編號",
  hdPath: "硬碟路徑",
  reconciled: "已對帳",
  rateConfirmed: "費率已確認",
  invoiced: "已請款",
  sameCase: "同一案件",
  clientRevenue: "客戶端營收",
  profit: "利潤",
  internalNote: "相關案件",
};

const sectionLabelMap: Record<string, string> = {
  client_management: "客戶管理",
  task_type_order: "任務類型順序",
  client_pricing: "客戶預設報價",
  translator_tiers: "譯者單價級距",
  translator_notes: "譯者稿費備註",
};

const roleLabelMap: Record<string, string> = {
  member: "譯者",
  pm: "PM",
  executive: "執行官",
};

function PermissionManagementSection() {
  const { config, updateConfig } = usePermissions();
  const [localConfig, setLocalConfig] = useState<PermissionConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const activeConfig = localConfig || config;

  const toggleFieldPerm = (role: string, field: string, perm: "view" | "edit") => {
    const next = { ...activeConfig };
    next.fields = { ...next.fields };
    next.fields[role] = { ...next.fields[role] };
    next.fields[role][field] = { ...next.fields[role][field] };
    const current = next.fields[role][field][perm];
    next.fields[role][field][perm] = !current;
    if (perm === "view" && current) {
      next.fields[role][field].edit = false;
    }
    if (perm === "edit" && !current) {
      next.fields[role][field].view = true;
    }
    setLocalConfig(next);
  };

  const toggleSectionPerm = (role: string, section: string) => {
    const next = { ...activeConfig };
    next.settings_sections = { ...next.settings_sections };
    next.settings_sections[role] = { ...next.settings_sections[role] };
    next.settings_sections[role][section] = !next.settings_sections[role][section];
    setLocalConfig(next);
  };

  const handleSave = async () => {
    if (!localConfig) return;
    setSaving(true);
    const error = await updateConfig(localConfig);
    if (error) {
      toast.error("儲存失敗：" + error.message);
    } else {
      toast.success("權限設定已更新");
      setLocalConfig(null);
    }
    setSaving(false);
  };

  const editableRoles = ["member", "pm"];

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-base font-semibold">權限管理</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            設定各角色可檢視與編輯的欄位，以及可存取的設定區塊
          </p>
        </div>
      </div>

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">欄位權限</TabsTrigger>
          <TabsTrigger value="sections">設定區塊</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4 mt-4">
          {editableRoles.map((role) => (
            <div key={role} className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">{roleLabelMap[role]}</h3>
              <div className="grid grid-cols-[1fr_60px_60px] gap-1 px-2 py-1 text-xs text-muted-foreground font-medium border-b border-border">
                <span>欄位</span>
                <span className="text-center">檢視</span>
                <span className="text-center">編輯</span>
              </div>
              {Object.entries(fieldLabelMap).map(([key, label]) => {
                const fp = activeConfig.fields[role]?.[key] || { view: true, edit: false };
                return (
                  <div key={key} className="grid grid-cols-[1fr_60px_60px] gap-1 items-center px-2 py-1 rounded-md hover:bg-secondary/30 transition-colors">
                    <span className="text-sm">{label}</span>
                    <div className="flex justify-center">
                      <Switch
                        checked={fp.view}
                        onCheckedChange={() => toggleFieldPerm(role, key, "view")}
                        className="scale-75"
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={fp.edit}
                        onCheckedChange={() => toggleFieldPerm(role, key, "edit")}
                        className="scale-75"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="sections" className="space-y-4 mt-4">
          {editableRoles.map((role) => (
            <div key={role} className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">{roleLabelMap[role]}</h3>
              {Object.entries(sectionLabelMap).map(([key, label]) => {
                const allowed = activeConfig.settings_sections[role]?.[key] ?? false;
                return (
                  <div key={key} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={allowed}
                      onCheckedChange={() => toggleSectionPerm(role, key)}
                      className="scale-75"
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {localConfig && (
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => setLocalConfig(null)}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            儲存變更
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Page ───

export default function SettingsPage() {
  const { primaryRole } = useAuth();
  const { canViewSection, loading } = usePermissions();
  const isExecutive = primaryRole === "executive";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理應用程式偏好設定</p>
      </div>

      {/* Permission management - executive only */}
      {isExecutive && <PermissionManagementSection />}

      {/* Admin sections - based on permission config */}
      {canViewSection("client_management") && <ClientManagementSection />}
      {canViewSection("task_type_order") && <TaskTypeOrderSection />}
      {canViewSection("translator_notes") && <TranslatorNotesSection />}
      {canViewSection("client_pricing") && <ClientPricingSection />}
      {canViewSection("translator_tiers") && <TranslatorTierSection />}
    </div>
  );
}
