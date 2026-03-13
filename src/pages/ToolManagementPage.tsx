import { useState, useRef, useCallback } from "react";
import { useClickOutsideCancel } from "@/hooks/use-click-outside";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Palette, ChevronDown, ChevronRight, Pencil, Save, Link as LinkIcon, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ColorPicker from "@/components/ColorPicker";
import { useSelectOptions, selectOptionsStore, PRESET_COLORS } from "@/stores/select-options-store";
import { useLabelStyles, labelStyleStore } from "@/stores/label-style-store";
import { useToolTemplates, toolTemplateStore, type ToolTemplate, type TemplateField } from "@/stores/tool-template-store";
import { usePageTemplates, pageTemplateStore, PAGE_MODULES, PAGE_MODULE_LABELS, type PageModule } from "@/stores/page-template-store";
import { useCommonLinks, commonLinksStore } from "@/stores/common-links-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultilineInput } from "@/components/ui/multiline-input";
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
function ToolFieldManager({ optionId, fields, fieldKey = "executionTool" }: { optionId: string; fields: { id: string; label: string; type?: "text" | "file" }[]; fieldKey?: string }) {
  const { confirmDelete } = useDeleteConfirm();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "file" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || !newFieldType) return;
    selectOptionsStore.addToolField(optionId, label, newFieldType, fieldKey);
    setNewLabel("");
    setAdding(false);
    setNewFieldType(null);
  };

  const handleRename = (fieldId: string) => {
    const label = editLabel.trim();
    if (!label) return;
    selectOptionsStore.renameToolField(optionId, fieldId, label, fieldKey);
    setEditingId(null);
  };

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = fields.map((f) => f.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    selectOptionsStore.reorderToolFields(optionId, ids, fieldKey);
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
            <MultilineInput
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={() => handleRename(f.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleRename(f.id);
                }
                if (e.key === "Escape") setEditingId(null);
              }}
              className="h-6 text-xs flex-1"
              minRows={1}
              maxRows={3}
              autoFocus
            />
          ) : (
            <div
              className="flex items-center gap-1.5 flex-1 cursor-pointer"
              onClick={() => { setEditingId(f.id); setEditLabel(f.label); }}
            >
              <span className="text-sm hover:underline">{f.label}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {(f.type || "text") === "file" ? "檔案" : "文字"}
              </Badge>
            </div>
          )}
          <button
            className="h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-destructive transition-all"
            onClick={() => confirmDelete(() => selectOptionsStore.removeToolField(optionId, f.id, fieldKey), f.label)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      {adding ? (
        newFieldType ? (
          <div className="flex items-center gap-1.5 px-2">
            <MultilineInput
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="欄位名稱"
              className="h-6 text-xs flex-1"
              minRows={1}
              maxRows={3}
              autoFocus
              onBlur={() => {
                if (newLabel.trim() && addButtonRef.current) {
                  setTimeout(() => addButtonRef.current?.focus(), 100);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                }
                if (e.key === "Escape") { setAdding(false); setNewFieldType(null); }
              }}
            />
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
              {newFieldType === "file" ? "檔案" : "文字"}
            </Badge>
            <Button 
              ref={addButtonRef}
              size="sm" 
              className="h-6 text-xs px-2" 
              disabled={!newLabel.trim()} 
              onClick={handleAdd}
              onKeyDown={(e) => {
                if (e.key === " ") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            >
              新增
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setAdding(false); setNewFieldType(null); setNewLabel(""); }}>
              取消
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2">
            <span className="text-xs text-muted-foreground">選擇欄位類型：</span>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setNewFieldType("text")}>
              文字
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setNewFieldType("file")}>
              檔案
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        )
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

/* ── Template Field Manager (for templates) ── */
function TemplateFieldManager({
  fields,
  fieldValues,
  onFieldsChange,
  onFieldValuesChange,
}: {
  fields: TemplateField[];
  fieldValues: Record<string, string>;
  onFieldsChange: (fields: TemplateField[]) => void;
  onFieldValuesChange: (values: Record<string, string>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "file" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || !newFieldType) return;
    const id = `tf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    onFieldsChange([...fields, { id, label, type: newFieldType }]);
    setNewLabel("");
    setAdding(false);
    setNewFieldType(null);
  };

  const handleRename = (fieldId: string) => {
    const label = editLabel.trim();
    if (!label) return;
    onFieldsChange(fields.map((f) => (f.id === fieldId ? { ...f, label } : f)));
    setEditingId(null);
  };

  const handleRemove = (fieldId: string) => {
    onFieldsChange(fields.filter((f) => f.id !== fieldId));
    const next = { ...fieldValues };
    delete next[fieldId];
    onFieldValuesChange(next);
  };

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const next = [...fields];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    onFieldsChange(next);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">範本欄位</p>
      {fields.map((f, idx) => (
        <div
          key={f.id}
          draggable
          onDragStart={() => setDragIndex(idx)}
          onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx); }}
          onDrop={() => handleDrop(idx)}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          className={cn(
            "flex items-center gap-2 rounded-md group cursor-grab active:cursor-grabbing",
            dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
            dragIndex === idx && "opacity-50",
            dragOverIndex !== idx && "hover:bg-secondary/20"
          )}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
           <div className="grid grid-cols-[80px_1fr] items-center gap-2 flex-1">
             {editingId === f.id ? (
               <MultilineInput
                 value={editLabel}
                 onChange={(e) => setEditLabel(e.target.value)}
                 onBlur={() => handleRename(f.id)}
                 onKeyDown={(e) => {
                   if (e.key === "Enter" && !e.shiftKey) {
                     e.preventDefault();
                     handleRename(f.id);
                   }
                   if (e.key === "Escape") setEditingId(null);
                 }}
                 className="h-6 text-xs"
                 minRows={1}
                 maxRows={3}
                 autoFocus
               />
             ) : (
               <div className="flex items-center gap-1.5">
                 <span
                   className="text-xs text-muted-foreground cursor-pointer hover:underline"
                   onClick={() => { setEditingId(f.id); setEditLabel(f.label); }}
                 >
                   {f.label}
                 </span>
                 <Badge variant="secondary" className="text-[9px] h-3.5 px-1 shrink-0">
                   {(f.type || "text") === "file" ? "檔案" : "文字"}
                 </Badge>
               </div>
              )}
              {(f.type || "text") === "file" ? (
                <div className="h-7 flex items-center px-3 rounded-md border border-input bg-muted/30 text-xs text-muted-foreground">
                  檔案欄位（套用範本時可上傳）
                </div>
              ) : (
                <MultilineInput
                  value={fieldValues[f.id] || ""}
                  onChange={(e) => onFieldValuesChange({ ...fieldValues, [f.id]: e.target.value })}
                  className="h-7 text-sm"
                  minRows={1}
                  maxRows={5}
                />
              )}
           </div>
          <button
            type="button"
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-all shrink-0"
            onClick={(e) => { e.stopPropagation(); handleRemove(f.id); }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      {adding ? (
        newFieldType ? (
          <div className="flex items-center gap-1.5">
            <MultilineInput
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="欄位名稱"
              className="h-6 text-xs flex-1"
              minRows={1}
              maxRows={3}
              autoFocus
              onBlur={() => {
                if (newLabel.trim() && addButtonRef.current) {
                  setTimeout(() => addButtonRef.current?.focus(), 100);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                }
                if (e.key === "Escape") { setAdding(false); setNewFieldType(null); setNewLabel(""); }
              }}
            />
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
              {newFieldType === "file" ? "檔案" : "文字"}
            </Badge>
            <Button 
              ref={addButtonRef}
              size="sm" 
              className="h-6 text-xs px-2" 
              disabled={!newLabel.trim()} 
              onClick={handleAdd}
              onKeyDown={(e) => {
                if (e.key === " ") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            >
              新增
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setAdding(false); setNewFieldType(null); setNewLabel(""); }}>
              取消
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">選擇欄位類型：</span>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setNewFieldType("text")}>
              文字
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setNewFieldType("file")}>
              檔案
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        )
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
function TemplateCard({ tpl, toolOptions }: { tpl: ToolTemplate; toolOptions: { id: string; label: string; color: string; toolFields?: { id: string; label: string; type?: "text" | "file" }[] }[] }) {
  const { confirmDelete } = useDeleteConfirm();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ToolTemplate>(tpl);
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const saveAndClose = useCallback(() => {
    toolTemplateStore.update(tpl.id, {
      name: draft.name,
      tool: draft.tool,
      fields: draft.fields,
      fieldValues: draft.fieldValues,
    });
    setEditing(false);
  }, [tpl.id, draft]);
  const cancelEdit = useCallback(() => { setEditing(false); setDraft(tpl); }, [tpl]);
  const editRef = useClickOutsideCancel(editing, saveAndClose);

  const startEdit = () => {
    setDraft({ ...tpl, fields: [...(tpl.fields || [])], fieldValues: { ...tpl.fieldValues } });
    setEditing(true);
    setExpanded(true);
    // Focus first field after render
    setTimeout(() => {
      firstFieldRef.current?.focus();
    }, 50);
  };


  const handleToolChange = (newTool: string) => {
    const selectedTool = toolOptions.find((o) => o.label === newTool);
    const defaultFields = (selectedTool?.toolFields || []).map((f) => ({ id: f.id, label: f.label, type: (f.type || "text") as "text" | "file" }));
    setDraft({ ...draft, tool: newTool, fields: defaultFields, fieldValues: {} });
  };

  const displayFields = tpl.fields || [];

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
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onClick={startEdit}
          title="編輯範本"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
          onClick={() => confirmDelete(() => toolTemplateStore.remove(tpl.id), tpl.name)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-3 space-y-2 border-t border-border">
          {editing ? (
            <div ref={editRef}>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">範本名稱</span>
                <Input
                  ref={firstFieldRef as React.Ref<HTMLInputElement>}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-7 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") saveAndClose(); if (e.key === "Escape") cancelEdit(); }}
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">工具</span>
                <Select value={draft.tool} onValueChange={handleToolChange}>
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
              <TemplateFieldManager
                fields={draft.fields || []}
                fieldValues={draft.fieldValues}
                onFieldsChange={(f) => setDraft((prev) => ({ ...prev, fields: f }))}
                onFieldValuesChange={(v) => setDraft((prev) => ({ ...prev, fieldValues: v }))}
              />
            </div>
          ) : (
            <>
              {displayFields.length === 0 && !tpl.tool && (
                <p className="text-xs text-muted-foreground">尚未設定工具</p>
              )}
              {displayFields.map((f) => {
                const isFile = (f.type || "text") === "file";
                const val = tpl.fieldValues[f.id];
                if (!val && !isFile) return null;
                return (
                  <div key={f.id} className="grid grid-cols-[80px_1fr] items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">{f.label}</span>
                      {isFile && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 shrink-0">檔案</Badge>}
                    </div>
                    <span className="text-sm">{isFile ? "（檔案欄位）" : val}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── New Template Form (inline) ── */
function NewTemplateForm({ toolOptions, onDone }: { toolOptions: { id: string; label: string; toolFields?: { id: string; label: string; type?: "text" | "file" }[] }[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [tool, setTool] = useState("");
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const cancelForm = useCallback(() => { onDone(); }, [onDone]);
  const formRef = useClickOutsideCancel(true, cancelForm);

  const handleToolChange = (newTool: string) => {
    // Preserve the original field type from the tool definition
    const selectedTool = toolOptions.find((o) => o.label === newTool);
    const defaultFields = (selectedTool?.toolFields || []).map((f) => ({ id: f.id, label: f.label, type: (f.type || "text") as "text" | "file" }));
    setTool(newTool);
    setFields(defaultFields);
    setFieldValues({});
  };

  const handleSave = () => {
    if (!name.trim()) return;
    toolTemplateStore.add({ name: name.trim(), tool, fields, fieldValues });
    onDone();
  };

  return (
    <div ref={formRef} className="border border-border rounded-lg p-4 space-y-2">
      <div className="grid grid-cols-[80px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">範本名稱</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 text-sm"
          placeholder="輸入範本名稱"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) handleSave(); if (e.key === "Escape") onDone(); }}
        />
      </div>
      <div className="grid grid-cols-[80px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">工具</span>
        <Select value={tool} onValueChange={handleToolChange}>
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
      {tool && (
        <TemplateFieldManager
          fields={fields}
          fieldValues={fieldValues}
          onFieldsChange={setFields}
          onFieldValuesChange={setFieldValues}
        />
      )}
    </div>
  );
}

/* ── Common Links Manager ── */
function CommonLinksSection() {
  const { confirmDelete } = useDeleteConfirm();
  const links = useCommonLinks();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const cancelEditing = useCallback(() => { setEditingId(null); }, []);
  const editingLinkRef = useClickOutsideCancel(!!editingId, cancelEditing);
  const cancelAddingLink = useCallback(() => { setAdding(false); setNewName(""); setNewUrl(""); }, []);
  const addingLinkRef = useClickOutsideCancel(adding, cancelAddingLink);

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    commonLinksStore.add(newName.trim(), newUrl.trim());
    setNewName("");
    setNewUrl("");
    setAdding(false);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim() || !editUrl.trim()) return;
    commonLinksStore.update(editingId, { name: editName.trim(), url: editUrl.trim() });
    setEditingId(null);
  };

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const ids = links.map((l) => l.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(idx, 0, moved);
    commonLinksStore.reorder(ids);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <LinkIcon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">常用連結</h2>
      </div>
      <div className="space-y-1">
        {links.map((link, idx) => (
          <div
            key={link.id}
            draggable
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx); }}
            onDrop={() => handleDrop(idx)}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-grab active:cursor-grabbing group",
              dragOverIndex === idx && "bg-primary/10 border border-dashed border-primary/30",
              dragIndex === idx && "opacity-50",
              dragOverIndex !== idx && "hover:bg-secondary/30"
            )}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {editingId === link.id ? (
              <div ref={editingLinkRef} className="flex items-center gap-1.5 flex-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm flex-1"
                  placeholder="顯示名稱"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingId(null); }}
                />
                <Input
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="h-7 text-sm flex-1"
                  placeholder="https://..."
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingId(null); }}
                />
              </div>
            ) : (
              <>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                  {link.name}
                </a>
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{link.url}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                    onClick={() => { setEditingId(link.id); setEditName(link.name); setEditUrl(link.url); }}
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => commonLinksStore.remove(link.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {adding ? (
        <div ref={addingLinkRef} className="space-y-2 px-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="顯示名稱"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}
          />
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setAdding(false);
            }}
          />
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          新增連結
        </Button>
      )}
    </div>
  );
}


/* ── Page Template Section ── */
function PageTemplateSection() {
  const navigate = useNavigate();
  const allTemplates = usePageTemplates();
  const [addingModule, setAddingModule] = useState<PageModule | null>(null);
  const [newName, setNewName] = useState("");

  const handleAdd = (mod: PageModule) => {
    const name = newName.trim();
    if (!name) return;
    pageTemplateStore.add(mod, name);
    setNewName("");
    setAddingModule(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <h2 className="text-base font-semibold">頁面範本管理</h2>
      <p className="text-xs text-muted-foreground -mt-2">
        管理各模組新增頁面時的預設與自訂範本
      </p>

      {/* Compact grid: module columns */}
      <div className="grid grid-cols-5 gap-3">
        {PAGE_MODULES.map((mod) => {
          const modTemplates = allTemplates.filter((t) => t.module === mod);
          return (
            <div key={mod} className="space-y-1.5">
              {/* Module header */}
              <div className="text-xs font-medium text-center text-muted-foreground pb-1 border-b border-border">
                {PAGE_MODULE_LABELS[mod]}
              </div>
              {/* Template chips */}
              {modTemplates.map((tpl) => (
                <div key={tpl.id} className="flex items-center gap-0.5 group">
                  <button
                    className="flex-1 flex items-center gap-1 px-2 py-1 rounded-md text-xs hover:bg-secondary/30 transition-colors text-left min-w-0"
                    title={`編輯「${tpl.name}」範本`}
                    onClick={() => navigate(`/tools/page-template/${tpl.id}`)}
                  >
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{tpl.name}</span>
                  </button>
                  {!tpl.isDefault && (
                    <button
                      className="h-4 w-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                      onClick={() => pageTemplateStore.remove(tpl.id)}
                      title="刪除範本"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
              {/* Add button */}
              {addingModule === mod ? (
                <div className="space-y-1">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="範本名稱"
                    className="h-6 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd(mod);
                      if (e.key === "Escape") { setAddingModule(null); setNewName(""); }
                    }}
                  />
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => { setAddingModule(null); setNewName(""); }}>
                      取消
                    </Button>
                    <Button size="sm" className="h-5 text-[10px] px-1.5" disabled={!newName.trim()} onClick={() => handleAdd(mod)}>
                      新增
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
                  onClick={() => { setAddingModule(mod); setNewName(""); }}
                >
                  <Plus className="h-2.5 w-2.5" />
                  新增
                </button>
              )}
            </div>
          );
        })}
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
          管理工具軟體選項與範本，變更會套用到所有案件
        </p>
      </div>

      {/* ── 工具區塊 ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">工具軟體</h2>
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

      {/* ── 工具資訊範本 ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">工具資訊範本</h2>
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

      {/* ── 頁面範本管理 ── */}
      <PageTemplateSection />

      {/* ── 常用連結區塊 ── */}
      <CommonLinksSection />
    </div>
  );
}
