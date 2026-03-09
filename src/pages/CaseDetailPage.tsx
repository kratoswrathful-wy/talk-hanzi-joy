import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useCallback, lazy, Suspense, useRef } from "react";
import { ArrowLeft, Trash2, Plus, X, Copy, Check, ExternalLink, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultilineInput } from "@/components/ui/multiline-input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { caseStore } from "@/hooks/use-case-store";
import { feeStore, useFees } from "@/hooks/use-fee-store";
import { type TranslatorFee, type FeeTaskItem, type TaskType, type BillingUnit, defaultClientInfo } from "@/data/fee-mock-data";
import { selectOptionsStore, PRESET_COLORS, CONTACT_DEFAULT_COLOR, useSelectOptions, getStatusLabelStyle, CASE_STATUS_LABEL_MAP } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import type { CaseRecord, ToolEntry, ToolEntryField, CaseStatus, CaseComment, CollabRow } from "@/data/case-types";
import ColorSelect from "@/components/ColorSelect";
import MultiColorSelect from "@/components/MultiColorSelect";
import AssigneeTag from "@/components/AssigneeTag";
import DateTimePicker from "@/components/DateTimePicker";
import FileField from "@/components/FileField";
import { CommentInput } from "@/components/comments/CommentInput";
import { CommentContent } from "@/components/comments/CommentContent";

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

import { useLabelStyles } from "@/stores/label-style-store";
import { useToolTemplates, type ToolTemplate } from "@/stores/tool-template-store";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { internalNotesStore, useInternalNotes } from "@/stores/internal-notes-store";
import type { InternalNote } from "@/hooks/use-internal-notes-table-views";

import CollaborationTable from "@/components/CollaborationTable";

const RichTextEditor = lazy(() => import("@/components/RichTextEditor"));


const caseStatusLabels: Record<CaseStatus, string> = CASE_STATUS_LABEL_MAP as Record<CaseStatus, string>;

function CaseStatusBadge({ status }: { status: CaseStatus }) {
  useSelectOptions("statusLabel"); // subscribe to changes
  const label = caseStatusLabels[status];
  const style = getStatusLabelStyle(label);
  return (
    <Badge
      variant="default"
      className="text-xs whitespace-nowrap border"
      style={{ backgroundColor: style.bgColor, color: style.textColor, borderColor: style.bgColor }}
    >
      {label}
    </Badge>
  );
}


