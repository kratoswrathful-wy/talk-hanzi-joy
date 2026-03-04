import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, X, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { type TaskType, type BillingUnit, type FeeTaskItem } from "@/data/fee-mock-data";
import { toast } from "sonner";

const taskTypeOptions: TaskType[] = ["翻譯", "審稿", "MTPE", "LQA"];
const billingUnitOptions: BillingUnit[] = ["字", "小時"];

export default function NewTranslatorFee() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const notionId = searchParams.get("notion_id");

  const [loading, setLoading] = useState(!!notionId);
  const [notionData, setNotionData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [internalNoteUrl, setInternalNoteUrl] = useState("");
  const [taskItems, setTaskItems] = useState<FeeTaskItem[]>([
    { id: `item-${Date.now()}`, taskType: "翻譯", billingUnit: "字", unitCount: 0, unitPrice: 0 },
  ]);

  // Fetch Notion data if notion_id is present
  useEffect(() => {
    if (!notionId) return;

    const fetchNotionData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("fetch-notion-page", {
          body: { page_id: notionId },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        setNotionData(data);

        // Auto-fill form fields from Notion data
        // Try common property names
        const caseId = data["案件編號"] || data["Name"] || data["title"] || "";
        const people = data["譯者"] || data["審稿人員"] || [];
        const workTypes = data["工作類型"] || [];
        const unitCount = data["計費單位數"] || null;

        if (caseId) {
          setTitle(`PO_${caseId}`);
        }

        if (Array.isArray(people) && people.length > 0) {
          setAssignee(people[0]);
        }

        if (data.notionUrl) {
          setInternalNote(`案件 ${caseId}`);
          setInternalNoteUrl(data.notionUrl);
        }

        // Map work types to task items
        if (Array.isArray(workTypes) && workTypes.length > 0) {
          const mapped: FeeTaskItem[] = workTypes.map((wt: string, idx: number) => {
            const matchedType = taskTypeOptions.find((t) => wt.includes(t)) || "翻譯";
            return {
              id: `item-notion-${idx}`,
              taskType: matchedType as TaskType,
              billingUnit: "字" as BillingUnit,
              unitCount: idx === 0 && unitCount ? unitCount : 0,
              unitPrice: 0,
            };
          });
          setTaskItems(mapped);
        }

        toast.success("已從 Notion 載入案件資料");
      } catch (err: any) {
        console.error("Failed to fetch Notion data:", err);
        setError(err.message || "無法從 Notion 載入資料");
        toast.error("Notion 資料載入失敗");
      } finally {
        setLoading(false);
      }
    };

    fetchNotionData();
  }, [notionId]);

  const addItem = () => {
    setTaskItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}`, taskType: "翻譯", billingUnit: "字", unitCount: 0, unitPrice: 0 },
    ]);
  };

  const removeItem = (id: string) => {
    if (taskItems.length <= 1) return;
    setTaskItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof FeeTaskItem, value: any) => {
    setTaskItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const total = taskItems.reduce((sum, item) => sum + item.unitCount * item.unitPrice, 0);

  const handleSave = () => {
    // For now, just show a toast since we're using mock data
    toast.success("稿費單已建立（目前為示範模式）");
    navigate("/fees");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在從 Notion 載入案件資料…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to="/fees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">新增稿費單</h1>
          {notionId && notionData && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              已從 Notion 預填
              {notionData.notionUrl && (
                <a
                  href={notionData.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  查看原始頁面 <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">基本資料</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">標題</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：2026年3月 王小明 翻譯費"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">開單對象</Label>
              <Input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="譯者名稱"
                className="text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">相關案件</Label>
              <Input
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="案件編號或備註"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">案件連結</Label>
              <Input
                value={internalNoteUrl}
                onChange={(e) => setInternalNoteUrl(e.target.value)}
                placeholder="https://..."
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* Task Items Table */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">計費項目</h2>
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={addItem}>
              <Plus className="h-3.5 w-3.5" />
              新增項目
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[140px]">任務類型</TableHead>
                  <TableHead className="text-xs w-[100px]">計費單位</TableHead>
                  <TableHead className="text-xs text-right w-[100px]">單位數</TableHead>
                  <TableHead className="text-xs text-right w-[100px]">單價</TableHead>
                  <TableHead className="text-xs text-right w-[100px]">小計</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Select
                        value={item.taskType}
                        onValueChange={(v) => updateItem(item.id, "taskType", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {taskTypeOptions.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.billingUnit}
                        onValueChange={(v) => updateItem(item.id, "billingUnit", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {billingUnitOptions.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={item.unitCount || ""}
                        onChange={(e) => updateItem(item.id, "unitCount", Number(e.target.value))}
                        className="h-8 text-xs text-right w-20 ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.1"
                        value={item.unitPrice || ""}
                        onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value))}
                        className="h-8 text-xs text-right w-20 ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium tabular-nums">
                      {(item.unitCount * item.unitPrice).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={taskItems.length <= 1}
                        onClick={() => removeItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-xs font-medium">
                    合計
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {total.toLocaleString()}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>

        {/* Notion raw data preview (debug, collapsible) */}
        {notionData && (
          <details className="rounded-xl border border-border bg-card p-5">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              查看 Notion 原始資料
            </summary>
            <pre className="mt-3 text-xs overflow-auto max-h-60 bg-secondary/30 rounded-lg p-3">
              {JSON.stringify(notionData, null, 2)}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/fees">取消</Link>
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            建立稿費單
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
