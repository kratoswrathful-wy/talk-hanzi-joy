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
import { LabeledCheckbox } from "@/components/ui/checkbox-patterns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Bell } from "lucide-react";
import { toast } from "sonner";
import { messageFromFunctionsInvokeErrorAsync } from "@/lib/functions-invoke-error";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-access-token";
import type { CaseRecord } from "@/data/case-types";
import {
  buildWorkloadCountByDisplayName,
  type CaseRowForWorkload,
} from "@/lib/inquiry-slack-workload";
import {
  buildNoteReminderMessageForSlack,
  buildNoteReminderNotificationFallback,
} from "@/lib/inquiry-slack-message";
import { getTimezoneInfo } from "@/data/timezone-options";
import { Link } from "react-router-dom";
import { caseStore } from "@/stores/case-store";
import { internalNotesStore } from "@/stores/internal-notes-store";
import { getEnvironment } from "@/lib/environment";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSelectOptions } from "@/stores/select-options-store";
import type { InternalNote } from "@/hooks/use-internal-notes-table-views";

export type NoteReminderRecipientRow = {
  userId: string;
  profileDisplayNameTrimmed: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  timezone: string | null;
  statusMessage: string | null;
};

type SortMode = "workload" | "name" | "custom";

function collectCasePersonDisplayNames(c: CaseRecord | undefined): Set<string> {
  const s = new Set<string>();
  if (!c) return s;
  if (c.reviewer?.trim()) s.add(c.reviewer.trim());
  for (const t of c.translator || []) {
    if (typeof t === "string" && t.trim()) s.add(t.trim());
  }
  if (c.multiCollab && c.collabRows) {
    for (const row of c.collabRows) {
      if (row.reviewer?.trim()) s.add(row.reviewer.trim());
      if (row.translator?.trim()) s.add(row.translator.trim());
    }
  }
  return s;
}