function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-[100px_1fr] items-start gap-3 py-1 ${className || ""}`}>
      <span className="text-sm text-muted-foreground pt-1">{label}</span>
      <div>{children}</div>
    </div>
  );
}

/* ── Copy button for text fields ── */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
      onClick={handleCopy}
      title="複製到剪貼簿"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ── Single Tool Instance ── */
function ToolInstance({
  entry,
  index,
  onUpdate,
  onRemove,
  showRemove,
  toolFieldKey = "executionTool",
  toolLabel,
  canEditTool = true,
  canRemoveTool = true,
  canAddField = true,
  canRemoveField = true,
  canUseTemplate = true,
}: {
  entry: ToolEntry;
  index: number;
  onUpdate: (updates: Partial<ToolEntry>) => void;
  onRemove: () => void;
  showRemove: boolean;
  toolFieldKey?: string;
  toolLabel?: string;
  canEditTool?: boolean;
  canRemoveTool?: boolean;
  canAddField?: boolean;
  canRemoveField?: boolean;
  canUseTemplate?: boolean;
}) {
  const { options: toolOptions } = useSelectOptions(toolFieldKey);
  const allTemplates = useToolTemplates();
  const [tplOpen, setTplOpen] = useState(false);
  const [pendingTpl, setPendingTpl] = useState<ToolTemplate | null>(null);
  const [warningDetails, setWarningDetails] = useState<{
    fieldChanges: { added: string[]; removed: string[] };
    conflicts: { id: string; label: string; current: string; incoming: string }[];
  } | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [addingFieldType, setAddingFieldType] = useState<"text" | "file" | null>(null);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const selectedTool = toolOptions.find((o) => o.label === entry.tool);
  const fields: ToolEntryField[] = entry.fields || selectedTool?.toolFields?.map(f => ({ ...f, type: (f.type || "text") as "text" | "file" })) || [];
  const values = entry.fieldValues || {};
  const fileValues = entry.fileValues || {};
  const hasToolSelected = !!entry.tool;

  const matchingTemplates = allTemplates.filter((t) => t.tool === entry.tool);

  const tryApplyTemplate = (tpl: ToolTemplate) => {
    const tplFields = tpl.fields || [];
    const currentFieldIds = fields.map((f) => f.id);
    const tplFieldIds = tplFields.map((f) => f.id);

    const addedFields = tplFields.filter((f) => !currentFieldIds.includes(f.id)).map((f) => f.label);
    const removedFields = fields.filter((f) => !tplFieldIds.includes(f.id)).map((f) => f.label);
    const renamedFields: string[] = [];
    for (const tf of tplFields) {
      const current = fields.find((f) => f.id === tf.id);
      if (current && current.label !== tf.label) {
        renamedFields.push(`${current.label} → ${tf.label}`);
      }
    }
    const hasFieldChanges = addedFields.length > 0 || removedFields.length > 0 || renamedFields.length > 0
      || tplFieldIds.join(",") !== currentFieldIds.join(",");

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
      setWarningDetails({ fieldChanges: { added: addedFields, removed: removedFields }, conflicts });
      setTplOpen(false);
    } else {
      applyTemplate(tpl);
    }
  };

  const applyTemplate = (tpl: ToolTemplate) => {
    const tplFields = tpl.fields || [];
    const newValues: Record<string, string> = {};
    for (const f of tplFields) {
      const tplVal = tpl.fieldValues[f.id];
      const currentVal = values[f.id];
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
    const newFieldIds = new Set(newFields.map((f) => f.id));
    const newValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (newFieldIds.has(k)) newValues[k] = v;
    }
    const newFileValues: Record<string, { name: string; url: string }[]> = {};
    for (const [k, v] of Object.entries(fileValues)) {
      if (newFieldIds.has(k)) newFileValues[k] = v;
    }
    onUpdate({ fields: newFields, fieldValues: newValues, fileValues: newFileValues });
  };

  const handleToolChange = (newTool: string) => {
    const newToolOpt = toolOptions.find((o) => o.label === newTool);
    const defaultFields = (newToolOpt?.toolFields || []).map((f) => ({ id: f.id, label: f.label, type: (f.type || "text") as "text" | "file" }));
    onUpdate({ tool: newTool, fields: defaultFields, fieldValues: {}, fileValues: {} });
  };

  const handleAddField = () => {
    if (!newFieldLabel.trim() || !addingFieldType) return;
    const id = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newFields = [...fields, { id, label: newFieldLabel.trim(), type: addingFieldType }];
    handleFieldsChange(newFields);
    setNewFieldLabel("");
    setAddingField(false);
    setAddingFieldType(null);
  };

  return (
    <>
      <div className="relative border border-border rounded-lg p-3 space-y-1">
        {showRemove && canRemoveTool && (
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
            <Field label={toolLabel || "執行工具"}>
              <ColorSelect
                fieldKey={toolFieldKey}
                value={entry.tool}
                onValueChange={handleToolChange}
                className="max-w-xs"
                disabled={!canEditTool}
              />
            </Field>
          </div>
          {canUseTemplate && (
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
          )}
        </div>
        {fields.map((f) => {
          const fieldType = f.type || "text";
          if (fieldType === "file") {
            return (
              <Field key={f.id} label={f.label}>
                <div className="flex items-start gap-1.5">
                  <div className="flex-1">
                    <FileField
                      value={fileValues[f.id] || []}
                      onChange={(v) => onUpdate({ fileValues: { ...fileValues, [f.id]: v } })}
                    />
                  </div>
                  {canRemoveField && (
                    <button
                      className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-all shrink-0 mt-1"
                      onClick={() => setDeleteFieldId(f.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Field>
            );
          }
          return (
            <Field key={f.id} label={f.label}>
              <div className="flex items-start gap-1.5">
                <MultilineInput
                  value={values[f.id] || ""}
                  onChange={(e) =>
                    onUpdate({ fieldValues: { ...values, [f.id]: e.target.value } })
                  }
                  className="flex-1 min-h-0 h-auto py-1"
                  minRows={1}
                  borderless
                />
                <CopyButton value={values[f.id] || ""} />
                {canRemoveField && (
                  <button
                    className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-all shrink-0 mt-1"
                    onClick={() => setDeleteFieldId(f.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </Field>
          );
        })}
        {/* Add field */}
        {hasToolSelected && canAddField && (
          addingField ? (
            addingFieldType ? (
              <div className="flex items-center gap-1.5 py-1 ml-[132px]">
            <MultilineInput
              value={newFieldLabel}
              onChange={(e) => setNewFieldLabel(e.target.value)}
              placeholder="欄位名稱"
              className="h-7 text-sm w-40"
              minRows={1}
              maxRows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && newFieldLabel.trim()) {
                  e.preventDefault();
                  handleAddField();
                }
                if (e.key === "Escape") { setAddingField(false); setAddingFieldType(null); setNewFieldLabel(""); }
              }}
            />
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {addingFieldType === "text" ? "文字" : "檔案"}
                </Badge>
                <Button
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={!newFieldLabel.trim()}
                  onClick={handleAddField}
                >
                  確定
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setAddingField(false); setAddingFieldType(null); setNewFieldLabel(""); }}>
                  取消
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-1 ml-[132px]">
                <span className="text-xs text-muted-foreground">選擇欄位類型：</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddingFieldType("text")}>
                  文字
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddingFieldType("file")}>
                  檔案
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setAddingField(false)}>
                  取消
                </Button>
              </div>
            )
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
                const newFields = fields.filter((f) => f.id !== deleteFieldId);
                const newValues = { ...values };
                delete newValues[deleteFieldId];
                const newFileValues = { ...fileValues };
                delete newFileValues[deleteFieldId];
                onUpdate({ fields: newFields, fieldValues: newValues, fileValues: newFileValues });
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

function formatTimestamp(d: Date) {
  return d.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publishPromptOpen, setPublishPromptOpen] = useState(false);
  const [collabCountDialogOpen, setCollabCountDialogOpen] = useState(false);
  const [collabCountInput, setCollabCountInput] = useState("");
  const [collabEditOpen, setCollabEditOpen] = useState(false);
  const [collabEditInput, setCollabEditInput] = useState("");
  const [collabCancelOpen, setCollabCancelOpen] = useState(false);
  const [collabCancelSelectedRows, setCollabCancelSelectedRows] = useState<Set<string>>(new Set());
  const [collabCancelMode, setCollabCancelMode] = useState<"cancel" | "reduce">("cancel");
  const [collabReduceTarget, setCollabReduceTarget] = useState(0);
  const [creatorName, setCreatorName] = useState("");
  const { primaryRole: currentRole, profile } = useAuth();
  const { checkPerm } = usePermissions();
  const isManager = currentRole === "pm" || currentRole === "executive";
  const pendingNavigateRef = useRef<(() => void) | null>(null);

  // Permission for publish prompt on leave
  const canSeePublishPrompt = checkPerm("case_management", "case_draft_publish_prompt", "view");

  // Tool permissions
  const canEditToolSelect = checkPerm("case_management", "case_detail_toolSelect", "edit");
  const canAddTool = checkPerm("case_management", "case_detail_toolAdd", "edit");
  const canRemoveTool = checkPerm("case_management", "case_detail_toolRemove", "edit");
  const canAddToolField = checkPerm("case_management", "case_detail_toolFieldAdd", "edit");
  const canRemoveToolField = checkPerm("case_management", "case_detail_toolFieldRemove", "edit");
  const canUseToolTemplate = checkPerm("case_management", "case_detail_toolTemplate", "edit");
  const { options: assigneeOptions } = useSelectOptions("assignee");
  const allInternalNotes = useInternalNotes(); // reactive
  const allFees = useFees(); // reactive - for linked fees

  // Comment drafts
  const [commentDraft, setCommentDraft] = useState("");
  const [internalCommentDraft, setInternalCommentDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [internalReplyingTo, setInternalReplyingTo] = useState<string | null>(null);

  const roleLabels: Record<string, string> = { member: "成員", pm: "專案經理", executive: "執行官" };

   // Block navigation when leaving a draft case (PM+ only) to prompt publishing
   const shouldBlockNav = canSeePublishPrompt && !!caseData && caseData.status === "draft";

   // Intercept back button / browser navigation via beforeunload
   useEffect(() => {
     if (!shouldBlockNav) return;
     const handler = (e: BeforeUnloadEvent) => {
       e.preventDefault();
       e.returnValue = "";
     };
     window.addEventListener("beforeunload", handler);
     return () => window.removeEventListener("beforeunload", handler);
   }, [shouldBlockNav]);

  useEffect(() => {
    let mounted = true;
    const doLoad = () => {
      caseStore.load().then(() => {
        if (!mounted) return;
        const found = caseStore.getById(id!);
        setCaseData(found ?? null);
        setLoading(false);
      });
    };
    doLoad();
    // Re-load when store resets (e.g. role switch triggers auth change → reset)
    const unsub = caseStore.subscribe(() => {
      if (!mounted) return;
      const found = caseStore.getById(id!);
      if (found) setCaseData(found);
    });
    return () => { mounted = false; unsub(); };
  }, [id]);

  useEffect(() => {
    const uid = caseData?.createdBy;
    if (!uid || uid.length !== 36) return;
    supabase.from("profiles").select("display_name, email").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (data) setCreatorName(data.display_name || data.email);
      });
  }, [caseData?.createdBy]);

  const save = useCallback((partial: Partial<CaseRecord>) => {
    setCaseData((prev) => {
      if (!prev) return prev;
      caseStore.update(prev.id, partial);
      return { ...prev, ...partial };
    });
  }, []);

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

  /* ── Question Tool helpers ── */
  const questionTools: ToolEntry[] = caseData?.questionTools?.length
    ? caseData.questionTools
    : [{ id: `qt-${Date.now()}`, tool: "", fieldValues: {} }];

  const saveQuestionTools = (newTools: ToolEntry[]) => {
    save({ questionTools: newTools });
  };

  const updateQuestionTool = (idx: number, updates: Partial<ToolEntry>) => {
    const next = questionTools.map((t, i) => (i === idx ? { ...t, ...updates } : t));
    saveQuestionTools(next);
  };

  const removeQuestionTool = (idx: number) => {
    const next = questionTools.filter((_, i) => i !== idx);
    saveQuestionTools(next.length ? next : [{ id: `qt-${Date.now()}`, tool: "", fieldValues: {} }]);
  };

  const addQuestionTool = () => {
    saveQuestionTools([...questionTools, { id: `qt-${Date.now()}`, tool: "", fieldValues: {} }]);
  };

  /* ── Internal Note creation from case ── */
  const handleCreateInternalNote = () => {
    const caseTitle = caseData?.title || "";
    const baseId = caseTitle.replace(/[_\-]?\d{6,8}$/g, "").replace(/[_\-]?\d{4}[\-\/]?\d{2}[\-\/]?\d{2}$/, "").trim() || caseTitle;
    const prefix = `${baseId}_Note_`;
    const maxSeq = internalNotesStore.getMaxSeqForPrefix(prefix);
    const nextSeq = String(maxSeq + 1).padStart(5, "0");

    const newNote: InternalNote = {
      id: `note-${Date.now()}`,
      title: `${prefix}${nextSeq}`,
      relatedCase: caseTitle,
      createdAt: new Date().toISOString(),
      creator: profile?.display_name || "",
      status: "",
      noteType: "",
      internalAssignee: caseData?.reviewer ? [caseData.reviewer] : [],
      fileName: "",
      idRowCount: "",
      sourceText: "",
      translatedText: "",
      questionOrNote: "",
      questionOrNoteBlocks: [],
      referenceFiles: [],
      comments: [],
      invalidated: false,
    };
    internalNotesStore.add(newNote);
    navigate(`/internal-notes?noteId=${newNote.id}`);
  };

  // Get linked notes for this case (reactive via useInternalNotes)
  const linkedNotes = caseData ? allInternalNotes.filter((n) => n.relatedCase === caseData.title) : [];

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
  const isInquiry = caseData.status === "inquiry";
  const isDispatched = caseData.status === "dispatched";
  const isTaskCompleted = caseData.status === "task_completed";
  const isDelivered = caseData.status === "delivered";
  const isFeedback = caseData.status === "feedback";
  const isFeedbackCompleted = caseData.status === "feedback_completed";
  const isFinalized = caseData.status === "finalized";
  const isMember = currentRole === "member";
  const isPmOrAbove = currentRole === "pm" || currentRole === "executive";

  const handleDuplicate = async () => {
    const dup = await caseStore.duplicate(caseData.id);
    if (dup) {
      // Clear specified fields on the duplicated case
      await caseStore.update(dup.id, {
        translator: [],
        unitCount: 0,
        translationDeadline: null,
        reviewDeadline: null,
        caseReferenceMaterials: [],
        multiCollab: false,
        collabCount: 0,
        collabRows: [],
      });
      navigate(`/cases/${dup.id}`);
    }
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

  const handleAcceptCase = () => {
    const displayName = profile?.display_name || "";
    const currentTranslators = caseData.translator || [];
    const updatedTranslators = currentTranslators.includes(displayName)
      ? currentTranslators
      : [...currentTranslators, displayName];
    save({ status: "dispatched" as CaseStatus, translator: updatedTranslators });
    toast({ title: "已承接本案" });
  };

  const handleFinalize = () => {
    save({ status: "dispatched" as CaseStatus });
    toast({ title: "已確定指派" });
  };

  const handleTaskComplete = () => {
    save({ status: "task_completed" as CaseStatus });
    toast({ title: "任務已完成" });
  };

  const handleCancelDispatch = () => {
    save({ status: "inquiry" as CaseStatus });
    toast({ title: "已取消指派" });
  };

  const handleRevertToDispatched = () => {
    // Uncheck all taskCompleted and delivered in collab rows when reverting
    if (caseData?.multiCollab && caseData.collabRows.length > 0) {
      const updatedRows = caseData.collabRows.map(r => ({ ...r, taskCompleted: false, delivered: false }));
      save({ status: "dispatched" as CaseStatus, collabRows: updatedRows });
    } else {
      save({ status: "dispatched" as CaseStatus });
    }
    toast({ title: "已退回修正" });
  };

  const handleRevertToFeedback = () => {
    save({ status: "feedback" as CaseStatus });
    toast({ title: "已退回處理" });
  };

  const handleDelivered = () => {
    // If multi-collab, also check all delivered boxes
    if (caseData?.multiCollab && caseData.collabRows.length > 0) {
      const updatedRows = caseData.collabRows.map(r => ({ ...r, delivered: true }));
      save({ status: "delivered" as CaseStatus, collabRows: updatedRows });
    } else {
      save({ status: "delivered" as CaseStatus });
    }
    toast({ title: "已交件完畢" });
  };

  const handleFeedback = () => {
    save({ status: "feedback" as CaseStatus });
    toast({ title: "處理回饋中" });
  };

  const handleFeedbackComplete = () => {
    save({ status: "feedback_completed" as CaseStatus });
    toast({ title: "回饋處理完畢" });
  };

  const isCurrentUserTranslator = (() => {
    const dn = profile?.display_name || "";
    if (!dn) return false;
    if ((caseData.translator || []).includes(dn)) return true;
    // Also check collab rows
    if (caseData.multiCollab && caseData.collabRows?.some(r => r.translator === dn)) return true;
    return false;
  })();

  const comments = caseData.comments || [];
  const internalComments = caseData.internalComments || [];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (shouldBlockNav) {
              pendingNavigateRef.current = () => navigate("/cases");
              setPublishPromptOpen(true);
            } else {
              navigate("/cases");
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          返回案件清單
        </button>
        <div className="flex items-center gap-2">
          {isPmOrAbove && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs min-w-[88px]"
              onClick={() => {
                const url = `${window.location.origin}/cases/${id}`;
                const title = caseData?.title || "";
                const plainText = `請問這件可以做嗎？\n${title}（${url}）`;
                const richHtml = `請問這件可以做嗎？<br><a href="${url}">${title}</a>`;
                try {
                  navigator.clipboard.write([
                    new ClipboardItem({
                      "text/plain": new Blob([plainText], { type: "text/plain" }),
                      "text/html": new Blob([richHtml], { type: "text/html" }),
                    }),
                  ]).then(() => toast({ description: "已複製詢案訊息至剪貼簿" }));
                } catch {
                  navigator.clipboard.writeText(plainText).then(() => toast({ description: "已複製詢案訊息至剪貼簿" }));
                }
              }}
            >
              產生詢案訊息
            </Button>
          )}
          {isPmOrAbove && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs min-w-[88px]"
              onClick={handleDuplicate}
            >
              複製本頁
            </Button>
          )}
          {isPmOrAbove && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs min-w-[88px]"
              onClick={handleNewCase}
            >
              新增案件頁面
            </Button>
          )}
          {/* Left-side grey button */}
          {isInquiry && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] text-white hover:opacity-80"
              style={{ backgroundColor: '#6B7280' }}
              onClick={handleRevertToDraft}
            >
              收回為草稿
            </Button>
          ) : isDispatched && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] text-white hover:opacity-80"
              style={{ backgroundColor: '#6B7280' }}
              onClick={handleCancelDispatch}
            >
              取消指派
            </Button>
          ) : (isTaskCompleted || isDelivered || isFeedback) && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] text-white hover:opacity-80"
              style={{ backgroundColor: '#6B7280' }}
              onClick={handleRevertToFeedback}
            >
              退回修正
            </Button>
          ) : isFeedbackCompleted && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] text-white hover:opacity-80"
              style={{ backgroundColor: '#6B7280' }}
              onClick={handleRevertToDispatched}
            >
              退回處理
            </Button>
          ) : isDraft && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] text-white hover:opacity-80"
              style={{ backgroundColor: '#6B7280' }}
              onClick={() => setDeleteOpen(true)}
            >
              刪除
            </Button>
          ) : null}
          {/* Right-side primary button */}
          {isDraft && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px]"
              onClick={handlePublish}
            >
              公布
            </Button>
          ) : isInquiry && isMember ? (
            caseData.multiCollab ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" className="text-xs min-w-[88px]" disabled>
                        承接本案
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>請於表格內可承接的橫列勾選「確認承接」</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                size="sm"
                className="text-xs min-w-[88px] bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleAcceptCase}
              >
                承接本案
              </Button>
            )
          ) : isInquiry && isPmOrAbove ? (
            (() => {
              const translatorEmpty = !caseData.translator || caseData.translator.length === 0;
              const btn = (
                <Button
                  size="sm"
                  className="text-xs min-w-[88px] bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={translatorEmpty}
                  onClick={handleFinalize}
                >
                  確定指派
                </Button>
              );
              return translatorEmpty ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
                    <TooltipContent>譯者欄不得空白</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : btn;
            })()
          ) : isDispatched && (isCurrentUserTranslator || isPmOrAbove) ? (
            caseData.multiCollab ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" className="text-xs min-w-[88px]" disabled>
                        任務完成
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>請直接勾選「任務完成」</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                size="sm"
                className="text-xs min-w-[88px] bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleTaskComplete}
              >
                任務完成
              </Button>
            )
          ) : isFeedback && (isCurrentUserTranslator || isPmOrAbove) ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleFeedbackComplete}
            >
              處理完畢
            </Button>
          ) : (isTaskCompleted || isFeedbackCompleted) && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleDelivered}
            >
              交件完畢
            </Button>
          ) : isDelivered && isPmOrAbove ? (
            <Button
              size="sm"
              className="text-xs min-w-[88px] bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleFeedback}
            >
              處理回饋
            </Button>
          ) : null}
        </div>
      </div>

      <Field label="案件編號">
        <MultilineInput 
          value={caseData.title} 
          onChange={(e) => save({ title: e.target.value })} 
          className="max-w-md" 
          minRows={1}
          maxRows={3}
          borderless
        />
      </Field>
      <Field label="狀態">
        <div className="flex items-center gap-3">
          <CaseStatusBadge status={caseData.status} />
          {caseData.multiCollab && isInquiry && (
            <span className="text-xs text-muted-foreground">
              譯者若可承接，請直接於表格中可承接的橫列勾選「確認承接」。
            </span>
          )}
          {caseData.multiCollab && isDispatched && (
            <span className="text-xs text-muted-foreground">
              譯者完成任務後，請直接勾選「任務完成」。
            </span>
          )}
          
        </div>
      </Field>

      <Separator />

      <h2 className="text-base font-semibold">基本資訊</h2>
      {/* Two-column layout: left = A, B groups + add button; right = blank, C, D per group */}
      {(() => {
        const workGroups = (caseData.workGroups && caseData.workGroups.length > 0)
          ? caseData.workGroups
          : [{ id: `wg-init`, workType: "", billingUnit: "", unitCount: 0 }];

        const saveGroups = (groups: typeof workGroups) => {
          save({
            workGroups: groups,
            // keep legacy fields in sync
            workType: groups.map((g) => g.workType).filter(Boolean),
            billingUnit: groups[0]?.billingUnit || "",
            unitCount: groups[0]?.unitCount || 0,
          });
        };

        const updateGroup = (idx: number, patch: Partial<typeof workGroups[0]>) => {
          const next = workGroups.map((g, i) => i === idx ? { ...g, ...patch } : g);
          saveGroups(next);
        };

        const addGroup = () => {
          saveGroups([...workGroups, { id: `wg-${Date.now()}`, workType: "", billingUnit: "", unitCount: 0 }]);
        };

        const removeGroup = (idx: number) => {
          const next = workGroups.filter((_, i) => i !== idx);
          saveGroups(next.length ? next : [{ id: `wg-${Date.now()}`, workType: "", billingUnit: "", unitCount: 0 }]);
        };

        return (
          <div className="space-y-1">
            <Field label="內容性質">
              <ColorSelect fieldKey="caseCategory" value={caseData.category} onValueChange={(v) => save({ category: v })} />
            </Field>
            {workGroups.map((g, idx) => (
              <div key={g.id} className="grid grid-cols-[100px_1fr] items-center gap-3 py-1">
                <span className="text-sm text-muted-foreground">工作類型</span>
                <div className="flex items-center gap-3">
                  <ColorSelect
                    fieldKey="taskType"
                    value={g.workType}
                    onValueChange={(v) => updateGroup(idx, { workType: v })}
                    className="flex-1 min-w-0"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">計費單位</span>
                  <ColorSelect
                    fieldKey="billingUnit"
                    value={g.billingUnit}
                    onValueChange={(v) => updateGroup(idx, { billingUnit: v })}
                    className="flex-1 min-w-0"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">計費單位數</span>
                  <Input
                    type="number"
                    value={g.unitCount || ""}
                    onChange={(e) => updateGroup(idx, { unitCount: Number(e.target.value) || 0 })}
                    className="w-[80px] shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {workGroups.length > 1 ? (
                    <button
                      type="button"
                      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted/60 transition-colors shrink-0"
                      onClick={() => removeGroup(idx)}
                      title="移除此群組"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <div className="w-7 shrink-0" />
                  )}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[100px_1fr] items-center gap-3 py-0.5">
              <span />
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground h-7 px-2 w-fit" onClick={addGroup}>
                <Plus className="h-3.5 w-3.5" />
                新增工作類型
              </Button>
            </div>
          </div>
        );
      })()}
      {!caseData.multiCollab ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="譯者">
              {(isDispatched || isTaskCompleted || isDelivered || isFeedback || isFeedbackCompleted || isFinalized) ? (
                <div className="flex items-center gap-1 flex-wrap min-h-[36px] px-2 py-1 rounded-md bg-muted/50 border border-border">
                  {(caseData.translator || []).length > 0
                    ? (caseData.translator || []).map((t, i) => {
                        const opt = assigneeOptions.find((o) => o.label === t);
                        return <AssigneeTag key={i} label={t} avatarUrl={opt?.avatarUrl} />;
                      })
                    : <span className="text-sm text-muted-foreground">—</span>}
                </div>
              ) : (
                <ColorSelect fieldKey="assignee" value={(caseData.translator || [])[0] || ""} onValueChange={(v) => save({ translator: v ? [v] : [] })} />
              )}
            </Field>
            <Field label="審稿人員">
              <ColorSelect fieldKey="assignee" value={caseData.reviewer} onValueChange={(v) => save({ reviewer: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="翻譯交期">
              <DateTimePicker value={caseData.translationDeadline} onChange={(v) => save({ translationDeadline: v })} className="w-full" />
            </Field>
            <Field label="審稿交期">
              <DateTimePicker value={caseData.reviewDeadline} onChange={(v) => save({ reviewDeadline: v })} className="w-full" />
            </Field>
          </div>
        </>
      ) : (
        /* Multi-person collaboration table */
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">多人協作（{caseData.collabCount} 人次）</span>
          </div>
          <CollaborationTable
            rows={caseData.collabRows}
            onChange={(newRows) => {
              const allAccepted = newRows.length > 0 && newRows.every((r) => r.accepted);
              const allTaskCompleted = newRows.length > 0 && newRows.every((r) => r.taskCompleted);
              const allDelivered = newRows.length > 0 && newRows.every((r) => r.delivered);
              
              const updates: Partial<CaseRecord> = { collabRows: newRows };
              
              const collabTranslators = [...new Set(newRows.map(r => r.translator).filter(Boolean))];
              updates.translator = collabTranslators;

              if (isInquiry && allAccepted) {
                updates.status = "dispatched" as CaseStatus;
                save(updates);
                toast({ title: "所有譯者已確認承接，狀態已更新為「已派出」" });
                return;
              }
              if (isDispatched && allTaskCompleted) {
                updates.status = "task_completed" as CaseStatus;
                save(updates);
                toast({ title: "所有任務已完成" });
                return;
              }
              if ((caseData.status === "dispatched" || caseData.status === "task_completed") && allDelivered) {
                updates.status = "delivered" as CaseStatus;
                save(updates);
                toast({ title: "所有交件已完畢，狀態已更新為「交件完畢」" });
                return;
              }
              save(updates);
            }}
            caseStatus={caseData.status}
          />
        </div>
      )}

      {/* Multi-collab checkbox - below deadlines, PM+ only */}
      {isPmOrAbove && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="multiCollab"
            checked={caseData.multiCollab}
            disabled={caseData.multiCollab}
            onCheckedChange={(v) => {
              if (!!v) {
                setCollabCountInput("");
                setCollabCountDialogOpen(true);
              }
            }}
          />
          <Label htmlFor="multiCollab" className="text-sm cursor-pointer">多人協作/分批交件</Label>
          {caseData.multiCollab && isPmOrAbove && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => {
                setCollabEditInput(String(caseData.collabCount));
                setCollabEditOpen(true);
              }}
            >
              變更人次
            </Button>
          )}
          {caseData.multiCollab && isPmOrAbove && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => {
                // Always show row selection dialog for cancelling
                setCollabCancelMode("cancel");
                setCollabCancelSelectedRows(new Set(caseData.collabRows.length === 1 ? [caseData.collabRows[0].id] : []));
                setCollabCancelOpen(true);
              }}
            >
              取消多人協作
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {checkPerm("case_management", "case_detail_client", "view") && (
          <Field label="客戶">
            <ColorSelect fieldKey="client" value={caseData.client} disabled={!checkPerm("case_management", "case_detail_client", "edit")} onValueChange={(v) => save({ client: v })} />
          </Field>
        )}
        {checkPerm("case_management", "case_detail_contact", "view") && (
          <Field label="聯絡人">
            <ColorSelect fieldKey="contact" value={caseData.contact} disabled={!checkPerm("case_management", "case_detail_contact", "edit")} onValueChange={(v) => save({ contact: v })} />
          </Field>
        )}
      </div>

      {/* 本案費用 + 產生本案費用單 */}
      {(() => {
        const caseUrl = `${window.location.origin}/cases/${caseData.id}`;
        const linkedFees = allFees.filter((f) => f.internalNoteUrl === caseUrl);
        const translators: string[] = Array.isArray(caseData.translator) ? caseData.translator : [];
        const feeCount = linkedFees.length;
        const translatorCount = translators.length;
        const showButton = isPmOrAbove && (translatorCount === 0 || feeCount < translatorCount);
        const showTooMany = translatorCount > 0 && feeCount > translatorCount;
        const showTooFew = translatorCount > 0 && feeCount > 0 && feeCount < translatorCount;
        // Permissions
        const canSeeButton = checkPerm("case_management", "case_fee_generate_button", "view");
        const canUseButton = checkPerm("case_management", "case_fee_generate_button", "edit");
        const canSeeFeeWarning = checkPerm("case_management", "case_fee_warning", "view");
        const canSeeBadges = checkPerm("case_management", "case_fee_badges", "view");
        const canSeeFeeLinks = checkPerm("case_management", "case_fee_links", "view");
        // For member: only show fees assigned to them
        const userDisplayName = profile?.display_name || "";
        const visibleFees = isMember
          ? linkedFees.filter((f) => f.assignee === userDisplayName)
          : linkedFees;
        const visibleCount = visibleFees.length;

        // If member has no visible fees, skip rendering this section entirely
        if (isMember && visibleCount === 0 && feeCount === 0) return null;

        const sorted = [...visibleFees].sort((a, b) => {
          const aP = a.clientInfo?.isFirstFee ? 0 : a.clientInfo?.notFirstFee ? 2 : 1;
          const bP = b.clientInfo?.isFirstFee ? 0 : b.clientInfo?.notFirstFee ? 2 : 1;
          return aP - bP;
        });

        return (
          <div className="grid grid-cols-[100px_1fr] items-start gap-3 py-1">
            {/* Left: label + warning stacked, vertically centered */}
            <div className="flex flex-col justify-center pt-1 gap-0.5">
              <span className="text-sm text-muted-foreground leading-tight whitespace-nowrap">
                本案費用<br />（{feeCount} 筆）
              </span>
              {canSeeFeeWarning && showTooMany && (
                <span className="text-[11px] text-destructive leading-tight">費用單數目多於譯者人數，請確認無誤</span>
              )}
              {canSeeFeeWarning && showTooFew && (
                <span className="text-[11px] text-destructive leading-tight">費用單數目少於譯者人數，請確認無誤</span>
              )}
            </div>
            {/* Right: fee list + button */}
            <div className="flex flex-col gap-1">
              {!canSeeFeeLinks ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : visibleCount === 0 ? (
                <span className="text-sm text-muted-foreground">尚無費用單</span>
              ) : (
                <div className="space-y-1">
                  {sorted.map((f) => (
                    <div key={f.id} className="grid items-center gap-2 rounded px-1 py-0.5" style={{ gridTemplateColumns: "minmax(200px, 1fr) 140px 48px" }}>
                      <Link to={`/fees/${f.id}`} className="text-sm text-primary hover:underline underline-offset-2 truncate text-left">
                        {f.title || "未命名費用"}
                      </Link>
                      <div className="flex items-center justify-start">
                        {f.assignee ? <AssigneeTag label={f.assignee} size="sm" /> : <span />}
                      </div>
                      {canSeeBadges ? (
                        <div className="flex items-center justify-end">
                          {f.clientInfo?.isFirstFee && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">主要</Badge>
                          )}
                          {f.clientInfo?.notFirstFee && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 text-muted-foreground">非主要</Badge>
                          )}
                        </div>
                      ) : <div />}
                    </div>
                  ))}
                </div>
              )}
              {/* Button to generate fees */}
              {canSeeButton && showButton && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 w-fit mt-1"
                disabled={!canUseButton}
                onClick={() => {
                  if (!caseData) return;
                  const rawGroups = Array.isArray(caseData.workGroups) ? caseData.workGroups : [];
                  const workGroups = rawGroups.length > 0
                    ? rawGroups
                    : [{ id: `wg-fallback`, workType: "", billingUnit: caseData.billingUnit || "字", unitCount: caseData.unitCount || 0 }];
                  const caseTitle = caseData.title || "";

                  const knownTaskTypes: TaskType[] = ["翻譯", "校對", "MTPE", "LQA"];
                  const taskTypeAliases: Record<string, TaskType> = { "審稿": "校對", "Review": "校對", "Translation": "翻譯", "Proofreading": "校對" };
                  const matchTaskType = (wt: string): string => {
                    const direct = knownTaskTypes.find((t) => wt.includes(t));
                    if (direct) return direct;
                    for (const [alias, mapped] of Object.entries(taskTypeAliases)) {
                      if (wt.includes(alias)) return mapped;
                    }
                    return wt;
                  };
                  const billingUnitMap: Record<string, BillingUnit> = { "字": "字", "小時": "小時" };
                  const ensureTaskTypeOption = (taskType: string) => {
                    const existingOptions = selectOptionsStore.getSortedOptions("taskType");
                    if (!existingOptions.find((o) => o.label === taskType)) {
                      const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
                      selectOptionsStore.addOption("taskType", taskType, color);
                    }
                  };

                  // Auto-create client/contact options if they don't exist
                  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
                  const caseClient = caseData.client || "";
                  const caseContact = caseData.contact || "";
                  if (caseClient) {
                    const existingClients = selectOptionsStore.getSortedOptions("client");
                    if (!existingClients.find((o) => normalize(o.label) === normalize(caseClient))) {
                      selectOptionsStore.addOption("client", caseClient, PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
                    }
                  }
                  if (caseContact) {
                    const existingContacts = selectOptionsStore.getSortedOptions("contact");
                    if (!existingContacts.find((o) => normalize(o.label) === normalize(caseContact))) {
                      selectOptionsStore.addOption("contact", caseContact, CONTACT_DEFAULT_COLOR);
                    }
                  }

                  const mapped: FeeTaskItem[] = workGroups
                    .map((g, idx) => {
                      const matchedType = matchTaskType((g.workType || "").trim() || "翻譯");
                      ensureTaskTypeOption(matchedType);
                      const bu = billingUnitMap[g.billingUnit] || "字";
                      // Auto-pricing: look up default client price, then translator tier
                      const clientPrice = caseClient
                        ? defaultPricingStore.getClientPrice(caseClient, matchedType, bu) ?? 0
                        : 0;
                      const translatorPrice = clientPrice > 0
                        ? defaultPricingStore.getTranslatorPrice(clientPrice, matchedType, bu) ?? 0
                        : 0;
                      return {
                        id: `item-case-${Date.now()}-${idx}`,
                        taskType: matchedType as TaskType,
                        billingUnit: bu,
                        unitCount: Number(g.unitCount) || 0,
                        unitPrice: translatorPrice,
                      };
                    });

                  const resolveAssignee = (name: string): string => {
                    const assigneeOptions = selectOptionsStore.getSortedOptions("assignee");
                    const m = assigneeOptions.find((o) => o.label === name || o.email === name);
                    return m ? m.label : name;
                  };

                  const firstAssignee = translators.length > 0 ? resolveAssignee(translators[0]) : "";
                  const isMulti = translators.length > 1;
                  const baseTitle = caseTitle ? `PO_${caseTitle}` : "";
                  const firstTitle = isMulti ? `${baseTitle}_01` : baseTitle;

                  const firstFeeId = crypto.randomUUID();
                  const firstFee: TranslatorFee = {
                    id: firstFeeId,
                    title: firstTitle,
                    assignee: firstAssignee,
                    status: "draft",
                    internalNote: caseTitle,
                    internalNoteUrl: caseUrl,
                    taskItems: mapped,
                    clientInfo: {
                      ...defaultClientInfo,
                      clientTaskItems: mapped.map((m, idx) => ({
                        id: `ci-case-${Date.now()}-${idx}`,
                        taskType: m.taskType,
                        billingUnit: m.billingUnit,
                        unitCount: m.unitCount,
                        clientPrice: caseClient
                          ? defaultPricingStore.getClientPrice(caseClient, m.taskType, m.billingUnit) ?? 0
                          : 0,
                      })),
                      ...(isMulti ? { sameCase: true, isFirstFee: true, notFirstFee: false } : {}),
                      ...(caseClient ? { client: caseClient } : {}),
                      ...(caseContact ? { contact: caseContact } : {}),
                    },
                    notes: [],
                    editLogs: [],
                    createdBy: profile?.id || "",
                    createdAt: new Date().toISOString(),
                  };
                  feeStore.addFee(firstFee);

                  if (isMulti) {
                    for (let i = 1; i < translators.length; i++) {
                      const personAssignee = resolveAssignee(translators[i]);
                      const pageTitle = `${baseTitle}_${String(i + 1).padStart(2, "0")}`;
                      const newFee: TranslatorFee = {
                        id: crypto.randomUUID(),
                        title: pageTitle,
                        assignee: personAssignee,
                        status: "draft",
                        internalNote: caseTitle,
                        internalNoteUrl: caseUrl,
                        taskItems: mapped.map((item, idx) => ({ ...item, id: `item-clone-${Date.now()}-${idx}-${i}` })),
                        clientInfo: {
                          ...defaultClientInfo,
                          clientTaskItems: mapped.map((m, idx) => ({
                            id: `ci-clone-${Date.now()}-${idx}-${i}`,
                            taskType: m.taskType,
                            billingUnit: m.billingUnit,
                            unitCount: m.unitCount,
                            clientPrice: caseClient
                              ? defaultPricingStore.getClientPrice(caseClient, m.taskType, m.billingUnit) ?? 0
                              : 0,
                          })),
                          sameCase: true,
                          isFirstFee: false,
                          notFirstFee: true,
                          ...(caseClient ? { client: caseClient } : {}),
                          ...(caseContact ? { contact: caseContact } : {}),
                        },
                        notes: [],
                        editLogs: [],
                        createdBy: profile?.id || "",
                        createdAt: new Date().toISOString(),
                      };
                      feeStore.addFee(newFee);
                    }
                    toast({ title: `已產生 ${translators.length} 筆費用單` });
                  } else {
                    toast({ title: "已產生費用單" });
                  }

                  navigate(`/fees/${firstFeeId}`);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                產生本案費用單
              </Button>
              )}
            </div>
          </div>
        );
      })()}

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
            canEditTool={canEditToolSelect}
            canRemoveTool={canRemoveTool}
            canAddField={canAddToolField}
            canRemoveField={canRemoveToolField}
            canUseTemplate={canUseToolTemplate}
          />
        ))}
        {canAddTool && (
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={addTool}>
            <Plus className="h-4 w-4" />
            新增工具
          </Button>
        )}
      </div>

      <Separator />

      <h2 className="text-base font-semibold">提問</h2>

      {/* 內部註記 (左) + 客戶提問表單 (右) 左右排列 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 內部提問或註記 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">內部提問或註記</Label>
          {linkedNotes.length > 0 ? (
            <div className="space-y-1">
              {linkedNotes.map((n) => (
                <Link
                  key={n.id}
                  to={`/internal-notes?noteId=${n.id}`}
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  {n.title}
                  {n.invalidated && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">已失效</Badge>}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              尚無內部註記。點擊「新增」將在內部註記模組建立一筆新紀錄。
            </p>
          )}
          <div>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={handleCreateInternalNote}>
              <Plus className="h-3.5 w-3.5" />
              新增
            </Button>
          </div>
        </div>

        {/* 客戶提問表單 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">客戶提問表單</Label>
          {/* 有填寫客戶提問表單 checkbox */}
          {(() => {
            const canUseClientQForm = isPmOrAbove || isCurrentUserTranslator;
            return canUseClientQForm ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="clientQuestionForm"
                  checked={caseData.clientQuestionForm ?? false}
                  onCheckedChange={(v) => save({ clientQuestionForm: !!v })}
                />
                <Label htmlFor="clientQuestionForm" className="text-sm cursor-pointer">有填寫客戶提問表單</Label>
              </div>
            ) : null;
          })()}
          {questionTools.map((entry, idx) => (
            <ToolInstance
              key={entry.id}
              entry={entry}
              index={idx}
              onUpdate={(u) => updateQuestionTool(idx, u)}
              onRemove={() => removeQuestionTool(idx)}
              showRemove={questionTools.length > 1}
              toolFieldKey="executionTool"
              toolLabel="提問工具"
              canEditTool={canEditToolSelect}
              canRemoveTool={canRemoveTool}
              canAddField={canAddToolField}
              canRemoveField={canRemoveToolField}
              canUseTemplate={canUseToolTemplate}
            />
          ))}
          {canAddTool && (
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={addQuestionTool}>
              <Plus className="h-4 w-4" />
              新增提問工具
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">準則與檔案</h2>
        <span className="text-xs text-muted-foreground">檔案如上傳不成功，請改以拖曳方式上傳</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="交件方式">
          <FileField value={Array.isArray(caseData.deliveryMethodFiles) ? caseData.deliveryMethodFiles : []} onChange={(v) => save({ deliveryMethodFiles: v })} />
        </Field>
        <Field label="客戶收件">
          <FileField value={Array.isArray(caseData.clientReceiptFiles) ? caseData.clientReceiptFiles : []} onChange={(v) => save({ clientReceiptFiles: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="自製準則頁面">
          <FileField value={Array.isArray(caseData.customGuidelinesUrl) ? caseData.customGuidelinesUrl : []} onChange={(v) => save({ customGuidelinesUrl: v })} />
        </Field>
        <Field label="客戶指定準則">
          <FileField value={Array.isArray(caseData.clientGuidelines) ? caseData.clientGuidelines : []} onChange={(v) => save({ clientGuidelines: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="本系列參考資料">
          <FileField value={Array.isArray(caseData.seriesReferenceMaterials) ? caseData.seriesReferenceMaterials : []} onChange={(v) => save({ seriesReferenceMaterials: v })} />
        </Field>
        <Field label="本案參考資料">
          <FileField value={Array.isArray(caseData.caseReferenceMaterials) ? caseData.caseReferenceMaterials : []} onChange={(v) => save({ caseReferenceMaterials: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="譯者完稿">
          <FileField value={Array.isArray(caseData.translatorFinal) ? caseData.translatorFinal : []} onChange={(v) => save({ translatorFinal: v })} />
        </Field>
        <Field label="內審完稿">
          <FileField value={Array.isArray(caseData.internalReviewFinal) ? caseData.internalReviewFinal : []} onChange={(v) => save({ internalReviewFinal: v })} />
        </Field>
      </div>
      <Field label="追蹤修訂">
        <FileField value={Array.isArray(caseData.trackChanges) ? caseData.trackChanges : []} onChange={(v) => save({ trackChanges: v })} />
      </Field>

      <Separator />

      {/* 案件說明 */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">案件說明</h2>
        <Suspense fallback={<div className="h-32 rounded-md border border-input bg-background animate-pulse" />}>
          <RichTextEditor
            initialContent={caseData.bodyContent || []}
            onChange={(blocks) => save({ bodyContent: blocks })}
          />
        </Suspense>
      </div>

      <Separator />

      {/* Meta info */}
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>建立者：{creatorName || "—"}</span>
        <span>建立時間：{new Date(caseData.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
      </div>

      <Separator />

      {/* 案件相關備註 */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">案件相關備註</Label>
        <div className="space-y-2">
          {(() => {
            const topLevel = comments.filter((c) => !c.replyTo);
            const replies = (parentId: string) => comments.filter((c) => c.replyTo === parentId);
            return topLevel.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.author}</span>
                      <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                    </div>
                    <button
                      className="text-muted-foreground hover:text-foreground text-[10px] px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
                      onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                    >
                      回覆
                    </button>
                  </div>
                  <CommentContent content={c.content} imageUrls={c.imageUrls} fileUrls={c.fileUrls} />
                </div>
                {/* Replies */}
                {replies(c.id).map((r) => (
                  <div key={r.id} className="ml-6 rounded-md border border-border/60 bg-secondary/15 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{r.author}</span>
                      <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                    </div>
                    <CommentContent content={r.content} imageUrls={r.imageUrls} fileUrls={r.fileUrls} />
                  </div>
                ))}
                {/* Reply input */}
                {replyingTo === c.id && (
                  <div className="ml-6">
                    <CommentInput
                      draft={commentDraft}
                      setDraft={setCommentDraft}
                      placeholder={`回覆 ${c.author}...`}
                      onSubmit={(content, imageUrls, fileUrls) => {
                        const newComment: CaseComment = {
                          id: `comment-${Date.now()}`,
                          author: profile?.display_name || "成員",
                          content,
                          imageUrls,
                          fileUrls,
                          replyTo: c.id,
                          createdAt: new Date().toISOString(),
                        };
                        save({ comments: [...comments, newComment] });
                        setReplyingTo(null);
                      }}
                    />
                  </div>
                )}
              </div>
            ));
          })()}
        </div>
        <CommentInput
          draft={replyingTo ? "" : commentDraft}
          setDraft={(v) => { if (!replyingTo) setCommentDraft(v); }}
          placeholder="輸入留言..."
          onSubmit={(content, imageUrls, fileUrls) => {
            const newComment: CaseComment = {
              id: `comment-${Date.now()}`,
              author: profile?.display_name || "成員",
              content,
              imageUrls,
              fileUrls,
              createdAt: new Date().toISOString(),
            };
            save({ comments: [...comments, newComment] });
          }}
        />
      </div>

      {/* 案件內部備註 — PM+ only */}
      {isManager && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label className="text-sm font-medium">案件內部備註</Label>
            <div className="space-y-2">
              {(() => {
                const topLevel = internalComments.filter((c) => !c.replyTo);
                const replies = (parentId: string) => internalComments.filter((c) => c.replyTo === parentId);
                return topLevel.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.author}</span>
                          <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                        </div>
                        <button
                          className="text-muted-foreground hover:text-foreground text-[10px] px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
                          onClick={() => setInternalReplyingTo(internalReplyingTo === c.id ? null : c.id)}
                        >
                          回覆
                        </button>
                      </div>
                      <CommentContent content={c.content} imageUrls={c.imageUrls} fileUrls={c.fileUrls} />
                    </div>
                    {replies(c.id).map((r) => (
                      <div key={r.id} className="ml-6 rounded-md border border-border/60 bg-secondary/15 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{r.author}</span>
     <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                        </div>
                        <CommentContent content={r.content} imageUrls={r.imageUrls} fileUrls={r.fileUrls} />
                      </div>
                    ))}
                    {internalReplyingTo === c.id && (
                      <div className="ml-6">
                        <CommentInput
                          draft={internalCommentDraft}
                          setDraft={setInternalCommentDraft}
                          placeholder={`回覆 ${c.author}...`}
                          onSubmit={(content, imageUrls, fileUrls) => {
                            const newComment: CaseComment = {
                              id: `icomment-${Date.now()}`,
                              author: profile?.display_name || "專案經理",
                              content,
                              imageUrls,
                              fileUrls,
                              replyTo: c.id,
                              createdAt: new Date().toISOString(),
                            };
                            save({ internalComments: [...internalComments, newComment] });
                            setInternalReplyingTo(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
            <CommentInput
              draft={internalReplyingTo ? "" : internalCommentDraft}
              setDraft={(v) => { if (!internalReplyingTo) setInternalCommentDraft(v); }}
              placeholder="輸入案件內部備註..."
              onSubmit={(content, imageUrls, fileUrls) => {
                const newComment: CaseComment = {
                  id: `icomment-${Date.now()}`,
                  author: profile?.display_name || "專案經理",
                  content,
                  imageUrls,
                  fileUrls,
                  createdAt: new Date().toISOString(),
                };
                save({ internalComments: [...internalComments, newComment] });
              }}
            />
          </div>
        </>
      )}

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

      {/* Publish prompt dialog when leaving draft case */}
      <AlertDialog open={publishPromptOpen} onOpenChange={(v) => {
        if (!v) setPublishPromptOpen(false);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>公布案件？</AlertDialogTitle>
            <AlertDialogDescription>此案件目前仍為草稿狀態，是否要公布為「詢案中」？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPublishPromptOpen(false);
              const nav = pendingNavigateRef.current;
              pendingNavigateRef.current = null;
              if (nav) nav();
            }}>不公布，直接離開</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              save({ status: "inquiry" as CaseStatus });
              toast({ title: "案件已公布" });
              setPublishPromptOpen(false);
              const nav = pendingNavigateRef.current;
              pendingNavigateRef.current = null;
              if (nav) nav();
            }}>公布</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-collab: initial count dialog */}
      <AlertDialog open={collabCountDialogOpen} onOpenChange={(v) => { if (!v) setCollabCountDialogOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>設定譯者人次需求</AlertDialogTitle>
            <AlertDialogDescription>請輸入協作表格的列數（譯者人次）。</AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!collabCountInput || Number(collabCountInput) < 1) return;
            const count = Number(collabCountInput);
            const rows: CollabRow[] = Array.from({ length: count }, (_, i) => ({
              id: `cr-${Date.now()}-${i}`,
              segment: "",
              translator: "",
              unitCount: 0,
              accepted: false,
              translationDeadline: null,
              reviewer: "",
              reviewDeadline: null,
              taskCompleted: false,
              delivered: false,
            }));
            save({ multiCollab: true, collabCount: count, collabRows: rows });
            setCollabCountDialogOpen(false);
            toast({ title: `已啟用多人協作（${count} 人次）` });
          }}>
            <div className="py-2">
              <Input
                type="number"
                min={1}
                value={collabCountInput}
                onChange={(e) => setCollabCountInput(e.target.value)}
                placeholder="人次數"
                className="w-32 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={!collabCountInput || Number(collabCountInput) < 1}
              >
                確認
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-collab: edit count dialog */}
      <AlertDialog open={collabEditOpen} onOpenChange={(v) => { if (!v) setCollabEditOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>修改譯者人次需求</AlertDialogTitle>
            <AlertDialogDescription>變更列數。已有資料會保留。</AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!collabEditInput || Number(collabEditInput) < 1) return;
            const newCount = Number(collabEditInput);
            const currentRows = caseData?.collabRows || [];
            if (newCount >= currentRows.length) {
              // Expanding: add new rows
              const newRows = [...currentRows, ...Array.from({ length: newCount - currentRows.length }, (_, i) => ({
                id: `cr-${Date.now()}-${i}`,
                segment: "",
                translator: "",
                unitCount: 0,
                accepted: false,
                translationDeadline: null,
                reviewer: "",
                reviewDeadline: null,
                taskCompleted: false,
                delivered: false,
              }))];
              save({ collabCount: newCount, collabRows: newRows });
              setCollabEditOpen(false);
              toast({ title: `人次數已更新為 ${newCount}` });
            } else {
              // Reducing: show row selection
              setCollabReduceTarget(newCount);
              setCollabCancelMode("reduce");
              setCollabCancelSelectedRows(new Set());
              setCollabEditOpen(false);
              setCollabCancelOpen(true);
            }
          }}>
            <div className="py-2">
              <Input
                type="number"
                min={1}
                value={collabEditInput}
                onChange={(e) => setCollabEditInput(e.target.value)}
                placeholder="人次數"
                className="w-32 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={!collabEditInput || Number(collabEditInput) < 1}
              >
                確認
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-collab: cancel / reduce row selection dialog */}
      <AlertDialog open={collabCancelOpen} onOpenChange={(v) => { if (!v) setCollabCancelOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {collabCancelMode === "cancel" ? "取消多人協作" : "縮減人次"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {collabCancelMode === "cancel"
                ? "請勾選要保留的列（僅保留 1 列的譯者資料）。"
                : `請勾選要保留的 ${collabReduceTarget} 列。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto py-2">
            {(caseData?.collabRows || []).map((row, idx) => {
              const targetCount = collabCancelMode === "cancel" ? 1 : collabReduceTarget;
              const isSelected = collabCancelSelectedRows.has(row.id);
              const isFull = collabCancelSelectedRows.size >= targetCount && !isSelected;
              return (
                <label key={row.id} className={cn("flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer", isFull && "opacity-50 cursor-not-allowed")}>
                  <Checkbox
                    checked={isSelected}
                    disabled={isFull}
                    onCheckedChange={(v) => {
                      const next = new Set(collabCancelSelectedRows);
                      if (v) next.add(row.id);
                      else next.delete(row.id);
                      setCollabCancelSelectedRows(next);
                    }}
                  />
                  <span className="text-sm">
                    第 {idx + 1} 列{row.segment ? `：${row.segment}` : ""}{row.translator ? ` — ${row.translator}` : ""}
                  </span>
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={collabCancelSelectedRows.size !== (collabCancelMode === "cancel" ? 1 : collabReduceTarget)}
              onClick={() => {
                const selectedIds = collabCancelSelectedRows;
                const keptRows = (caseData?.collabRows || []).filter(r => selectedIds.has(r.id));
                if (collabCancelMode === "cancel") {
                  // Keep the single selected row's translator as the case translator
                  const translator = keptRows[0]?.translator ? [keptRows[0].translator] : [];
                  save({ multiCollab: false, collabCount: 0, collabRows: [], translator });
                  toast({ title: "已取消多人協作" });
                } else {
                  save({ collabCount: collabReduceTarget, collabRows: keptRows });
                  toast({ title: `人次數已更新為 ${collabReduceTarget}` });
                }
                setCollabCancelOpen(false);
              }}
            >
              確認
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
