import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { caseStore } from "@/hooks/use-case-store";
import type { CaseRecord, ToolEntry, ToolEntryField, CaseStatus } from "@/data/case-types";
import ColorSelect from "@/components/ColorSelect";
import MultiColorSelect from "@/components/MultiColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
import FileField from "@/components/FileField";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";
import { useToolTemplates, type ToolTemplate } from "@/stores/tool-template-store";

const caseStatusLabels: Record<CaseStatus, string> = {
  draft: "草稿",
  inquiry: "詢案中",
  finalized: "開立完成",
};

function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const labelStyles = useLabelStyles();
  const style = status === "finalized" ? labelStyles.statusFinalized
    : status === "inquiry" ? { bgColor: "#2563EB", textColor: "#FFFFFF" }
    : labelStyles.statusDraft;
  return (
    <Badge
      variant="default"
      className="text-xs whitespace-nowrap border"
      style={{ backgroundColor: style.bgColor, color: style.textColor, borderColor: style.bgColor }}
    >
      {caseStatusLabels[status]}
    </Badge>
  );
}


function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-[120px_1fr] items-start gap-3 py-1 ${className || ""}`}>
      <span className="text-sm text-muted-foreground pt-1">{label}</span>
      <div>{children}</div>
    </div>
  );
}


/* ── Single Tool Instance ── */
function ToolInstance({
  entry,
  index,
  onUpdate,
  onRemove,
  showRemove,
}: {
  entry: ToolEntry;
  index: number;
  onUpdate: (updates: Partial<ToolEntry>) => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const { options: toolOptions } = useSelectOptions("executionTool");
  const allTemplates = useToolTemplates();
  const [tplOpen, setTplOpen] = useState(false);
  const [pendingTpl, setPendingTpl] = useState<ToolTemplate | null>(null);
  const [warningDetails, setWarningDetails] = useState<{
    fieldChanges: { added: string[]; removed: string[] };
    conflicts: { id: string; label: string; current: string; incoming: string }[];
  } | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const selectedTool = toolOptions.find((o) => o.label === entry.tool);
  // Use entry's custom fields if present, otherwise fall back to tool defaults
  const fields: ToolEntryField[] = entry.fields || selectedTool?.toolFields || [];
  const values = entry.fieldValues || {};
  const hasToolSelected = !!entry.tool;

  const matchingTemplates = allTemplates.filter((t) => t.tool === entry.tool);

  const tryApplyTemplate = (tpl: ToolTemplate) => {
    const tplFields = tpl.fields || [];
    const currentFieldIds = fields.map((f) => f.id);
    const tplFieldIds = tplFields.map((f) => f.id);

    // Detect field arrangement changes
    const addedFields = tplFields.filter((f) => !currentFieldIds.includes(f.id)).map((f) => f.label);
    const removedFields = fields.filter((f) => !tplFieldIds.includes(f.id)).map((f) => f.label);
    // Also check for renamed fields (same position different label)
    const renamedFields: string[] = [];
    for (const tf of tplFields) {
      const current = fields.find((f) => f.id === tf.id);
      if (current && current.label !== tf.label) {
        renamedFields.push(`${current.label} → ${tf.label}`);
      }
    }
    const hasFieldChanges = addedFields.length > 0 || removedFields.length > 0 || renamedFields.length > 0
      || tplFieldIds.join(",") !== currentFieldIds.join(","); // order change

    // Detect content conflicts
    const conflicts: { id: string; label: string; current: string; incoming: string }[] = [];
    for (const [key, val] of Object.entries(tpl.fieldValues)) {
      if (!val) continue;
      const current = values[key];
      if (current && current !== val) {
        const fieldDef = tplFields.find((f) => f.id === key) || fields.find((f) => f.id === key);
        conflicts.push({ id: key, label: fieldDef?.label || key, current, incoming: val });
      }
    }

    if (hasFieldChanges || conflicts.length > 0) {
      setPendingTpl(tpl);
      setWarningDetails({
        fieldChanges: { added: addedFields, removed: removedFields },
        conflicts,
      });
      setTplOpen(false);
    } else {
      applyTemplate(tpl);
    }
  };

  const applyTemplate = (tpl: ToolTemplate) => {
    // Replace fields entirely with template's fields
    const tplFields = tpl.fields || [];
    const newValues: Record<string, string> = {};
    // Only keep values for fields that exist in the template
    for (const f of tplFields) {
      const tplVal = tpl.fieldValues[f.id];
      const currentVal = values[f.id];
      // Use template value if non-empty, otherwise keep current if field exists
      newValues[f.id] = tplVal || currentVal || "";
    }
    onUpdate({ tool: tpl.tool, fields: tplFields, fieldValues: newValues });
    setTplOpen(false);
    setPendingTpl(null);
    setWarningDetails(null);
  };

  const dismissWarning = () => {
    setPendingTpl(null);
    setWarningDetails(null);
  };

  const handleFieldsChange = (newFields: ToolEntryField[]) => {
    // Clean up fieldValues for removed fields
    const newFieldIds = new Set(newFields.map((f) => f.id));
    const newValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (newFieldIds.has(k)) newValues[k] = v;
    }
    onUpdate({ fields: newFields, fieldValues: newValues });
  };

  // When tool changes, reset to tool's default fields
  const handleToolChange = (newTool: string) => {
    const newToolOpt = toolOptions.find((o) => o.label === newTool);
    const defaultFields = (newToolOpt?.toolFields || []).map((f) => ({ id: f.id, label: f.label }));
    onUpdate({ tool: newTool, fields: defaultFields, fieldValues: {} });
  };

  return (
    <>
      <div className="relative border border-border rounded-lg p-3 space-y-1">
        {showRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Field label="執行工具">
              <ColorSelect
                fieldKey="executionTool"
                value={entry.tool}
                onValueChange={handleToolChange}
                className="max-w-xs"
              />
            </Field>
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block mt-1">
                  <Popover open={tplOpen} onOpenChange={(v) => hasToolSelected && setTplOpen(v)}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        disabled={!hasToolSelected}
                      >
                        範本
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      {matchingTemplates.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-1">無可用範本</p>
                      ) : (
                        <div className="space-y-1">
                          {matchingTemplates.map((tpl) => (
                            <button
                              key={tpl.id}
                              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-secondary/30 transition-colors"
                              onClick={() => tryApplyTemplate(tpl)}
                            >
                              <span
                                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: "#383A3F", color: "#fff" }}
                              >
                                {tpl.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </span>
              </TooltipTrigger>
              {!hasToolSelected && (
                <TooltipContent side="top">
                  <p>請先選取工具</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
        {fields.map((f) => (
          <Field key={f.id} label={f.label}>
            <div className="flex items-center gap-1.5">
              <Input
                value={values[f.id] || ""}
                onChange={(e) =>
                  onUpdate({ fieldValues: { ...values, [f.id]: e.target.value } })
                }
                className="max-w-xs"
              />
              <button
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-all shrink-0"
                onClick={() => setDeleteFieldId(f.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </Field>
        ))}
        {/* Add field */}
        {hasToolSelected && (
          addingField ? (
            <div className="flex items-center gap-1.5 py-1 ml-[132px]">
              <Input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="欄位名稱"
                className="h-7 text-sm w-40"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFieldLabel.trim()) {
                    const id = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const newFields = [...fields, { id, label: newFieldLabel.trim() }];
                    handleFieldsChange(newFields);
                    setNewFieldLabel("");
                    setAddingField(false);
                  }
                  if (e.key === "Escape") { setAddingField(false); setNewFieldLabel(""); }
                }}
              />
              <Button
                size="sm"
                className="h-7 text-xs px-2"
                disabled={!newFieldLabel.trim()}
                onClick={() => {
                  const id = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                  const newFields = [...fields, { id, label: newFieldLabel.trim() }];
                  handleFieldsChange(newFields);
                  setNewFieldLabel("");
                  setAddingField(false);
                }}
              >
                確定
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setAddingField(false); setNewFieldLabel(""); }}>
                取消
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-muted-foreground ml-[132px]"
              onClick={() => setAddingField(true)}
            >
              <Plus className="h-3 w-3" />
              新增欄位
            </Button>
          )
        )}
      </div>

      {/* Delete field confirmation */}
      <AlertDialog open={!!deleteFieldId} onOpenChange={(v) => { if (!v) setDeleteFieldId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除欄位</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除欄位「{fields.find((f) => f.id === deleteFieldId)?.label}」嗎？該欄位的內容也會一併移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteFieldId) {
                handleFieldsChange(fields.filter((f) => f.id !== deleteFieldId));
                // Also clean up fieldValues
                const newValues = { ...values };
                delete newValues[deleteFieldId];
                onUpdate({ fields: fields.filter((f) => f.id !== deleteFieldId), fieldValues: newValues });
              }
              setDeleteFieldId(null);
            }}>
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template apply warning dialog */}
      <AlertDialog open={!!pendingTpl} onOpenChange={(v) => { if (!v) dismissWarning(); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>套用範本確認</AlertDialogTitle>
            <AlertDialogDescription>
              套用範本「{pendingTpl?.name}」可能影響現有內容，請確認是否執行：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 max-h-60 overflow-y-auto">
            {warningDetails && (warningDetails.fieldChanges.added.length > 0 || warningDetails.fieldChanges.removed.length > 0) && (
              <div className="rounded-md border border-border p-2 space-y-1">
                <p className="text-xs font-medium text-foreground">欄位變動</p>
                {warningDetails.fieldChanges.added.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    新增欄位：<span className="text-foreground">{warningDetails.fieldChanges.added.join("、")}</span>
                  </p>
                )}
                {warningDetails.fieldChanges.removed.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    移除欄位：<span className="text-destructive">{warningDetails.fieldChanges.removed.join("、")}</span>
                  </p>
                )}
              </div>
            )}
            {warningDetails && warningDetails.conflicts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">內容衝突</p>
                {warningDetails.conflicts.map((cf) => (
                  <div key={cf.id} className="rounded-md border border-border p-2 space-y-1">
                    <p className="text-xs font-medium text-foreground">{cf.label}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">目前：</span>
                        <span className="ml-1">{cf.current}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">範本：</span>
                        <span className="ml-1">{cf.incoming}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dismissWarning}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingTpl && applyTemplate(pendingTpl)}>確認套用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [creatorName, setCreatorName] = useState("");

  useEffect(() => {
    caseStore.load().then(() => {
      const found = caseStore.getById(id!);
      setCaseData(found ?? null);
      setLoading(false);
    });
  }, [id]);

  // Resolve creator UUID to display name
  useEffect(() => {
    const uid = caseData?.createdBy;
    if (!uid || uid.length !== 36) return;
    supabase.from("profiles").select("display_name, email").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (data) setCreatorName(data.display_name || data.email);
      });
  }, [caseData?.createdBy]);

  const save = (partial: Partial<CaseRecord>) => {
    if (!caseData) return;
    setCaseData({ ...caseData, ...partial });
    caseStore.update(caseData.id, partial);
  };

  /* ── Tool helpers ── */
  const tools: ToolEntry[] = caseData?.tools?.length
    ? caseData.tools
    : [{ id: `te-${Date.now()}`, tool: caseData?.executionTool || "", fieldValues: caseData?.toolFieldValues || {} }];

  const saveTools = (newTools: ToolEntry[]) => {
    save({ tools: newTools });
  };

  const updateTool = (idx: number, updates: Partial<ToolEntry>) => {
    const next = tools.map((t, i) => (i === idx ? { ...t, ...updates } : t));
    saveTools(next);
  };

  const removeTool = (idx: number) => {
    const next = tools.filter((_, i) => i !== idx);
    saveTools(next.length ? next : [{ id: `te-${Date.now()}`, tool: "", fieldValues: {} }]);
  };

  const addTool = () => {
    saveTools([...tools, { id: `te-${Date.now()}`, tool: "", fieldValues: {} }]);
  };

  const handleDelete = async () => {
    if (!caseData) return;
    await caseStore.remove(caseData.id);
    toast({ title: "已刪除案件" });
    navigate("/cases");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">載入中…</div>;
  }
  if (!caseData) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">找不到此案件</div>;
  }

  const isDraft = caseData.status === "draft";

  const handleDuplicate = async () => {
    const dup = await caseStore.duplicate(caseData.id);
    if (dup) navigate(`/cases/${dup.id}`);
  };

  const handleNewCase = async () => {
    const newCase = await caseStore.create({ title: "" });
    if (newCase) navigate(`/cases/${newCase.id}`);
  };

  const handlePublish = () => {
    save({ status: "inquiry" as CaseStatus });
    toast({ title: "案件已公布" });
  };

  const handleRevertToDraft = () => {
    save({ status: "draft" as CaseStatus });
    toast({ title: "已收回為草稿" });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <Link
          to="/cases"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          返回案件清單
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs min-w-[88px]"
            disabled={!isDraft}
            onClick={handleDuplicate}
          >
            複製本頁
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs min-w-[88px]"
            onClick={handleNewCase}
          >
            新增案件頁面
          </Button>
          <Button
            size="sm"
            className="text-xs min-w-[88px] text-white hover:opacity-80"
            style={{ backgroundColor: '#6B7280' }}
            onClick={() => setDeleteOpen(true)}
          >
            刪除
          </Button>
          {isDraft && (
            <Button
              size="sm"
              className="text-xs min-w-[88px]"
              onClick={handlePublish}
            >
              公布
            </Button>
          )}
        </div>
      </div>

      <Field label="案件編號">
        <Input value={caseData.title} onChange={(e) => save({ title: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="狀態">
        <CaseStatusBadge status={caseData.status} />
      </Field>

      <Separator />

      <h2 className="text-base font-semibold">基本資訊</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label="類型">
          <ColorSelect fieldKey="caseCategory" value={caseData.category} onValueChange={(v) => save({ category: v })} />
        </Field>
        <Field label="工作類型">
          <MultiColorSelect fieldKey="taskType" values={caseData.workType} onValuesChange={(v) => save({ workType: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="計費單位">
          <ColorSelect fieldKey="billingUnit" value={caseData.billingUnit} onValueChange={(v) => save({ billingUnit: v })} />
        </Field>
        <Field label="計費單位數">
          <Input type="number" value={caseData.unitCount || ""} onChange={(e) => save({ unitCount: Number(e.target.value) || 0 })} className="max-w-[120px]" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Field label="譯者">
            <MultiColorSelect fieldKey="assignee" values={caseData.translator || []} onValuesChange={(v) => save({ translator: v })} />
          </Field>
          <Field label="翻譯交期">
            <DateTimePicker value={caseData.translationDeadline} onChange={(v) => save({ translationDeadline: v })} className="w-full" />
          </Field>
        </div>
        <div className="space-y-1">
          <Field label="審稿人員">
            <ColorSelect fieldKey="assignee" value={caseData.reviewer} onValueChange={(v) => save({ reviewer: v })} />
          </Field>
          <Field label="審稿交期">
            <DateTimePicker value={caseData.reviewDeadline} onChange={(v) => save({ reviewDeadline: v })} className="w-full" />
          </Field>
        </div>
      </div>

      <Separator />

      <h2 className="text-base font-semibold">工具</h2>
      <div className="space-y-3">
        {tools.map((entry, idx) => (
          <ToolInstance
            key={entry.id}
            entry={entry}
            index={idx}
            onUpdate={(u) => updateTool(idx, u)}
            onRemove={() => removeTool(idx)}
            showRemove={tools.length > 1}
          />
        ))}
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={addTool}>
          <Plus className="h-4 w-4" />
          新增工具
        </Button>
      </div>

      <Separator />

      <h2 className="text-base font-semibold">狀態與交件</h2>
      <Field label="任務狀態">
        <Input value={caseData.taskStatus} onChange={(e) => save({ taskStatus: e.target.value })} className="max-w-xs" />
      </Field>
      <Field label="交件方式">
        <Input value={caseData.deliveryMethod} onChange={(e) => save({ deliveryMethod: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="客戶收件">
        <Input value={caseData.clientReceipt} onChange={(e) => save({ clientReceipt: e.target.value })} className="max-w-xs" />
      </Field>

      <Separator />

      <h2 className="text-base font-semibold">準則與資源</h2>
      <Field label="自製準則頁面">
        <Input value={caseData.customGuidelinesUrl} onChange={(e) => save({ customGuidelinesUrl: e.target.value })} className="max-w-md" placeholder="URL" />
      </Field>
      <Field label="客戶指定準則">
        <Input value={caseData.clientGuidelines} onChange={(e) => save({ clientGuidelines: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="提問表單">
        <Input value={caseData.questionForm} onChange={(e) => save({ questionForm: e.target.value })} className="max-w-md" />
      </Field>

      <Separator />

      <h2 className="text-base font-semibold">核取項目</h2>
      <Field label="填寫內部註記表單">
        <Checkbox checked={caseData.internalNoteForm} onCheckedChange={(v) => save({ internalNoteForm: !!v })} />
      </Field>
      <Field label="填寫客戶提問表單">
        <Checkbox checked={caseData.clientQuestionForm} onCheckedChange={(v) => save({ clientQuestionForm: !!v })} />
      </Field>

      <Separator />

      <h2 className="text-base font-semibold">登入資訊</h2>
      <Field label="其他登入資訊">
        <Input value={caseData.otherLoginInfo} onChange={(e) => save({ otherLoginInfo: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="登入帳號">
        <Input value={caseData.loginAccount} onChange={(e) => save({ loginAccount: e.target.value })} className="max-w-xs" />
      </Field>
      <Field label="登入密碼">
        <Input value={caseData.loginPassword} onChange={(e) => save({ loginPassword: e.target.value })} className="max-w-xs" />
      </Field>
      <Field label="線上工具專案">
        <Input value={caseData.onlineToolProject} onChange={(e) => save({ onlineToolProject: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="線上工具檔名">
        <Input value={caseData.onlineToolFilename} onChange={(e) => save({ onlineToolFilename: e.target.value })} className="max-w-md" />
      </Field>

      <Separator />

      <h2 className="text-base font-semibold">追蹤與費用</h2>
      <Field label="追蹤修訂">
        <Input value={caseData.trackChanges} onChange={(e) => save({ trackChanges: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="稿費條">
        <Input value={caseData.feeEntry} onChange={(e) => save({ feeEntry: e.target.value })} className="max-w-md" />
      </Field>

      <Separator />

      {/* Meta info - same format as fee detail */}
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>建立者：{creatorName || "—"}</span>
        <span>建立時間：{new Date(caseData.createdAt).toLocaleString("zh-TW")}</span>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原，確定要刪除此案件嗎？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
