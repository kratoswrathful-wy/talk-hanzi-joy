import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ColorSelect from "@/components/ColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Calendar, Copy, Check, Users, ExternalLink } from "lucide-react";
import type { CollabRow } from "@/data/case-types";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { buildCatDeepLink } from "@/lib/cat-deep-link";

interface Props {
  rows: CollabRow[];
  onChange: (rows: CollabRow[]) => void;
  caseStatus: string;
  caseId?: string;
}

type CatBindOption = {
  kind: "file" | "view";
  id: string;
  label: string;
  projectId?: string;
  linkFileId?: string;
};

function encodeCatBind(row: CollabRow): string {
  if (row.linkedCatViewId) return `view:${row.linkedCatViewId}`;
  if (row.linkedCatFileId) return `file:${row.linkedCatFileId}`;
  return "";
}

function decodeCatBind(value: string): Pick<CollabRow, "linkedCatFileId" | "linkedCatViewId"> {
  if (!value) return { linkedCatFileId: null, linkedCatViewId: null };
  const [kind, id] = value.split(":");
  if (kind === "view" && id) return { linkedCatFileId: null, linkedCatViewId: id };
  if (kind === "file" && id) return { linkedCatFileId: id, linkedCatViewId: null };
  return { linkedCatFileId: null, linkedCatViewId: null };
}

function isCatBound(row: CollabRow): boolean {
  return !!(row.linkedCatFileId || row.linkedCatViewId);
}

