import { useEffect, useState, useCallback } from "react";
import { Plus, X, Download, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { FileItem } from "@/components/FileField";

// ─── 型別 ──────────────────────────────────────────────────────────────────────

interface CatAssignment {
  id: string;
  case_id: string;
  translator_user_id: string;
  source_file_name: string;
  source_file_storage_path: string;
  source_lang: string;
  target_lang: string;
  deadline: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  translatorName?: string; // denormalized for display
}

interface ProfileOption {
  id: string;
  display_name: string | null;
  email: string;
}

// ─── 語言選項（與 CAT 工具同步）───────────────────────────────────────────────

const LANG_OPTIONS = [
  { code: "en",    label: "English" },
  { code: "en-US", label: "English (US)" },
  { code: "de",    label: "Deutsch" },
  { code: "fr",    label: "Français" },
  { code: "ja",    label: "日本語" },
  { code: "ko",    label: "한국어" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "zh-CN", label: "簡體中文" },
  { code: "es",    label: "Español" },
  { code: "it",    label: "Italiano" },
  { code: "pt",    label: "Português" },
  { code: "ru",    label: "Русский" },
  { code: "pl",    label: "Polski" },
  { code: "nl",    label: "Nederlands" },
  { code: "hu",    label: "Magyar" },
  { code: "cs",    label: "Čeština" },
  { code: "sv",    label: "Svenska" },
  { code: "da",    label: "Dansk" },
  { code: "fi",    label: "Suomi" },
  { code: "nb",    label: "Norsk" },
];

// ─── 輔助函式 ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  assigned:    "待開始",
  in_progress: "翻譯中",
  completed:   "已完成",
  cancelled:   "已取消",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  assigned:    "outline",
  in_progress: "default",
  completed:   "secondary",
  cancelled:   "destructive",
};

/**
 * 從 Supabase Storage 公開 URL 中擷取 bucket 內的路徑。
 * 例：https://xxx.supabase.co/storage/v1/object/public/case-files/uuid/file.xliff
 *   → uuid/file.xliff
 */
function extractStoragePath(url: string): string {
  const marker = "/case-files/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  return url.slice(idx + marker.length);
}

// ─── 主元件 ────────────────────────────────────────────────────────────────────

interface CatAssignSectionProps {
  caseId: string;
  /** 案件目前的原文檔列表（從 caseData.sourceFiles） */
  sourceFiles: FileItem[];
  /** 目前登入者是否為 PM / executive */
  isAdmin: boolean;
  env: string;
}

