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
  buildWorkloadCountByDisplayNameTranslatorReviewerOnly,
  type CaseRowForWorkloadTranslatorReviewerOnly,
} from "@/lib/inquiry-slack-workload";
import { Link } from "react-router-dom";
import { caseStore } from "@/stores/case-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSelectOptions } from "@/stores/select-options-store";

export type RecipientRow = {
  userId: string;
  /** Trimmed profile display_name; used to match cases.translator / reviewer */
  profileDisplayNameTrimmed: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  timezone: string | null;
  statusMessage: string | null;
};

type SortMode = "workload" | "name" | "custom";

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
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [hideSelf, setHideSelf] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("workload");

  const { options: assigneeOptions } = useSelectOptions("assignee");
  const customOrderIndexByEmail = useMemo(() => {
    const m = new Map<string, number>();
    assigneeOptions.forEach((o, idx) => {
      if (o.email) m.set(o.email, idx);
    });
    return m;
  }, [assigneeOptions]);

  const messagePreview = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildInquiryMessagePlainText(origin, cases);
  }, [cases]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setHideSelf(true);
    setSortMode("workload");
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
    setSelectedUserIds(new Set());

    void (async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffIso = cutoff.toISOString();
      const env = getEnvironment();

      const [{ data: roleRows, error: roleErr }, casesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id"),
        supabase
          .from("cases")
          .select("translator, reviewer, updated_at")
          .eq("env", env)
          .gte("updated_at", cutoffIso),
      ]);

      if (cancelled) return;

      if (casesRes.error) {
        console.error(casesRes.error);
      }
      const wMap = buildWorkloadCountByDisplayNameTranslatorReviewerOnly(
        (casesRes.data || []) as CaseRowForWorkloadTranslatorReviewerOnly[]
      );
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
        .select("id, email, display_name, avatar_url, timezone, status_message")
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
          avatarUrl: p.avatar_url || null,
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

  // Lock rules:
  // - For each recipient (row.userId), if they've already been inquired for ALL selected cases,
  //   their checkbox becomes locked+checked and is pinned to the top.
  const pendingCasesByUserId = useMemo(() => {
    const map = new Map<string, Pick<CaseRecord, "id" | "title">[]>();
    for (const r of rows) {
      const pending = (cases || []).filter((c) => {
        const history = c.inquirySlackRecords || [];
        return !history.includes(r.userId);
      }).map((c) => ({ id: c.id, title: c.title || "（無標題）" }));
      map.set(r.userId, pending);
    }
    return map;
  }, [rows, cases]);

  const lockedUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const pending = pendingCasesByUserId.get(r.userId) || [];
      if (pending.length === 0) set.add(r.userId);
    }
    return set;
  }, [rows, pendingCasesByUserId]);

  const visibleRows = useMemo(() => {
    const copy = [...afterSearch];
    copy.sort((a, b) => {
      const aLocked = lockedUserIds.has(a.userId);
      const bLocked = lockedUserIds.has(b.userId);
      if (aLocked !== bLocked) return aLocked ? -1 : 1;

      const aChecked = selectedUserIds.has(a.userId);
      const bChecked = selectedUserIds.has(b.userId);
      if (aChecked !== bChecked) return aChecked ? -1 : 1;

      if (sortMode === "name") {
        return a.displayName.localeCompare(b.displayName, "zh-Hant", { sensitivity: "base" });
      }

      if (sortMode === "custom") {
        const aEmail = a.email ?? "";
        const bEmail = b.email ?? "";
        const aIdx = customOrderIndexByEmail.get(aEmail) ?? 999999;
        const bIdx = customOrderIndexByEmail.get(bEmail) ?? 999999;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.displayName.localeCompare(b.displayName, "zh-Hant", { sensitivity: "base" });
      }

      // workload (default): desc by workload30, then name
      const cmp = a.workload30 - b.workload30;
      if (cmp !== 0) return -cmp;
      return a.displayName.localeCompare(b.displayName, "zh-Hant", { sensitivity: "base" });
    });
    return copy;
  }, [afterSearch, lockedUserIds, sortMode, selectedUserIds, customOrderIndexByEmail]);

  const selectableInView = useMemo(
    () => visibleRows.filter((r): r is (typeof r & { email: string }) => !!r.email),
    [visibleRows]
  );

  const allVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return false;
    return selectableInView.every((r) => lockedUserIds.has(r.userId) || selectedUserIds.has(r.userId));
  }, [selectableInView, lockedUserIds, selectedUserIds]);

  const noVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return true;
    return selectableInView.every((r) => !lockedUserIds.has(r.userId) && !selectedUserIds.has(r.userId));
  }, [selectableInView, lockedUserIds, selectedUserIds]);

  const someVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return false;
    const any = selectableInView.some((r) => lockedUserIds.has(r.userId) || selectedUserIds.has(r.userId));
    const all = selectableInView.every((r) => lockedUserIds.has(r.userId) || selectedUserIds.has(r.userId));
    return any && !all;
  }, [selectableInView, lockedUserIds, selectedUserIds]);

  const pendingSelectedRecipients = useMemo(() => {
    return selectableInView.filter((r) => {
      const checked = lockedUserIds.has(r.userId) || selectedUserIds.has(r.userId);
      if (!checked || !r.email) return false;
      const pending = pendingCasesByUserId.get(r.userId) || [];
      return pending.length > 0;
    });
  }, [selectableInView, lockedUserIds, selectedUserIds, pendingCasesByUserId]);

  const canSendNow = pendingSelectedRecipients.length > 0;

  const toggleUser = (userId: string) => {
    if (lockedUserIds.has(userId)) return;
    setSelectedUserIds((prev) => {
      const n = new Set(prev);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  };

  const handleSend = async () => {
    if (!slackConnected) {
      toast.error("請先到「個人檔案」連結 Slack");
      return;
    }

    // Checked recipients = locked (always checked) + manually selected unlocked recipients.
    const checkedRecipients = selectableInView.filter((r) => {
      const isChecked = lockedUserIds.has(r.userId) || selectedUserIds.has(r.userId);
      return isChecked && !!r.email;
    });

    // Only send to recipients who still have pending cases.
    const pendingRecipients = checkedRecipients.filter((r) => {
      const pending = pendingCasesByUserId.get(r.userId) || [];
      return pending.length > 0;
    });

    if (pendingRecipients.length === 0) {
      toast.error("目前沒有需要送出的項目");
      return;
    }

    setSending(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const token = await getAccessTokenForEdgeFunctions();
      if (!token) {
        toast.error("請重新登入後再試");
        return;
      }
      const failedRecipients: { recipientLabel: string; error: string }[] = [];

      for (const r of pendingRecipients) {
        const pendingCases = pendingCasesByUserId.get(r.userId) || [];
        if (pendingCases.length === 0 || !r.email) continue;

        const message = buildInquiryMessageForSlack(origin, pendingCases);
        const notificationFallback = buildInquirySlackNotificationFallback(pendingCases);

        const { data, error } = await supabase.functions.invoke("slack-send-dm", {
          headers: { Authorization: `Bearer ${token}` },
          body: {
            recipient_emails: [r.email],
            message,
            notification_fallback: notificationFallback,
          },
        });

        if (error) {
          failedRecipients.push({ recipientLabel: r.email || r.userId, error: await messageFromFunctionsInvokeErrorAsync(error, data) });
          continue;
        }

        const payload = data as { ok?: boolean; results?: { email: string; ok: boolean; error?: string }[] };
        const firstResult = payload?.results?.[0];
        const ok = payload?.ok ?? firstResult?.ok ?? false;

        if (!ok) {
          failedRecipients.push({
            recipientLabel: r.email || r.userId,
            error: firstResult?.error || "unknown_slack_error",
          });
          continue;
        }

        // Slack success => persist lock for this recipient userId for each pending case.
        let allLocksPersisted = true;
        for (const pc of pendingCases) {
          const current = caseStore.getById(pc.id);
          const history = current?.inquirySlackRecords || [];
          const nextHistory = Array.from(new Set([...history, r.userId]));
          const err = await caseStore.update(pc.id, { inquirySlackRecords: nextHistory });
          if (err) {
            allLocksPersisted = false;
            failedRecipients.push({
              recipientLabel: r.email || r.userId,
              error: "Slack 發送成功，但寫入鎖定資料失敗（請確認 DB 欄位已部署）",
            });
            break;
          }
        }
        if (!allLocksPersisted) continue;
      }

      if (failedRecipients.length === 0) {
        toast.success("已透過 Slack 私訊發送");
        onOpenChange(false);
      } else {
        toast.error(`部分失敗：${failedRecipients.map((f) => `${f.recipientLabel}(${f.error})`).join("；")}`);
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
                <Link to="/profile" className="underline font-medium" onClick={() => onOpenChange(false)}>
                  個人檔案
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
                  <SelectItem value="workload">近 30 天內案量</SelectItem>
                  <SelectItem value="name">姓名字母</SelectItem>
                  {isAdmin && <SelectItem value="custom">自訂</SelectItem>}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="inquiry-slack-select-all"
                  disabled={selectableInView.length === 0}
                  checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
                  onCheckedChange={(c) => {
                    if (c === true) {
                      setSelectedUserIds((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) {
                          if (!lockedUserIds.has(r.userId)) n.add(r.userId);
                        }
                        return n;
                      });
                    } else {
                      setSelectedUserIds((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) {
                          if (!lockedUserIds.has(r.userId)) n.delete(r.userId);
                        }
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
                      setSelectedUserIds((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) {
                          if (!lockedUserIds.has(r.userId)) n.delete(r.userId);
                        }
                        return n;
                      });
                    } else {
                      setSelectedUserIds((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) {
                          if (!lockedUserIds.has(r.userId)) n.add(r.userId);
                        }
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
                    const locked = lockedUserIds.has(r.userId);
                    const title = locked ? "已送出過（鎖定）" : (canSend ? r.email || r.userId : "個人檔案無信箱，無法發送 Slack 私訊");
                    return (
                      <div
                        key={r.userId}
                        role={canSend && !locked ? "button" : undefined}
                        tabIndex={canSend && !locked ? 0 : undefined}
                        title={title}
                        onClick={() => canSend && !locked && toggleUser(r.userId)}
                        onKeyDown={(e) => {
                          if (!canSend || locked) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleUser(r.userId);
                          }
                        }}
                        className={`flex gap-3 rounded-md border p-2 items-start text-left ${
                          !canSend
                            ? "opacity-60 cursor-not-allowed"
                            : locked
                              ? "opacity-70 cursor-not-allowed"
                            : "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        }`}
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          {r.avatarUrl ? (
                            <AvatarImage src={r.avatarUrl} alt={r.displayName} />
                          ) : (
                            <AvatarFallback>{r.displayName.slice(0, 1) || "—"}</AvatarFallback>
                          )}
                        </Avatar>
                        <Checkbox
                          checked={locked || selectedUserIds.has(r.userId)}
                          disabled={!canSend || locked}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => canSend && !locked && toggleUser(r.userId)}
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
            disabled={sending || !slackConnected || !canSendNow || loading}
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            發送 Slack 私訊
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
