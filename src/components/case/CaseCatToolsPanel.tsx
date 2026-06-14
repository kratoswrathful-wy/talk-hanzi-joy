import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import {
  syncCatWorkflowAssignmentsForCase,
  broadcastCatWorkflowAssignmentsSynced,
} from "@/lib/cat-workflow-dispatch";
import { buildCatDeepLink, buildCatProjectLink } from "@/lib/cat-deep-link";
import {
  CatProjectFilePickerModal,
  type CatFileOption,
} from "@/components/case/CatProjectFilePickerModal";

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

function ProjectLangLine({ row }: { row: LinkedFileRow }) {
  const projectName = row.project?.name ?? "—";
  return (
    <span className="text-xs text-muted-foreground flex-1 min-w-0">
      <Link
        to={buildCatProjectLink(row.project_id)}
        className="text-primary hover:underline"
        title={projectName}
      >
        {projectName}
      </Link>
      {" · "}
      {row.source_lang} → {row.target_lang}
    </span>
  );
}

function ProjectLangLineTranslator({ row }: { row: LinkedFileRow }) {
  const projectName = row.project?.name ?? "—";
  return (
    <span className="text-xs text-muted-foreground block">
      <Link
        to={buildCatProjectLink(row.project_id)}
        className="text-primary hover:underline"
        title={projectName}
      >
        {projectName}
      </Link>
      {" · "}
      {row.source_lang} → {row.target_lang}
    </span>
  );
}

function BlankStateRow() {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span className="text-xs text-muted-foreground">待指定</span>
    </div>
  );
}

export interface CaseCatToolsPanelProps {
  caseId: string;
  caseTitle: string;
  isPmOrAbove: boolean;
  canRemoveCatTool: boolean;
  onRemoveCatTool: () => void | Promise<void>;
}

export function CaseCatToolsPanel({
  caseId,
  caseTitle,
  isPmOrAbove,
  canRemoveCatTool,
  onRemoveCatTool,
}: CaseCatToolsPanelProps) {
  const [linkedFiles, setLinkedFiles] = useState<LinkedFileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"add" | "edit">("add");
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [pickerInitialProjectId, setPickerInitialProjectId] = useState("");
  const [pickerInitialFileId, setPickerInitialFileId] = useState("");
  const [removeCatOpen, setRemoveCatOpen] = useState(false);
  const [relinkConfirm, setRelinkConfirm] = useState<{
    fileId: string;
    fileName: string;
    otherCaseTitle: string;
    unlinkOldId?: string | null;
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
    await syncCatWorkflowAssignmentsForCase(supabase, caseId);
    broadcastCatWorkflowAssignmentsSynced(caseId);
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
      await loadLinkedFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "移除失敗", description: msg, variant: "destructive" });
    }
  };

  const handleRemoveCatTool = async () => {
    setRemoveCatOpen(false);
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { error: unlinkError } = await supabase
        .from("cat_files")
        .update({
          related_lms_case_id: null,
          related_lms_case_title: "",
          last_modified: now,
        })
        .eq("related_lms_case_id", caseId);
      if (unlinkError) throw unlinkError;
      await onRemoveCatTool();
      toast({ title: "已移除 1UP CAT" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "移除失敗", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const tryLinkFile = async (
    file: CatFileOption,
    unlinkOldId?: string | null
  ) => {
    if (file.related_lms_case_id && file.related_lms_case_id !== caseId) {
      setRelinkConfirm({
        fileId: file.id,
        fileName: file.name,
        otherCaseTitle: file.related_lms_case_title || "其他案件",
        unlinkOldId,
      });
      return;
    }
    setBusy(true);
    try {
      await applyLink(file.id, unlinkOldId);
      toast({ title: unlinkOldId ? "已變更連結" : "已新增連結" });
      await loadLinkedFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "連結失敗", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const confirmRelink = async () => {
    if (!relinkConfirm) return;
    const { fileId, unlinkOldId } = relinkConfirm;
    setRelinkConfirm(null);
    setBusy(true);
    try {
      await applyLink(fileId, unlinkOldId ?? undefined);
      toast({ title: unlinkOldId ? "已變更連結" : "已新增連結" });
      await loadLinkedFiles();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "連結失敗", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const openAddPicker = () => {
    setPickerMode("add");
    setEditRowId(null);
    setPickerInitialProjectId("");
    setPickerInitialFileId("");
    setPickerOpen(true);
  };

  const openEditPicker = (row: LinkedFileRow) => {
    setPickerMode("edit");
    setEditRowId(row.id);
    setPickerInitialProjectId(row.project_id);
    setPickerInitialFileId(row.id);
    setPickerOpen(true);
  };

  const handlePickerConfirm = (selection: {
    projectId: string;
    fileId: string;
    file: CatFileOption;
  }) => {
    const unlinkOldId = pickerMode === "edit" ? editRowId : undefined;
    void tryLinkFile(selection.file, unlinkOldId);
  };

  const hasLinks = linkedFiles.length > 0;

  return (
    <>
      <div className="relative rounded-lg border border-border bg-muted/30 p-4 space-y-3 mb-3">
        {isPmOrAbove && canRemoveCatTool && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={() => setRemoveCatOpen(true)}
            aria-label="移除 1UP CAT"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        <div className="flex items-center gap-2 pr-8">
          <h3 className="text-sm font-semibold">1UP CAT</h3>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {isPmOrAbove ? (
          <>
            {!hasLinks && !loading ? (
              <BlankStateRow />
            ) : (
              <ul className="space-y-2">
                {linkedFiles.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ProjectLangLine row={row} />
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={busy}
                          onClick={() => openEditPicker(row)}
                        >
                          <Pencil className="h-3 w-3" />
                          變更
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={() => void handleRemoveLink(row.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          移除
                        </Button>
                      </div>
                    </div>
                    <Link
                      to={buildCatDeepLink(row.id, row.project_id)}
                      className="block text-sm text-primary hover:underline truncate"
                      title={row.name}
                    >
                      {row.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={busy}
                onClick={openAddPicker}
              >
                <Plus className="h-3.5 w-3.5" />
                新增連結
              </Button>
            </div>
          </>
        ) : (
          <>
            {!hasLinks && !loading ? (
              <BlankStateRow />
            ) : (
              <ul className="space-y-2">
                {linkedFiles.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm space-y-1"
                  >
                    <ProjectLangLineTranslator row={row} />
                    <Link
                      to={buildCatDeepLink(row.id, row.project_id)}
                      className="block text-sm text-primary hover:underline truncate"
                      title={row.name}
                    >
                      {row.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {isPmOrAbove && (
        <CatProjectFilePickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={pickerMode === "edit" ? "變更 CAT 連結" : "新增 CAT 連結"}
          confirmLabel={pickerMode === "edit" ? "變更" : "新增"}
          initialProjectId={pickerInitialProjectId}
          initialFileId={pickerInitialFileId}
          onConfirm={handlePickerConfirm}
        />
      )}

      <AlertDialog open={removeCatOpen} onOpenChange={setRemoveCatOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除 1UP CAT？</AlertDialogTitle>
            <AlertDialogDescription>
              將關閉本案的 1UP CAT 工具，並解除所有已連結的 CAT 作業檔。其他執行工具不受影響。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemoveCatTool()}>移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
