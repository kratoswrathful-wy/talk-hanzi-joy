import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, GripVertical, Pencil, Shield, ChevronDown, ChevronRight, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles, labelStyleStore } from "@/stores/label-style-store";
import { useClientPricing, useTranslatorTiers, type TranslatorTier } from "@/stores/default-pricing-store";
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
function focusNextEditableCell(container: Element | null, reverse = false) {
  const allCells = Array.from(
    document.querySelectorAll<HTMLElement>("[data-editable-cell]")
  );
  if (allCells.length === 0) return;

  const currentIndex = allCells.findIndex(
    (cell) => container?.contains(cell) || cell === container
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
    const container = (e.target as HTMLElement).closest("[data-cell-container]");
    const reverse = e.shiftKey;
    onSave();
    requestAnimationFrame(() => {
      focusNextEditableCell(container, reverse);
    });
  }
}

// ─── Client Pricing Section (with integrated client management) ───

function ClientPricingSection() {
  const { options: clientOptions, customColors } = useSelectOptions("client");
  const labelStyles = useLabelStyles();
  const { options: taskTypeOptions } = useSelectOptions("clientTaskType");
  const { getAllClientPricing, setClientPrice, removeClientPrice } = useClientPricing();
  const allPricing = getAllClientPricing();

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [colorPickerClientId, setColorPickerClientId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Add client state
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const toggleClient = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  const handleAddClient = () => {
    const label = newLabel.trim();
    if (!label || clientOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("client", label, newColor);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  const cellKey = (client: string, taskType: string) => `${client}::${taskType}`;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">客戶設定</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          管理客戶並依任務類型設定預設報價，選擇客戶後將自動帶入對應價格
        </p>
      </div>

      {clientOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          尚無客戶，點擊下方按鈕新增
        </p>
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
                  onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx); }}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === idx) return;
                    const ids = clientOptions.map((o) => o.id);
                    const [moved] = ids.splice(dragIndex, 1);
                    ids.splice(idx, 0, moved);
                    selectOptionsStore.reorderOptions("client", ids);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded-md transition-colors group cursor-grab active:cursor-grabbing",
                    dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
                    dragIndex === idx && "opacity-50",
                    dragOverIndex !== idx && "hover:bg-secondary/30"
                  )}
                >
                  <button
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
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Popover
                      open={colorPickerClientId === client.id}
                      onOpenChange={(v) => setColorPickerClientId(v ? client.id : null)}
                    >
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
                          value={client.color}
                          onChange={(color) => selectOptionsStore.updateOptionColor("client", client.id, color)}
                          customColors={customColors}
                          onAddCustomColor={(c) => selectOptionsStore.addCustomColor("client", c)}
                          onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("client", c)}
                          colorUsageMap={{}}
                        />
                      </PopoverContent>
                    </Popover>
                    <button
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      onClick={(e) => { e.stopPropagation(); selectOptionsStore.deleteOption("client", client.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="ml-6 mt-1 mb-2 space-y-1">
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
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit"
                              style={{
                                backgroundColor: tt.color,
                                color: labelStyles.taskType.textColor,
                                borderColor: tt.color,
                              }}
                            >
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="space-y-2 px-2">
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
            <Button size="sm" className="h-7 text-xs" disabled={!newLabel.trim()} onClick={handleAddClient}>
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

      {/* Label text color picker */}
      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">標籤字體顏色</p>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: clientOptions[0]?.color || PRESET_COLORS[0], color: labelStyles.client.textColor, borderColor: clientOptions[0]?.color || PRESET_COLORS[0] }}
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
          />
        </div>
      </div>
    </div>
  );
}

// ─── Task Type Settings Section (drag reorder + add/delete/color) ───

function TaskTypeOrderSection() {
  const { options: taskTypeOptions, customColors } = useSelectOptions("clientTaskType");
  const labelStyles = useLabelStyles();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);

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

  const handleAddTaskType = () => {
    const label = newLabel.trim();
    if (!label || taskTypeOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("clientTaskType", label, newColor);
    // Also add to the fee-side taskType field
    selectOptionsStore.addOption("taskType", label, newColor);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  const handleDeleteTaskType = (optId: string) => {
    const opt = taskTypeOptions.find((o) => o.id === optId);
    selectOptionsStore.deleteOption("clientTaskType", optId);
    // Also remove from the fee-side taskType field
    if (opt) {
      const feeOpts = selectOptionsStore.getField("taskType").options;
      const feeOpt = feeOpts.find((o) => o.label === opt.label);
      if (feeOpt) selectOptionsStore.deleteOption("taskType", feeOpt.id);
    }
  };

  const handleColorChange = (optId: string, color: string) => {
    const opt = taskTypeOptions.find((o) => o.id === optId);
    selectOptionsStore.updateOptionColor("clientTaskType", optId, color);
    // Sync to fee-side taskType field
    if (opt) {
      const feeOpts = selectOptionsStore.getField("taskType").options;
      const feeOpt = feeOpts.find((o) => o.label === opt.label);
      if (feeOpt) selectOptionsStore.updateOptionColor("taskType", feeOpt.id, color);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">任務類型設定</h2>
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
              "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-grab active:cursor-grabbing group",
              dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
              dragIndex === idx && "opacity-50",
              dragOverIndex !== idx && "hover:bg-secondary/30"
            )}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: tt.color,
                color: labelStyles.taskType.textColor,
                borderColor: tt.color,
              }}
            >
              {tt.label}
            </span>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover
                open={colorPickerOptionId === tt.id}
                onOpenChange={(v) => setColorPickerOptionId(v ? tt.id : null)}
              >
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
                    value={tt.color}
                    onChange={(color) => handleColorChange(tt.id, color)}
                    customColors={customColors}
                    onAddCustomColor={(c) => selectOptionsStore.addCustomColor("clientTaskType", c)}
                    onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("clientTaskType", c)}
                    colorUsageMap={{}}
                  />
                </PopoverContent>
              </Popover>
              <button
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => { e.stopPropagation(); handleDeleteTaskType(tt.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-2 px-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="輸入任務類型名稱"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTaskType();
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
            <Button size="sm" className="h-7 text-xs" disabled={!newLabel.trim()} onClick={handleAddTaskType}>
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
          新增任務類型
        </Button>
      )}
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
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id={`no-fee-${member.email}`}
                        checked={member.no_fee}
                        onCheckedChange={(checked) => handleToggleNoFee(member.email, !!checked)}
                      />
                      <Label htmlFor={`no-fee-${member.email}`} className="text-xs cursor-pointer text-muted-foreground">
                        不開單譯者
                      </Label>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4 max-h-[85vh] overflow-y-auto">
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
                  color: "#D1DAEA",
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

