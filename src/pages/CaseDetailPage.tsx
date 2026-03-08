import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { caseStore } from "@/hooks/use-case-store";
import type { CaseRecord, ToolEntry } from "@/data/case-types";
import ColorSelect from "@/components/ColorSelect";
import MultiColorSelect from "@/components/MultiColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
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
import { toast } from "@/hooks/use-toast";
import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";

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
  const selectedTool = toolOptions.find((o) => o.label === entry.tool);
  const fields = selectedTool?.toolFields || [];
  const values = entry.fieldValues || {};

  return (
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
      <Field label="執行工具">
        <ColorSelect
          fieldKey="executionTool"
          value={entry.tool}
          onValueChange={(v) => onUpdate({ tool: v })}
          className="max-w-xs"
        />
      </Field>
      {fields.map((f) => (
        <Field key={f.id} label={f.label}>
          <Input
            value={values[f.id] || ""}
            onChange={(e) =>
              onUpdate({ fieldValues: { ...values, [f.id]: e.target.value } })
            }
            className="max-w-xs"
          />
        </Field>
      ))}
    </div>
  );
}

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    caseStore.load().then(() => {
      const found = caseStore.getById(id!);
      setCaseData(found ?? null);
      setLoading(false);
    });
  }, [id]);

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

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cases")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">案件詳情</h1>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1.5 h-4 w-4" />
          刪除
        </Button>
      </div>

      {/* Title */}
      <Field label="案件編號">
        <Input
          value={caseData.title}
          onChange={(e) => save({ title: e.target.value })}
          className="max-w-md"
        />
      </Field>

      <Separator />

      {/* 基本資訊 */}
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

      <Field label="詢案備註">
        <Textarea value={caseData.inquiryNote} onChange={(e) => save({ inquiryNote: e.target.value })} className="max-w-md" rows={2} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Field label="譯者">
            <ColorSelect fieldKey="assignee" value={caseData.translator} onValueChange={(v) => save({ translator: v })} />
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

      {/* ── 工具區塊 ── */}
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

      {/* Status & Delivery */}
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

      {/* Guidelines & Resources */}
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

      {/* Checkboxes */}
      <h2 className="text-base font-semibold">核取項目</h2>
      <Field label="填寫內部註記表單">
        <Checkbox checked={caseData.internalNoteForm} onCheckedChange={(v) => save({ internalNoteForm: !!v })} />
      </Field>
      <Field label="填寫客戶提問表單">
        <Checkbox checked={caseData.clientQuestionForm} onCheckedChange={(v) => save({ clientQuestionForm: !!v })} />
      </Field>

      <Separator />

      {/* Login Info */}
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

      {/* Track & Fee */}
      <h2 className="text-base font-semibold">追蹤與費用</h2>
      <Field label="追蹤修訂">
        <Input value={caseData.trackChanges} onChange={(e) => save({ trackChanges: e.target.value })} className="max-w-md" />
      </Field>
      <Field label="稿費條">
        <Input value={caseData.feeEntry} onChange={(e) => save({ feeEntry: e.target.value })} className="max-w-md" />
      </Field>

      <Separator />

      {/* Meta */}
      <h2 className="text-base font-semibold">建立資訊</h2>
      <Field label="建立時間">
        <span className="text-sm">{new Date(caseData.createdAt).toLocaleString("zh-TW")}</span>
      </Field>

      {/* Delete dialog */}
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
