import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export type CatFileOption = {
  id: string;
  name: string;
  related_lms_case_id: string | null;
  related_lms_case_title: string | null;
};

type CatProject = { id: string; name: string };

export interface CatProjectFilePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  confirmLabel?: string;
  initialProjectId?: string;
  initialFileId?: string;
  onConfirm: (selection: {
    projectId: string;
    projectName: string;
    fileId: string;
    file: CatFileOption;
  }) => void;
}

export function CatProjectFilePickerModal({
  open,
  onOpenChange,
  title = "選擇 CAT 專案與作業檔",
  confirmLabel = "確定",
  initialProjectId = "",
  initialFileId = "",
  onConfirm,
}: CatProjectFilePickerModalProps) {
  const [projects, setProjects] = useState<CatProject[]>([]);
  const [files, setFiles] = useState<CatFileOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase.from("cat_projects").select("id, name").eq("env", getEnvironment()).order("name");
      if (error) throw error;
      setProjects((data ?? []) as CatProject[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "無法載入 CAT 專案", description: msg, variant: "destructive" });
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadFiles = useCallback(async (projectId: string) => {
    if (!projectId) {
      setFiles([]);
      return;
    }
    setLoadingFiles(true);
    try {
      // cat_files.env 為新欄位（尚未進 generated types），用 as any 避免型別過深推導。
      const { data, error } = await (supabase as any)
        .from("cat_files")
        .select("id, name, related_lms_case_id, related_lms_case_title")
        .eq("project_id", projectId)
        .eq("env", getEnvironment())
        .order("name");
      if (error) throw error;
      setFiles((data ?? []) as unknown as CatFileOption[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "無法載入檔案清單", description: msg, variant: "destructive" });
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setProjectQuery("");
    setFileQuery("");
    setSelectedProjectId(initialProjectId);
    setSelectedFileId(initialFileId);
    void loadProjects();
    if (initialProjectId) void loadFiles(initialProjectId);
    else setFiles([]);
  }, [open, initialProjectId, initialFileId, loadProjects, loadFiles]);

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectQuery]);

  const filteredFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, fileQuery]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedFile = files.find((f) => f.id === selectedFileId);

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFileId("");
    setFileQuery("");
    void loadFiles(projectId);
  };

  const handleConfirm = () => {
    if (!selectedProjectId || !selectedFileId || !selectedProject || !selectedFile) return;
    onConfirm({
      projectId: selectedProjectId,
      projectName: selectedProject.name,
      fileId: selectedFileId,
      file: selectedFile,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 min-h-0 flex-1 overflow-hidden flex flex-col">
          <Label className="text-xs text-muted-foreground">CAT 專案</Label>
          <Input
            className="form-input h-8 text-sm"
            placeholder="輸入名稱篩選…"
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
          />
          <div className="border border-border rounded-md overflow-y-auto max-h-36">
            {loadingProjects ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">查無專案</p>
            ) : (
              <ul>
                {filteredProjects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted/60",
                        selectedProjectId === p.id && "bg-muted font-medium"
                      )}
                      onClick={() => handleSelectProject(p.id)}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selectedProjectId ? (
          <div className="space-y-2 min-h-0 flex flex-col">
            <Label className="text-xs text-muted-foreground">作業檔</Label>
            <Input
              className="form-input h-8 text-sm"
              placeholder="輸入檔名篩選…"
              value={fileQuery}
              onChange={(e) => setFileQuery(e.target.value)}
            />
            <div className="border border-border rounded-md overflow-y-auto max-h-40">
              {loadingFiles ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : filteredFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">查無檔案</p>
              ) : (
                <ul>
                  {filteredFiles.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-muted/60 truncate",
                          selectedFileId === f.id && "bg-muted font-medium"
                        )}
                        title={f.name}
                        onClick={() => setSelectedFileId(f.id)}
                      >
                        {f.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">請先選擇專案</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!selectedProjectId || !selectedFileId}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