function TranslatorTierSection() {
  const { tiers, addTier, addTierToGroup, updateTierRow, removeTierRow } = useTranslatorTiers();
  const { options: taskTypeOptions } = useSelectOptions("clientTaskType");
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

  const billingUnits = ["字", "小時"];
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
              color: "#D1DAEA",
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
                        removeTierRow(tier.id);
                        setUncommittedIds((prev) => {
                          if (!prev.has(tier.id)) return prev;
                          const next = new Set(prev);
                          next.delete(tier.id);
                          return next;
                        });
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
                        onClick={() => removeTierRow(tier.id)}
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
  create_fee: "新增費用",
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
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  const activeConfig = localConfig || config;

  const toggleRole = (role: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });
  };

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

        <TabsContent value="fields" className="space-y-2 mt-4">
          {editableRoles.map((role) => {
            const isExpanded = expandedRoles.has(`fields-${role}`);
            return (
              <div key={role}>
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors text-left"
                  onClick={() => toggleRole(`fields-${role}`)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <h3 className="text-sm font-medium text-foreground">{roleLabelMap[role]}</h3>
                </button>
                {isExpanded && (
                  <div className="ml-6 mt-1 space-y-0">
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
                )}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="sections" className="space-y-2 mt-4">
          {editableRoles.map((role) => {
            const isExpanded = expandedRoles.has(`sections-${role}`);
            return (
              <div key={role}>
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors text-left"
                  onClick={() => toggleRole(`sections-${role}`)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <h3 className="text-sm font-medium text-foreground">{roleLabelMap[role]}</h3>
                </button>
                {isExpanded && (
                  <div className="ml-6 mt-1 space-y-0">
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
                )}
              </div>
            );
          })}
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
      {canViewSection("task_type_order") && <TaskTypeOrderSection />}
      {canViewSection("client_pricing") && <ClientPricingSection />}
      {canViewSection("translator_notes") && <TranslatorNotesSection />}
      {canViewSection("translator_tiers") && <TranslatorTierSection />}
      <StatusStyleSection />
    </div>
  );
}