export function NoteReminderSlackDialog({
  open,
  onOpenChange,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: InternalNote;
}) {
  const { user, isAdmin } = useAuth();
  const [slackConnected, setSlackConnected] = useState<boolean | null>(null);
  const [rows, setRows] = useState<NoteReminderRecipientRow[]>([]);
  const [workloadByName, setWorkloadByName] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [messageBody, setMessageBody] = useState("");

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

  const relatedCaseRecord = useMemo(
    () => caseStore.getAll().find((c) => c.title === note.relatedCase),
    [note.relatedCase, open]
  );

  const casePersonNames = useMemo(
    () => collectCasePersonDisplayNames(relatedCaseRecord),
    [relatedCaseRecord]
  );

  const grayedUserIds = useMemo(() => new Set(note.consultationSlackRecords || []), [note.consultationSlackRecords]);

  const defaultMessage = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (!relatedCaseRecord) return "";
    return buildNoteReminderMessageForSlack(
      origin,
      relatedCaseRecord.id,
      relatedCaseRecord.title || "（無標題）",
      note.id,
      note.title || "（無標題）"
    );
  }, [relatedCaseRecord, note.id, note.title]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setHideSelf(true);
    setSortMode("workload");
    setMessageBody(defaultMessage);
  }, [open, defaultMessage]);

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
          .select("translator, reviewer, collab_rows, updated_at")
          .eq("env", env)
          .gte("updated_at", cutoffIso),
      ]);

      if (cancelled) return;

      if (casesRes.error) {
        console.error(casesRes.error);
      }
      setWorkloadByName(
        buildWorkloadCountByDisplayName((casesRes.data || []) as CaseRowForWorkload[])
      );

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

      const nextRows: NoteReminderRecipientRow[] = (data || []).map((p) => {
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

      const gray = new Set(note.consultationSlackRecords || []);
      const pre = new Set<string>();
      for (const r of nextRows) {
        if (gray.has(r.userId)) continue;
        if (casePersonNames.has(r.profileDisplayNameTrimmed)) pre.add(r.userId);
      }
      setSelectedUserIds(pre);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, note.consultationSlackRecords, note.id, casePersonNames]);

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
      const ga = grayedUserIds.has(a.userId);
      const gb = grayedUserIds.has(b.userId);
      if (ga !== gb) return ga ? 1 : -1;

      const pa = casePersonNames.has(a.profileDisplayNameTrimmed);
      const pb = casePersonNames.has(b.profileDisplayNameTrimmed);
      if (pa !== pb) return pa ? -1 : 1;

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

      const cmp = a.workload30 - b.workload30;
      if (cmp !== 0) return -cmp;
      return a.displayName.localeCompare(b.displayName, "zh-Hant", { sensitivity: "base" });
    });
    return copy;
  }, [
    afterSearch,
    grayedUserIds,
    casePersonNames,
    sortMode,
    selectedUserIds,
    customOrderIndexByEmail,
  ]);

  type RowW = NoteReminderRecipientRow & { workload30: number };
  const selectableInView = useMemo(
    () => (visibleRows as RowW[]).filter((r) => !!r.email),
    [visibleRows]
  );

  const allVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return false;
    return selectableInView.every((r) => selectedUserIds.has(r.userId));
  }, [selectableInView, selectedUserIds]);

  const noVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return true;
    return selectableInView.every((r) => !selectedUserIds.has(r.userId));
  }, [selectableInView, selectedUserIds]);

  const someVisibleSelected = useMemo(() => {
    if (selectableInView.length === 0) return false;
    const any = selectableInView.some((r) => selectedUserIds.has(r.userId));
    const all = selectableInView.every((r) => selectedUserIds.has(r.userId));
    return any && !all;
  }, [selectableInView, selectedUserIds]);

  const canSendNow =
    selectableInView.some((r) => selectedUserIds.has(r.userId)) && messageBody.trim().length > 0 && !!relatedCaseRecord;

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const n = new Set(prev);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  };

  const handleSend = async () => {
    if (!relatedCaseRecord) {
      toast.error("找不到關聯案件，無法發送");
      return;
    }
    if (!slackConnected) {
      toast.error("請先到「個人檔案」連結 Slack");
      return;
    }
    const checkedRecipients = selectableInView.filter((r) => selectedUserIds.has(r.userId) && r.email);
    if (checkedRecipients.length === 0) {
      toast.error("請至少勾選一位收件人");
      return;
    }
    const msg = messageBody.trim();
    if (!msg) {
      toast.error("訊息內容不可為空");
      return;
    }

    setSending(true);
    try {
      const token = await getAccessTokenForEdgeFunctions();
      if (!token) {
        toast.error("請重新登入後再試");
        return;
      }
      const failedRecipients: { recipientLabel: string; error: string }[] = [];
      const sentIds: string[] = [];
      const notificationFallback =
        msg.split("\n")[0]?.slice(0, 280)?.trim() || buildNoteReminderNotificationFallback();

      for (const r of checkedRecipients) {
        const { data, error } = await supabase.functions.invoke("slack-send-dm", {
          headers: { Authorization: `Bearer ${token}` },
          body: {
            note_reminder_notification: true,
            recipient_emails: [r.email],
            message: msg,
            notification_fallback: notificationFallback,
          },
        });

        if (error) {
          failedRecipients.push({
            recipientLabel: r.email || r.userId,
            error: await messageFromFunctionsInvokeErrorAsync(error, data),
          });
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
        sentIds.push(r.userId);
      }

      if (sentIds.length > 0) {
        const prev = internalNotesStore.getById(note.id)?.consultationSlackRecords || note.consultationSlackRecords || [];
        const next = Array.from(new Set([...prev, ...sentIds]));
        await internalNotesStore.update(note.id, { consultationSlackRecords: next });
      }

      if (failedRecipients.length === 0) {
        toast.success("已透過 Slack 私訊發送");
        onOpenChange(false);
      } else if (sentIds.length > 0) {
        toast.error(`部分失敗：${failedRecipients.map((f) => `${f.recipientLabel}(${f.error})`).join("；")}`);
      } else {
        toast.error(`發送失敗：${failedRecipients.map((f) => `${f.recipientLabel}(${f.error})`).join("；")}`);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] h-[min(88vh,860px)] flex flex-col gap-0 overflow-hidden p-6 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1.5 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            發送註記提醒
          </DialogTitle>
          <DialogDescription>
            訊息會以您在 Slack 連結的身分發送私訊。關聯案件：{note.relatedCase || "（未設定）"}
            {!relatedCaseRecord && note.relatedCase && (
              <span className="block mt-2 text-destructive">找不到與標題相符的案件，無法組合預設訊息。</span>
            )}
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
          <div className="shrink-0 space-y-1">
            <Label className="text-xs text-muted-foreground" htmlFor="note-reminder-message">
              訊息（可編輯；Slack mrkdwn）
            </Label>
            <Textarea
              id="note-reminder-message"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              className="min-h-[100px] max-h-40 text-xs font-mono"
              disabled={!relatedCaseRecord}
            />
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
                  id="note-reminder-select-all"
                  disabled={selectableInView.length === 0}
                  checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
                  onCheckedChange={(c) => {
                    if (c === true) {
                      setSelectedUserIds((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) {
                          n.add(r.userId);
                        }
                        return n;
                      });
                    } else {
                      setSelectedUserIds((prev) => {
                        const n = new Set(prev);
                        for (const r of selectableInView) {
                          n.delete(r.userId);
                        }
                        return n;
                      });
                    }
                  }}
                  className="h-4 w-4"
                />
                <label htmlFor="note-reminder-select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                  全選
                </label>
              </div>
              <LabeledCheckbox
                disabled={selectableInView.length === 0}
                checked={noVisibleSelected}
                onCheckedChange={(c) => {
                  if (c) {
                    setSelectedUserIds((prev) => {
                      const n = new Set(prev);
                      for (const r of selectableInView) {
                        n.delete(r.userId);
                      }
                      return n;
                    });
                  } else {
                    setSelectedUserIds((prev) => {
                      const n = new Set(prev);
                      for (const r of selectableInView) {
                        n.add(r.userId);
                      }
                      return n;
                    });
                  }
                }}
                className="h-4 w-4"
                labelClassName="text-xs text-muted-foreground select-none"
              >
                取消全選
              </LabeledCheckbox>
              <div className="flex items-center gap-2 ml-auto">
                <LabeledCheckbox
                  checked={hideSelf}
                  onCheckedChange={setHideSelf}
                  className="h-4 w-4"
                  labelClassName="text-xs text-muted-foreground select-none"
                >
                  隱藏自己
                </LabeledCheckbox>
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
                    const gray = grayedUserIds.has(r.userId);
                    const title = !canSend
                      ? "個人檔案無信箱，無法發送 Slack 私訊"
                      : gray
                        ? "曾發送過註記提醒（仍可勾選重送）"
                        : r.email || r.userId;
                    return (
                      <div
                        key={r.userId}
                        role={canSend ? "button" : undefined}
                        tabIndex={canSend ? 0 : undefined}
                        title={title}
                        onClick={() => canSend && toggleUser(r.userId)}
                        onKeyDown={(e) => {
                          if (!canSend) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleUser(r.userId);
                          }
                        }}
                        className={`flex gap-3 rounded-md border p-2 items-start text-left ${
                          !canSend
                            ? "opacity-60 cursor-not-allowed"
                            : gray
                              ? "opacity-60 bg-muted/30 cursor-pointer hover:bg-muted/50"
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
                          checked={selectedUserIds.has(r.userId)}
                          disabled={!canSend}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => canSend && toggleUser(r.userId)}
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
          <Button onClick={handleSend} disabled={sending || !slackConnected || !canSendNow || loading}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            發送 Slack 私訊
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
