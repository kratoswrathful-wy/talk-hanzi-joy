import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { messageFromFunctionsInvokeErrorAsync } from "@/lib/functions-invoke-error";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-access-token";
import type { CaseRecord } from "@/data/case-types";
import {
  buildInquiryMessagePlainText,
  buildInquiryMessageForSlack,
  buildInquirySlackNotificationFallback,
} from "@/lib/inquiry-slack-message";
import { getTimezoneInfo } from "@/data/timezone-options";
import { getEnvironment } from "@/lib/environment";
import {
  buildWorkloadCountByDisplayName,
  type CaseRowForWorkload,
} from "@/lib/inquiry-slack-workload";
import { Link } from "react-router-dom";

export type RecipientRow = {
  userId: string;
  /** Trimmed profile display_name; used to match cases.translator / reviewer */
  profileDisplayNameTrimmed: string;
  displayName: string;
  email: string | null;
  timezone: string | null;
  statusMessage: string | null;
};

type SortMode = "name" | "workload";
type SortDir = "asc" | "desc";

export function InquirySlackDialog({
  open,
  onOpenChange,
  cases,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cases: CaseRecord[];
}) {
  const { user, isAdmin } = useAuth();
  const [slackConnected, setSlackConnected] = useState<boolean | null>(null);
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [workloadByName, setWorkloadByName] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [hideSelf, setHideSelf] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("workload");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const messagePreview = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildInquiryMessagePlainText(origin, cases);
  }, [cases]);

  const slackMessagePayload = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return {
      message: buildInquiryMessageForSlack(origin, cases),
      notification_fallback: buildInquirySlackNotificationFallback(cases),
    };
  }, [cases]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setHideSelf(true);
    setSortMode("workload");
    setSortDir("desc");
  }, [open]);

  useEffect(() => {
    if (!open || !user?.id) return;

    void (async () => {
      const { data } = await supabase.from("user_slack_meta").select("user_id").eq("user_id", user.id).maybeSingle();
      setSlackConnected(!!data);
    })();
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setSelectedEmails(new Set());

    void (async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffIso = cutoff.toISOString();
      const env = getEnvironment();

      const [{ data: roleRows, error: roleErr }, casesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id"),
        supabase
          .from("cases")
          .select("translator, reviewer, collab_rows, updated_at")
          .eq("env", env)
          .gte("updated_at", cutoffIso),
      ]);

      if (cancelled) return;

      if (casesRes.error) {
        console.error(casesRes.error);
      }
      const wMap = buildWorkloadCountByDisplayName((casesRes.data || []) as CaseRowForWorkload[]);
      setWorkloadByName(wMap);

      if (roleErr) {
        console.error(roleErr);
        setLoading(false);
        toast.error("無法載入成員身分");
        setRows([]);
        return;
      }

      const userIds = [...new Set((roleRows || []).map((r) => r.user_id))];
      if (userIds.length === 0) {
        setLoading(false);
        setRows([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, timezone, status_message")
        .in("id", userIds)
        .order("display_name", { ascending: true });

      if (cancelled) return;
      setLoading(false);

      if (error) {
        console.error(error);
        toast.error("無法載入成員資料");
        setRows([]);
        return;
      }

      const nextRows: RecipientRow[] = (data || []).map((p) => {
        const profileDisplayNameTrimmed = (p.display_name || "").trim();
        return {
          userId: p.id,
          profileDisplayNameTrimmed,
          displayName: profileDisplayNameTrimmed || p.email || "（無名稱）",
          email: p.email ?? null,
          timezone: p.timezone ?? null,
          statusMessage: p.status_message ?? null,
        };
      });
      setRows(nextRows);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const rowsWithWorkload = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        workload30: workloadByName.get(r.profileDisplayNameTrimmed) ?? 0,
      })),
    [rows, workloadByName]
  );

  const afterHideSelf = useMemo(() => {
    if (hideSelf && user?.id) {
      return rowsWithWorkload.filter((r) => r.userId !== user.id);
    }
    return rowsWithWorkload;
  }, [rowsWithWorkload, hideSelf, user?.id]);

  const afterSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return afterHideSelf;
    return afterHideSelf.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false)
    );
  }, [afterHideSelf, searchQuery]);

  const visibleRows = useMemo(() => {
    const copy = [...afterSearch];
    copy.sort((a, b) => {
      if (sortMode === "name") {
        const cmp = a.displayName.localeCompare(b.displayName, "zh-Hant");
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = a.workload30 - b.workload30;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [afterSearch, sortMode, sortDir]);

  const selectableInView = useMemo(
    () => visibleRows.filter((r): r is (typeof r & { email: string }) => !!r.email),
    [visibleRows]
  );

  const allVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return false;
    return selectableInView.every((r) => selectedEmails.has(r.email));
  }, [selectableInView, selectedEmails]);

  const noVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return true;
    return selectableInView.every((r) => !selectedEmails.has(r.email));
  }, [selectableInView, selectedEmails]);

  const someVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return false;
    const any = selectableInView.some((r) => selectedEmails.has(r.email));
    const all = selectableInView.every((r) => selectedEmails.has(r.email));
    return any && !all;
  }, [selectableInView, selectedEmails]);

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const n = new Set(prev);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  };

  const handleSend = async () => {
    if (!slackConnected) {
      toast.error("請先到「設定」連結 Slack");
      return;
    }
    const emails = [...selectedEmails];
    if (emails.length === 0) {
      toast.error("請至少選擇一位有電子信箱的成員");
      return;
    }

    setSending(true);
    try {
      const token = await getAccessTokenForEdgeFunctions();
      if (!token) {
        toast.error("請重新登入後再試");
        return;
      }
      const { data, error } = await supabase.functions.invoke("slack-send-dm", {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          recipient_emails: emails,
          message: slackMessagePayload.message,
          notification_fallback: slackMessagePayload.notification_fallback,
        },
      });
      if (error) {
        toast.error(await messageFromFunctionsInvokeErrorAsync(error, data));
        return;
      }
      const payload = data as { ok?: boolean; results?: { email: string; ok: boolean; error?: string }[] };
      const failed = payload?.results?.filter((r) => !r.ok) || [];
      if (failed.length === 0) {
        toast.success("已透過 Slack 私訊發送");
        onOpenChange(false);
      } else {
        toast.error(`部分失敗：${failed.map((f) => `${f.email}(${f.error})`).join("；")}`);
      }
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[92vh] h-[min(88vh,860px)] flex flex-col gap-0 overflow-hidden p-6 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 space-y-1.5 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Slack 詢案訊息
          </DialogTitle>
          <DialogDescription>
            訊息會以您在 Slack 連結的身分發送私訊。已選 {cases.length} 筆案件。
            {slackConnected === false && (
              <span className="block mt-2 text-destructive">
                尚未連結 Slack，請至{" "}
                <Link to="/settings" className="underline font-medium" onClick={() => onOpenChange(false)}>
                  設定
                </Link>{" "}
                完成授權。
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-3 py-2 overflow-hidden">
          <div className="shrink-0">
            <Label className="text-xs text-muted-foreground">預覽</Label>
            <pre className="mt-1 rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
              {messagePreview}
            </pre>
          </div>

          <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden">
            <Input
              placeholder="搜尋姓名或信箱…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="shrink-0"
              aria-label="搜尋成員"
            />

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue placeholder="排序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">字母（顯示名稱）</SelectItem>
                  <SelectItem value="workload">近期案量（30 天）</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
                <SelectTrigger className="w-[100px] h-9 text-xs">
                  <SelectValue placeholder="方向" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">升序</SelectItem>
                  <SelectItem value="desc">降序</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="inquiry-slack-select-all"
                  disabled={selectableInView.length === 0}
                  checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
                  onCheckedChange={(c) => {
                    if (c === true) {
                      setSelectedEmails((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) n.add(r.email);
                        return n;
                      });
                    } else {
                      setSelectedEmails((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) n.delete(r.email);
                        return n;
                      });
                    }
                  }}
                  className="h-4 w-4"
                />
                <label htmlFor="inquiry-slack-select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                  全選
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="inquiry-slack-deselect-all"
                  disabled={selectableInView.length === 0}
                  checked={noVisibleSelected}
                  onCheckedChange={(c) => {
                    if (c === true) {
                      setSelectedEmails((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) n.delete(r.email);
                        return n;
                      });
                    } else {
                      setSelectedEmails((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) n.add(r.email);
                        return n;
                      });
                    }
                  }}
                  className="h-4 w-4"
                />
                <label htmlFor="inquiry-slack-deselect-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                  取消全選
                </label>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Checkbox
                  id="inquiry-slack-hide-self"
                  checked={hideSelf}
                  onCheckedChange={(c) => setHideSelf(c === true)}
                />
                <label htmlFor="inquiry-slack-hide-self" className="text-xs text-muted-foreground cursor-pointer select-none">
                  隱藏自己
                </label>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground shrink-0">
                <Loader2 className="h-4 w-4 animate-spin" />
                載入成員…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 shrink-0">尚無團隊成員資料。</p>
            ) : visibleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 shrink-0">沒有符合搜尋的成員。</p>
            ) : (
              <ScrollArea className="flex-1 min-h-[320px] border rounded-md p-2">
                <div className="space-y-2 pr-2">
                  {visibleRows.map((r) => {
                    const utcOffset = r.timezone ? getTimezoneInfo(r.timezone)?.utcOffset ?? "—" : "—";
                    const statusText = r.statusMessage?.trim() ?? "";
                    const canSend = !!r.email;
                    const title = r.email
                      ? r.email
                      : "個人檔案無信箱，無法發送 Slack 私訊";
                    return (
                      <div
                        key={r.userId}
                        role={canSend ? "button" : undefined}
                        tabIndex={canSend ? 0 : undefined}
                        title={title}
                        onClick={() => canSend && r.email && toggleEmail(r.email)}
                        onKeyDown={(e) => {
                          if (!canSend || !r.email) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleEmail(r.email);
                          }
                        }}
                        className={`flex gap-3 rounded-md border p-2 items-start text-left ${
                          !canSend
                            ? "opacity-60 cursor-not-allowed"
                            : "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        }`}
                      >
                        <Checkbox
                          checked={r.email ? selectedEmails.has(r.email) : false}
                          disabled={!canSend}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => r.email && toggleEmail(r.email)}
                          className="mt-0.5 shrink-0"
                        />
                        <p className="text-sm text-muted-foreground min-w-0 flex-1 leading-snug break-words">
                          <span className="font-medium text-foreground">{r.displayName}</span>{" "}
                          <span className="whitespace-nowrap">({utcOffset})</span>
                          {statusText ? <> {statusText}</> : null}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 pt-2 border-t border-border/60 mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !slackConnected || selectedEmails.size === 0 || loading}
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            發送 Slack 私訊
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
