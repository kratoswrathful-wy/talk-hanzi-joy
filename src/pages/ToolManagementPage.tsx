import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Palette, ChevronDown, ChevronRight, Pencil, Save } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles, labelStyleStore } from "@/stores/label-style-store";
import { useToolTemplates, toolTemplateStore, type ToolTemplate } from "@/stores/tool-template-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function getColorUsageMap(options: { label: string; color: string }[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const o of options) {
    if (!map[o.color]) map[o.color] = [];
    map[o.color].push(o.label);
  }
  return map;
}

/* ── Tool Sub-Field Manager ── */
function ToolFieldManager({ optionId, fields }: { optionId: string; fields: { id: string; label: string }[] }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    selectOptionsStore.addToolField(optionId, label);
    setNewLabel("");
    setAdding(false);
  };

  const handleRename = (fieldId: string) => {
    const label = editLabel.trim();
    if (!label) return;
    selectOptionsStore.renameToolField(optionId, fieldId, label);
    setEditingId(null);
  };

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = fields.map((f) => f.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderToolFields(optionId, ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="ml-8 mt-1 mb-2 space-y-1">
      <p className="text-xs text-muted-foreground mb-1">自訂欄位（選擇此工具時會出現在案件詳情中）</p>
      {fields.map((f, idx) => (
        <div
          key={f.id}
          draggable
          onDragStart={() => setDragIndex(idx)}
          onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx); }}
          onDrop={() => handleDrop(idx)}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          className={cn(
            "flex items-center gap-2 px-2 py-1 rounded-md group cursor-grab active:cursor-grabbing",
            dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
            dragIndex === idx && "opacity-50",
            dragOverIndex !== idx && "hover:bg-secondary/20"
          )}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
          {editingId === f.id ? (
            <Input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={() => handleRename(f.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(f.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="h-6 text-xs flex-1"
              autoFocus
            />
          ) : (
            <span
              className="text-sm cursor-pointer hover:underline flex-1"
              onClick={() => { setEditingId(f.id); setEditLabel(f.label); }}
            >
              {f.label}
            </span>
          )}
          <button
            className="h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-destructive transition-all"
            onClick={() => selectOptionsStore.removeToolField(optionId, f.id)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-1.5 px-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="欄位名稱"
            className="h-6 text-xs flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Button size="sm" className="h-6 text-xs px-2" disabled={!newLabel.trim()} onClick={handleAdd}>
            新增
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setAdding(false)}>
            取消
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs h-6 px-2 text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3" />
          新增欄位
        </Button>
      )}
    </div>
  );
}

/* ── Template Card (collapsible) ── */
function TemplateCard({ tpl, toolOptions }: { tpl: ToolTemplate; toolOptions: { id: string; label: string; color: string; toolFields?: { id: string; label: string }[] }[] }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ToolTemplate>(tpl);

  const selectedTool = toolOptions.find((o) => o.label === draft.tool);
  const fields = selectedTool?.toolFields || [];

  const startEdit = () => {
    setDraft({ ...tpl });
    setEditing(true);
    setExpanded(true);
  };

  const handleSave = () => {
    toolTemplateStore.update(tpl.id, {
      name: draft.name,
      tool: draft.tool,
      fieldValues: draft.fieldValues,
    });
    setEditing(false);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/20">
        <button
          className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted transition-colors shrink-0"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        <span className="text-sm font-medium flex-1">{tpl.name}</span>
        {tpl.tool && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: toolOptions.find((o) => o.label === tpl.tool)?.color || "#383A3F", color: "#fff" }}>
            {tpl.tool}
          </span>
        )}
        <button
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
          onClick={() => toolTemplateStore.remove(tpl.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-3 space-y-2 border-t border-border">
          {editing ? (
            <>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">範本名稱</span>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-7 text-sm"
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">工具</span>
                <Select value={draft.tool} onValueChange={(v) => setDraft({ ...draft, tool: v, fieldValues: {} })}>
                  <SelectTrigger className="h-7 text-sm">
                    <SelectValue placeholder="選擇工具" />
                  </SelectTrigger>
                  <SelectContent>
                    {toolOptions.map((o) => (
                      <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fields.map((f) => (
                <div key={f.id} className="grid grid-cols-[80px_1fr] items-center gap-2">
                  <span className="text-xs text-muted-foreground">{f.label}</span>
                  <Input
                    value={draft.fieldValues[f.id] || ""}
                    onChange={(e) => setDraft({ ...draft, fieldValues: { ...draft.fieldValues, [f.id]: e.target.value } })}
                    className="h-7 text-sm"
                  />
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave}>
                  <Save className="h-3 w-3" />
                  儲存變更
                </Button>
              </div>
            </>
          ) : (
            <>
              {fields.length === 0 && !tpl.tool && (
                <p className="text-xs text-muted-foreground">尚未設定工具</p>
              )}
              {fields.map((f) => {
                const val = tpl.fieldValues[f.id];
                if (!val) return null;
                return (
                  <div key={f.id} className="grid grid-cols-[80px_1fr] items-center gap-2">
                    <span className="text-xs text-muted-foreground">{f.label}</span>
                    <span className="text-sm">{val}</span>
                  </div>
                );
              })}
              <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={startEdit}>
                  <Pencil className="h-3 w-3" />
                  編輯
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── New Template Form (inline) ── */
function NewTemplateForm({ toolOptions, onDone }: { toolOptions: { id: string; label: string; toolFields?: { id: string; label: string }[] }[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [tool, setTool] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const selectedTool = toolOptions.find((o) => o.label === tool);
  const fields = selectedTool?.toolFields || [];

  const handleSave = () => {
    if (!name.trim()) return;
    toolTemplateStore.add({ name: name.trim(), tool, fieldValues });
    onDone();
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-2">
      <div className="grid grid-cols-[80px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">範本名稱</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 text-sm"
          placeholder="輸入範本名稱"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-[80px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">工具</span>
        <Select value={tool} onValueChange={(v) => { setTool(v); setFieldValues({}); }}>
          <SelectTrigger className="h-7 text-sm">
            <SelectValue placeholder="選擇工具" />
          </SelectTrigger>
          <SelectContent>
            {toolOptions.map((o) => (
              <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {fields.map((f) => (
        <div key={f.id} className="grid grid-cols-[80px_1fr] items-center gap-2">
          <span className="text-xs text-muted-foreground">{f.label}</span>
          <Input
            value={fieldValues[f.id] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [f.id]: e.target.value })}
            className="h-7 text-sm"
          />
        </div>
      ))}
      <div className="flex gap-1.5 justify-end pt-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDone}>
          取消
        </Button>
        <Button size="sm" className="h-7 text-xs gap-1" disabled={!name.trim()} onClick={handleSave}>
          <Save className="h-3 w-3" />
          儲存變更
        </Button>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function ToolManagementPage() {
  const { options: toolOptions, customColors } = useSelectOptions("executionTool");
  const labelStyles = useLabelStyles();
  const templates = useToolTemplates();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [colorPickerOptionId, setColorPickerOptionId] = useState<string | null>(null);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [addingTemplate, setAddingTemplate] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = toolOptions.map((o) => o.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderOptions("executionTool", ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || toolOptions.some((o) => o.label === label)) return;
    selectOptionsStore.addOption("executionTool", label, newColor);
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setAdding(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">工具管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理執行工具選項與範本，變更會套用到所有案件
        </p>
      </div>

      {/* ── 工具區塊 ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">工具</h2>
        <div className="space-y-1">
          {toolOptions.map((opt, idx) => (
            <div key={opt.id}>
              <div
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
                  style={{ backgroundColor: opt.color, color: labelStyles.executionTool.textColor, borderColor: opt.color }}
                >
                  {opt.label}
                </span>
                <button
                  className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => toggleExpand(opt.id)}
                >
                  {expandedTools.has(opt.id) ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
                <span className="text-xs text-muted-foreground">
                  {(opt.toolFields || []).length > 0 && `${(opt.toolFields || []).length} 個欄位`}
                </span>
                <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Popover
                    open={colorPickerOptionId === opt.id}
                    onOpenChange={(v) => setColorPickerOptionId(v ? opt.id : null)}
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
                        value={opt.color}
                        onChange={(color) => selectOptionsStore.updateOptionColor("executionTool", opt.id, color)}
                        customColors={customColors}
                        onAddCustomColor={(c) => selectOptionsStore.addCustomColor("executionTool", c)}
                        onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("executionTool", c)}
                        colorUsageMap={getColorUsageMap(toolOptions)}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                    onClick={(e) => { e.stopPropagation(); selectOptionsStore.deleteOption("executionTool", opt.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {expandedTools.has(opt.id) && (
                <ToolFieldManager optionId={opt.id} fields={opt.toolFields || []} />
              )}
            </div>
          ))}
        </div>

        {adding ? (
          <div className="space-y-2 px-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="輸入工具名稱"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <ColorPicker
              value={newColor}
              onChange={(color) => setNewColor(color)}
              customColors={customColors}
              onAddCustomColor={(c) => selectOptionsStore.addCustomColor("executionTool", c)}
              onRemoveCustomColor={(c) => selectOptionsStore.removeCustomColor("executionTool", c)}
              colorUsageMap={getColorUsageMap(toolOptions)}
            />
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
            新增工具
          </Button>
        )}

        {/* Label text color picker */}
        <div className="border-t border-border pt-4">
          <button
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            onClick={() => setTextColorOpen((v) => !v)}
          >
            {textColorOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            標籤字體顏色
          </button>
          {textColorOpen && (
            <div className="mt-2 flex items-center gap-3">
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: toolOptions[0]?.color || PRESET_COLORS[0], color: labelStyles.executionTool.textColor, borderColor: toolOptions[0]?.color || PRESET_COLORS[0] }}
              >
                預覽
              </span>
              <ColorPicker
                value={labelStyles.executionTool.textColor}
                onChange={(c) => labelStyleStore.setExecutionToolTextColor(c)}
                customColors={[]}
                onAddCustomColor={() => {}}
                onRemoveCustomColor={() => {}}
                colorUsageMap={{}}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── 範本區塊 ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">範本</h2>
          {!addingTemplate && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setAddingTemplate(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              新增範本
            </Button>
          )}
        </div>

        {addingTemplate && (
          <NewTemplateForm
            toolOptions={toolOptions}
            onDone={() => setAddingTemplate(false)}
          />
        )}

        {templates.length === 0 && !addingTemplate && (
          <p className="text-sm text-muted-foreground">尚未建立任何範本</p>
        )}

        <div className="space-y-2">
          {templates.map((tpl) => (
            <TemplateCard key={tpl.id} tpl={tpl} toolOptions={toolOptions} />
          ))}
        </div>
      </div>
    </div>
  );
}