export default function CatAssignSection({
  caseId,
  sourceFiles,
  isAdmin,
  env,
}: CatAssignSectionProps) {
  const [assignments, setAssignments] = useState<CatAssignment[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // 新增指派表單狀態
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedTranslator, setSelectedTranslator] = useState("");
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── 讀取指派清單 ─────────────────────────────────────────────────────────────
  const fetchAssignments = useCallback(async () => {
    const { data, error } = await supabase
      .from("cat_assignments")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[CatAssignSection] fetch error", error);
      return;
    }

    // 讀取譯者名稱（批次）
    const userIds = [...new Set((data ?? []).map((a) => a.translator_user_id))];
    const nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      (ps ?? []).forEach((p) => {
        nameMap[p.id] = p.display_name || p.email;
      });
    }

    setAssignments(
      (data ?? []).map((a) => ({
        ...a,
        translatorName: nameMap[a.translator_user_id] ?? a.translator_user_id,
      }))
    );
  }, [caseId]);

  // ── 讀取可指派的成員 ─────────────────────────────────────────────────────────
  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .order("display_name");
    setProfiles(data ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAssignments(), fetchProfiles()]).finally(() =>
      setLoading(false)
    );
  }, [fetchAssignments, fetchProfiles]);

  // ── 新增指派 ─────────────────────────────────────────────────────────────────
  const openDialog = () => {
    setSelectedFile(null);
    setSelectedTranslator("");
    setSourceLang("");
    setTargetLang("");
    setDeadline("");
    setNotes("");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedFile || !selectedTranslator || !sourceLang || !targetLang) {
      toast({ title: "請填寫必填欄位", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const storagePath = extractStoragePath(selectedFile.url);
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("cat_assignments").insert({
        case_id: caseId,
        translator_user_id: selectedTranslator,
        source_file_name: selectedFile.name,
        source_file_storage_path: storagePath,
        source_lang: sourceLang,
        target_lang: targetLang,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
        env,
      });
      if (error) throw error;
      toast({ title: "已建立 CAT 指派任務" });
      setDialogOpen(false);
      await fetchAssignments();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "建立失敗", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── 取消指派 ─────────────────────────────────────────────────────────────────
  const handleCancel = async (id: string) => {
    const { error } = await supabase
      .from("cat_assignments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "操作失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已取消指派" });
    await fetchAssignments();
  };

  // ── 渲染 ─────────────────────────────────────────────────────────────────────
  const active = assignments.filter((a) => a.status !== "cancelled");
  const cancelled = assignments.filter((a) => a.status === "cancelled");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">CAT 指派任務</h3>
          {active.length > 0 && (
            <Badge variant="outline" className="h-5 text-xs px-1.5">
              {active.length}
            </Badge>
          )}
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openDialog}>
            <Plus className="h-3.5 w-3.5" />
            新增指派
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-1">載入中…</div>
      ) : active.length === 0 ? (
        <div className="text-xs text-muted-foreground py-1">尚無 CAT 指派任務</div>
      ) : (
        <div className="space-y-1.5">
          {active.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              isAdmin={isAdmin}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">已取消（{cancelled.length} 筆）</summary>
          <div className="mt-1 space-y-1">
            {cancelled.map((a) => (
              <AssignmentCard key={a.id} assignment={a} isAdmin={false} onCancel={() => {}} />
            ))}
          </div>
        </details>
      )}

      {/* 新增指派 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增 CAT 指派任務</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 來源檔案 */}
            <div className="space-y-1.5">
              <Label>原文檔 <span className="text-destructive">*</span></Label>
              {sourceFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  此案件尚未上傳原文檔，請先在「原文檔」欄位上傳後再指派。
                </p>
              ) : (
                <Select
                  value={selectedFile?.url ?? ""}
                  onValueChange={(url) =>
                    setSelectedFile(sourceFiles.find((f) => f.url === url) ?? null)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇原文檔" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceFiles.map((f) => (
                      <SelectItem key={f.url} value={f.url}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 譯者 */}
            <div className="space-y-1.5">
              <Label>譯者 <span className="text-destructive">*</span></Label>
              <Select value={selectedTranslator} onValueChange={setSelectedTranslator}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇譯者" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 語言對 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>原文語言 <span className="text-destructive">*</span></Label>
                <Select value={sourceLang} onValueChange={setSourceLang}>
                  <SelectTrigger>
                    <SelectValue placeholder="原文" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANG_OPTIONS.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>譯文語言 <span className="text-destructive">*</span></Label>
                <Select value={targetLang} onValueChange={setTargetLang}>
                  <SelectTrigger>
                    <SelectValue placeholder="譯文" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANG_OPTIONS.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 截止日 */}
            <div className="space-y-1.5">
              <Label>截止日（選填）</Label>
              <Input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            {/* 備註 */}
            <div className="space-y-1.5">
              <Label>備註（選填）</Label>
              <Input
                placeholder="給譯者的說明"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || sourceFiles.length === 0}>
              {submitting ? "建立中…" : "建立指派"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 指派卡片子元件 ─────────────────────────────────────────────────────────────

function AssignmentCard({
  assignment,
  isAdmin,
  onCancel,
}: {
  assignment: CatAssignment;
  isAdmin: boolean;
  onCancel: (id: string) => void;
}) {
  const deadlineStr = assignment.deadline
    ? new Date(assignment.deadline).toLocaleString("zh-TW", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      <Download className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{assignment.source_file_name}</span>
          <Badge variant={STATUS_VARIANT[assignment.status] ?? "outline"} className="text-xs h-4 px-1.5">
            {STATUS_LABELS[assignment.status] ?? assignment.status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
          <span>譯者：{assignment.translatorName}</span>
          <span>
            {assignment.source_lang} → {assignment.target_lang}
          </span>
          {deadlineStr && <span>截止：{deadlineStr}</span>}
        </div>
        {assignment.notes && (
          <div className="text-xs text-muted-foreground">{assignment.notes}</div>
        )}
      </div>
      {isAdmin && assignment.status !== "cancelled" && assignment.status !== "completed" && (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="取消指派"
          onClick={() => onCancel(assignment.id)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
