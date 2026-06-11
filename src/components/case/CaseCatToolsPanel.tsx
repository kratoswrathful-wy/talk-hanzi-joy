import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

type LinkedFileRow = {
  id: string;
  name: string;
  project_id: string;
  source_lang: string;
  target_lang: string;
  related_lms_case_id: string | null;
  related_lms_case_title: string | null;
  project: { id: string; name: string } | null;
};

type CatProject = { id: string; name: string };
type CatFileOption = {
  id: string;
  name: string;
  related_lms_case_id: string | null;
  related_lms_case_title: string | null;
};

function buildCatDeepLink(fileId: string, projectId: string) {
  return `/cat/team/files/${encodeURIComponent(fileId)}?p=${encodeURIComponent(projectId)}`;
}

export interface CaseCatToolsPanelProps {
  caseId: string;
  caseTitle: string;
  isPmOrAbove: boolean;
  /** PM：由父層「1UP CAT」按鈕控制；譯者傳 true，由元件依連結數決定是否顯示 */
  visible: boolean;
}

export function CaseCatToolsPanel({
  caseId,
  caseTitle,
  isPmOrAbove,
  visible,
}: CaseCatToolsPanelProps) {
  const [linkedFiles, setLinkedFiles] = useState<LinkedFileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<CatProject[]>([]);
  const [projectFiles, setProjectFiles] = useState<CatFileOption[]>([]);
  const [addProjectId, setAddProjectId] = useState("");
  const [addFileId, setAddFileId] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editProjectId, setEditProjectId] = useState("");
  const [editFileId, setEditFileId] = useState("");
  const [editFiles, setEditFiles] = useState<CatFileOption[]>([]);
  const [relinkConfirm, setRelinkConfirm] = useState<{
    fileId: string;
    fileName: string;
    otherCaseTitle: string;
    mode: "add" | "edit";
  } | null>(null);

  const loadLinkedFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cat_files")
        .select(
          "id, name, project_id, source_lang, target_lang, related_lms_case_id, related_lms_case_title, project:cat_projects(id, name)"
        )
        .eq("related_lms_case_id", caseId)
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as unknown as LinkedFileRow[];
      const byId = new Map<string, LinkedFileRow>();
      rows.forEach((r) => byId.set(r.id, r));
      setLinkedFiles([...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-TW")));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "無法載入 CAT 連結", description: msg, variant: "destructive" });
      setLinkedFiles([]);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const loadProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from("cat_projects")
      .select("id, name")
      .order("name");
    if (error) {
      toast({ title: "無法載入 CAT 專案", description: error.message, variant: "destructive" });
      return;
    }
    setProjects((data ?? []) as CatProject[]);
  }, []);

  const loadFilesForProject = useCallback(async (projectId: string): Promise<CatFileOption[]> => {
    if (!projectId) return [];
    const { data, error } = await supabase
      .from("cat_files")
      .select("id, name, related_lms_case_id, related_lms_case_title")
      .eq("project_id", projectId)
      .order("name");
    if (error) {
      toast({ title: "無法載入檔案清單", description: error.message, variant: "destructive" });
      return [];
    }
    return (data ?? []) as unknown as CatFileOption[];
  }, []);

  useEffect(() => {
    if (!caseId) return;
    void loadLinkedFiles();
  }, [caseId, loadLinkedFiles]);

  useEffect(() => {
    if (!caseId) return;
    const channel = supabase
      .channel(`case-cat-files-${caseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cat_files",
          filter: `related_lms_case_id=eq.${caseId}`,
        },
        () => {
          void loadLinkedFiles();
        }
      )
      .subscribe();
    const onFocus = () => void loadLinkedFiles();
    window.addEventListener("focus", onFocus);
    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [caseId, loadLinkedFiles]);

  useEffect(() => {
    if (!isPmOrAbove || !visible) return;
    void loadProjects();
  }, [isPmOrAbove, visible, loadProjects]);

  useEffect(() => {
    if (!addProjectId) {
      setProjectFiles([]);
      setAddFileId("");
      return;
    }
    void loadFilesForProject(addProjectId).then(setProjectFiles);
  }, [addProjectId, loadFilesForProject]);

  useEffect(() => {
    if (!editProjectId) {
      setEditFiles([]);
      setEditFileId("");
      return;
    }
    void loadFilesForProject(editProjectId).then(setEditFiles);
  }, [editProjectId, loadFilesForProject]);

  const applyLink = async (fileId: string, unlinkOldId?: string | null) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("cat_files")
      .update({
        related_lms_case_id: caseId,
        related_lms_case_title: caseTitle,
        last_modified: now,
      })
      .eq("id", fileId);
    if (error) throw error;
    if (unlinkOldId && unlinkOldId !== fileId) {
      await supabase
        .from("cat_files")
        .update({
          related_lms_case_id: null,
          related_lms_case_title: "",
          last_modified: now,
        })
        .eq("id", unlinkOldId);
    }
  };

  const handleRemoveLink = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from("cat_files")
        .update({
          related_lms_case_id: null,
          related_lms_case_title: "",
          last_modified: new Date().toISOString(),
        })
        .eq("id", fileId);
      if (error) throw error;
      toast({ title: "已移除連結" });
      if (editingFileId === fileId) setEditingFileId(null);
      await loadLinkedFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "移除失敗", description: msg, variant: "destructive" });
    }
  };

  const tryLinkFile = async (
    fileId: string,
    fileList: CatFileOption[],
    mode: "add" | "edit",
    unlinkOldId?: string | null
  ) => {
    const file = fileList.find((f) => f.id === fileId);
    if (!file) return;
    if (
      file.related_lms_case_id &&
      file.related_lms_case_id !== caseId
    ) {
      setRelinkConfirm({
        fileId,
        fileName: file.name,
        otherCaseTitle: file.related_lms_case_title || "其他案件",
        mode,
      });
      return;
    }
    setAdding(true);
    try {
      await applyLink(fileId, mode === "edit" ? unlinkOldId : undefined);
      toast({ title: mode === "edit" ? "已變更連結" : "已新增連結" });
      setAddProjectId("");
      setAddFileId("");
      setEditingFileId(null);
      await loadLinkedFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "連結失敗", description: msg, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const confirmRelink = async () => {
    if (!relinkConfirm) return;
    const { fileId, mode } = relinkConfirm;
    const unlinkOldId = mode === "edit" ? editingFileId : undefined;
    setRelinkConfirm(null);
    setAdding(true);
    try {
      await applyLink(fileId, unlinkOldId ?? undefined);
      toast({ title: mode === "edit" ? "已變更連結" : "已新增連結" });
      setAddProjectId("");
      setAddFileId("");
      setEditingFileId(null);
      await loadLinkedFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "連結失敗", description: msg, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (row: LinkedFileRow) => {
    setEditingFileId(row.id);
    setEditProjectId(row.project_id);
    setEditFileId(row.id);
    void loadFilesForProject(row.project_id).then(setEditFiles);
  };

  if (isPmOrAbove && !visible) return null;
  if (!isPmOrAbove && (loading || linkedFiles.length === 0)) return null;

  return (
    <>
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">1UP CAT</h3>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {isPmOrAbove ? (
          <>
            {linkedFiles.length === 0 && !loading ? (
              <p className="text-xs text-muted-foreground">尚未連結 CAT 作業檔。請在下方選擇專案與檔案新增。</p>
            ) : (
              <ul className="space-y-2">
                {linkedFiles.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {editingFileId === row.id ? (
                      <div className="flex flex-wrap items-end gap-2 w-full">
                        <div className="space-y-1 min-w-[140px] flex-1">
                          <Label className="text-xs">專案</Label>
                          <Select value={editProjectId} onValueChange={setEditProjectId}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="選擇專案" />
                            </SelectTrigger>
                            <SelectContent>
                              {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 min-w-[140px] flex-1">
                          <Label className="text-xs">檔案</Label>
                          <Select value={editFileId} onValueChange={setEditFileId}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="選擇檔案" />
                            </SelectTrigger>
                            <SelectContent>
                              {editFiles.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          disabled={!editFileId || adding}
                          onClick={() => void tryLinkFile(editFileId, editFiles, "edit", row.id)}
                        >
                          確定
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => setEditingFileId(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium truncate max-w-[200px]" title={row.name}>
                          {row.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.project?.name ?? "—"} · {row.source_lang} → {row.target_lang}
                        </span>
                        <div className="flex items-center gap-1 ml-auto">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                            <Link to={buildCatDeepLink(row.id, row.project_id)} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                              在 CAT 開啟
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => startEdit(row)}
                          >
                            <Pencil className="h-3 w-3" />
                            變更
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => void handleRemoveLink(row.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            移除
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground">新增連結</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1 min-w-[140px] flex-1">
                  <Label className="text-xs">CAT 專案</Label>
                  <Select value={addProjectId} onValueChange={setAddProjectId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="選擇專案" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-[140px] flex-1">
                  <Label className="text-xs">作業檔</Label>
                  <Select value={addFileId} onValueChange={setAddFileId} disabled={!addProjectId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={addProjectId ? "選擇檔案" : "請先選專案"} />
                    </SelectTrigger>
                    <SelectContent>
                      {projectFiles.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={!addProjectId || !addFileId || adding}
                  onClick={() => void tryLinkFile(addFileId, projectFiles, "add")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增
                </Button>
              </div>
            </div>
          </>
        ) : (
          <ul className="space-y-1">
            {linkedFiles.map((row) => (
              <li key={row.id}>
                <Link
                  to={buildCatDeepLink(row.id, row.project_id)}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  {row.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={!!relinkConfirm} onOpenChange={(o) => !o && setRelinkConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>改連結至本案？</AlertDialogTitle>
            <AlertDialogDescription>
              「{relinkConfirm?.fileName}」目前連結至「{relinkConfirm?.otherCaseTitle}」。改連結後將改為本案。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRelink()}>改連結</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