function CopyTextButton({ value }: { value: string }) {
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
      className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
      onClick={handleCopy}
      title="複製到剪貼簿"
      type="button"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function CollaborationTable({ rows, onChange, caseStatus, caseId }: Props) {
  const { primaryRole, profile } = useAuth();
  const isPmOrAbove = primaryRole === "pm" || primaryRole === "executive";
  const displayName = profile?.display_name || "";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [catBindOptions, setCatBindOptions] = useState<CatBindOption[]>([]);

  useEffect(() => {
    if (!caseId) {
      setCatBindOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: files } = await supabase
        .from("cat_files")
        .select("id, name, project_id")
        .eq("related_lms_case_id", caseId);
      const fileRows = files ?? [];
      const projectIds = [...new Set(fileRows.map((f) => f.project_id).filter(Boolean))];
      const options: CatBindOption[] = fileRows.map((f) => ({
        kind: "file",
        id: f.id,
        label: f.name,
        projectId: f.project_id ?? undefined,
        linkFileId: f.id,
      }));
      if (projectIds.length) {
        const { data: views } = await (supabase as any)
          .from("cat_views")
          .select("id, name, project_id, file_ids")
          .in("project_id", projectIds);
        ((views ?? []) as { id: string; name: string; project_id: string; file_ids?: string[] }[]).forEach((v) => {
          const firstFileId = Array.isArray(v.file_ids) && v.file_ids.length ? v.file_ids[0] : undefined;
          options.push({
            kind: "view",
            id: v.id,
            label: v.name,
            projectId: v.project_id,
            linkFileId: firstFileId,
          });
        });
      }
      if (!cancelled) setCatBindOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const canEditBindFields = isPmOrAbove;

  const [bulkDeadlineField, setBulkDeadlineField] = useState<"translationDeadline" | "reviewDeadline" | null>(null);
  const [bulkDeadlineValue, setBulkDeadlineValue] = useState<string | null>(null);
  const [bulkPersonField, setBulkPersonField] = useState<"translator" | "reviewer" | null>(null);
  const [bulkPersonValue, setBulkPersonValue] = useState<string>("");
  const [lastAcceptConfirm, setLastAcceptConfirm] = useState<{ idx: number } | null>(null);

  const updateRow = useCallback(
    (idx: number, patch: Partial<CollabRow>) => {
      const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      onChange(next);
    },
    [rows, onChange]
  );

  const showAccepted = caseStatus === "draft" || caseStatus === "inquiry";
  const showTaskCompleted = !showAccepted;

  const columns = [
    { key: "segment", label: "檔案或分段", width: "260px" },
    { key: "translator", label: "譯者", width: "140px", bulkPerson: true },
    { key: "unitCount", label: "計費單位數", width: "90px" },
    { key: "translationDeadline", label: "翻譯交期", width: "180px", bulk: true },
    { key: showAccepted ? "accepted" : "taskCompleted", label: showAccepted ? "確認承接" : "任務完成", width: "80px" },
    { key: "reviewer", label: "審稿人員", width: "140px", bulkPerson: true },
    { key: "reviewDeadline", label: "審稿交期", width: "180px", bulk: true },
    { key: "delivered", label: "交件完畢", width: "80px" },
  ];

  const gridTemplate = columns.map((c) => c.width).join(" ");

  const scrollToEnd = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ left: dir === "left" ? 0 : scrollRef.current.scrollWidth, behavior: "smooth" });
  };

  const applyBulkDeadline = () => {
    if (!bulkDeadlineField || !bulkDeadlineValue) return;
    const next = rows.map((r) => ({ ...r, [bulkDeadlineField]: bulkDeadlineValue }));
    onChange(next);
    setBulkDeadlineField(null);
    setBulkDeadlineValue(null);
  };

  const applyBulkPerson = () => {
    if (!bulkPersonField) return;
    const next = rows.map((r) => ({ ...r, [bulkPersonField]: bulkPersonValue }));
    onChange(next);
    setBulkPersonField(null);
    setBulkPersonValue("");
  };

  const resolveCatLink = (row: CollabRow): string | null => {
    if (row.linkedCatFileId) {
      const opt = catBindOptions.find((o) => o.kind === "file" && o.id === row.linkedCatFileId);
      if (opt?.projectId && opt.linkFileId) {
        return buildCatDeepLink(opt.linkFileId, opt.projectId);
      }
    }
    if (row.linkedCatViewId) {
      const opt = catBindOptions.find((o) => o.kind === "view" && o.id === row.linkedCatViewId);
      if (opt?.projectId && opt.linkFileId) {
        return buildCatDeepLink(opt.linkFileId, opt.projectId);
      }
    }
    return null;
  };

  return (
    <div className="space-y-0">
      <div ref={scrollRef} className="border border-border rounded-lg overflow-x-auto">
        <div
          className="grid items-center gap-0 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground min-w-max"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {columns.map((col) => (
            <div key={col.key} className="px-2 py-2 text-center whitespace-nowrap flex items-center justify-center gap-1">
              {col.label}
              {(col as { bulk?: boolean }).bulk && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setBulkDeadlineField(col.key as "translationDeadline" | "reviewDeadline");
                          setBulkDeadlineValue(null);
                        }}
                      >
                        <Calendar className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>一次套用到所有列</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {(col as { bulkPerson?: boolean }).bulkPerson && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setBulkPersonField(col.key as "translator" | "reviewer");
                          setBulkPersonValue("");
                        }}
                      >
                        <Users className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>一次套用到所有列</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ))}
        </div>

        {rows.map((row, idx) => {
          const acceptedDisabled = showAccepted
            ? (row.accepted
                ? !(isPmOrAbove || row.translator === displayName)
                : false)
            : false;

          const canCheckTaskCompleted =
            showTaskCompleted &&
            !row.taskCompleted &&
            (isPmOrAbove || row.translator === displayName);

          const deliveredLocked = caseStatus === "delivered" || caseStatus === "feedback" || caseStatus === "feedback_completed";
          const canCheckDelivered = isPmOrAbove && !row.delivered && !deliveredLocked;

          const catBound = isCatBound(row);
          const catLink = catBound ? resolveCatLink(row) : null;

          return (
            <div
              key={row.id}
              className="grid items-center gap-0 border-b border-border last:border-b-0 text-sm min-w-max"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="px-1.5 py-1 flex flex-col gap-1">
                {caseId && catBindOptions.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Select
                      value={encodeCatBind(row) || "__none__"}
                      onValueChange={(v) => {
                        const bind = decodeCatBind(v === "__none__" ? "" : v);
                        updateRow(idx, bind);
                      }}
                      disabled={!canEditBindFields}
                    >
                      <SelectTrigger className="h-7 text-[10px] px-1.5 flex-1 min-w-0">
                        <SelectValue placeholder="派工方式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">不使用 1UP CAT</SelectItem>
                        {catBindOptions.map((o) => (
                          <SelectItem key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {catLink && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0" asChild>
                              <Link to={catLink} title="開啟 CAT">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>開啟 CAT（同分頁）</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}

                {catBound ? (
                  <Input
                    value={row.lineRange || ""}
                    onChange={(e) => updateRow(idx, { lineRange: e.target.value || null })}
                    placeholder="列範圍（例 10-50、344-；留白＝整檔）"
                    className="h-6 text-[10px] px-1.5"
                    disabled={!canEditBindFields}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      <Input
                        value={row.segment}
                        onChange={(e) => updateRow(idx, { segment: e.target.value })}
                        placeholder="分段說明"
                        className="h-6 text-[10px] px-1.5 flex-1 min-w-0"
                        disabled={!canEditBindFields}
                      />
                      <CopyTextButton value={row.segment} />
                    </div>
                    <Input
                      value={row.lineRange || ""}
                      onChange={(e) => updateRow(idx, { lineRange: e.target.value || null })}
                      placeholder="列範圍（例 10-50、344-；留白＝整檔）"
                      className="h-6 text-[10px] px-1.5"
                      disabled={!canEditBindFields}
                    />
                  </>
                )}
              </div>

              <div className="px-1.5 py-1">
                <ColorSelect
                  fieldKey="assignee"
                  value={row.translator}
                  onValueChange={(v) => updateRow(idx, { translator: v })}
                  className="w-full"
                  disabled={!isPmOrAbove && row.accepted}
                />
              </div>

              <div className="px-1.5 py-1">
                <Input
                  type="number"
                  value={row.unitCount || ""}
                  onChange={(e) => updateRow(idx, { unitCount: Number(e.target.value) || 0 })}
                  className="h-7 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="px-1.5 py-1">
                <DateTimePicker
                  value={row.translationDeadline}
                  onChange={(v) => updateRow(idx, { translationDeadline: v })}
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-center px-1.5 py-1">
                {showAccepted ? (
                  <Checkbox
                    checked={!!row.accepted}
                    disabled={acceptedDisabled}
                    onCheckedChange={(v) => {
                      if (!!v) {
                        const uncheckedCount = rows.filter((r, ri) => !r.accepted && ri !== idx).length;
                        if (uncheckedCount === 0) {
                          setLastAcceptConfirm({ idx });
                          return;
                        }
                        const translatorEmpty = !row.translator || !row.translator.trim();
                        if (translatorEmpty && displayName) {
                          updateRow(idx, { accepted: true, translator: displayName });
                        } else {
                          updateRow(idx, { accepted: true });
                        }
                      } else {
                        updateRow(idx, { accepted: false, translator: "" });
                      }
                    }}
                  />
                ) : (
                  <Checkbox
                    checked={row.taskCompleted}
                    disabled={!canCheckTaskCompleted && !row.taskCompleted}
                    onCheckedChange={(v) => updateRow(idx, { taskCompleted: !!v })}
                  />
                )}
              </div>

              <div className="px-1.5 py-1">
                <ColorSelect
                  fieldKey="assignee"
                  value={row.reviewer}
                  onValueChange={(v) => updateRow(idx, { reviewer: v })}
                  className="w-full"
                  disabled={!isPmOrAbove}
                />
              </div>

              <div className="px-1.5 py-1">
                <DateTimePicker
                  value={row.reviewDeadline}
                  onChange={(v) => updateRow(idx, { reviewDeadline: v })}
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-center px-1.5 py-1">
                <Checkbox
                  checked={row.delivered}
                  disabled={!canCheckDelivered && !row.delivered}
                  onCheckedChange={(v) => updateRow(idx, { delivered: !!v })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1 justify-end mt-1">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => scrollToEnd("left")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => scrollToEnd("right")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={!!bulkDeadlineField} onOpenChange={(open) => { if (!open) { setBulkDeadlineField(null); setBulkDeadlineValue(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeadlineField === "translationDeadline" ? "批次設定翻譯交期" : "批次設定審稿交期"}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <DateTimePicker
            value={bulkDeadlineValue}
            onChange={(v) => setBulkDeadlineValue(v)}
            className="w-full"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={applyBulkDeadline} disabled={!bulkDeadlineValue}>套用到所有列</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkPersonField} onOpenChange={(open) => { if (!open) { setBulkPersonField(null); setBulkPersonValue(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkPersonField === "translator" ? "批次設定譯者" : "批次設定審稿人員"}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <ColorSelect
            fieldKey="assignee"
            value={bulkPersonValue}
            onValueChange={(v) => setBulkPersonValue(v)}
            className="w-full"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={applyBulkPerson}>套用到所有列</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!lastAcceptConfirm} onOpenChange={(open) => { if (!open) setLastAcceptConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認承接最後一個分段</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            您即將勾選最後一個「確認承接」方塊，此操作會將案件狀態推進至「已派出」。確定要繼續嗎？
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (lastAcceptConfirm) {
                const row = rows[lastAcceptConfirm.idx];
                const translatorEmpty = !row.translator || !row.translator.trim();
                if (translatorEmpty && displayName) {
                  updateRow(lastAcceptConfirm.idx, { accepted: true, translator: displayName });
                } else {
                  updateRow(lastAcceptConfirm.idx, { accepted: true });
                }
              }
              setLastAcceptConfirm(null);
            }}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
