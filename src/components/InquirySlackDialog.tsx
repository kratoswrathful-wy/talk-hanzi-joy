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
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Link } from "react-router-dom";

export type RecipientRow = {
  userId: string;
  displayName: string;
  email: string | null;
  timezone: string | null;
  statusMessage: string | null;
};

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
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

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

    void (async () => {
      const { data: roleRows, error: roleErr } = await supabase.from("user_roles").select("user_id");
      if (cancelled) return;
      if (roleErr) {
        console.error(roleErr);
        setLoading(false);
        toast.error("無法載入成員身分");
        setRows([]);
        setSelectedEmails(new Set());
        return;
      }

      const userIds = [...new Set((roleRows || []).map((r) => r.user_id))];
      if (userIds.length === 0) {
        setLoading(false);
        setRows([]);
        setSelectedEmails(new Set());
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

      const nextRows: RecipientRow[] = (data || []).map((p) => ({
        userId: p.id,
        displayName: p.display_name?.trim() || p.email || "（無名稱）",
        email: p.email ?? null,
        timezone: p.timezone ?? null,
        statusMessage: p.status_message ?? null,
      }));
      setRows(nextRows);
      const withEmail = nextRows.filter((r) => r.email).map((r) => r.email!);
      setSelectedEmails(new Set(withEmail));
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

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
        toast.error(
          `部分失敗：${failed.map((f) => `${f.email}(${f.error})`).join("；")}`
        );
      }
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0">
        <DialogHeader>
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

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">預覽</Label>
            <pre className="mt-1 rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {messagePreview}
            </pre>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              選擇團隊成員（依個人檔案顯示時區與狀態；含 PM、執行官）
            </Label>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                載入成員…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">尚無團隊成員資料。</p>
            ) : (
              <ScrollArea className="h-[220px] border rounded-md mt-2 p-2">
                <div className="space-y-2 pr-2">
                  {rows.map((r) => {
                    const utcOffset = r.timezone ? getTimezoneInfo(r.timezone)?.utcOffset ?? "—" : "—";
                    const statusText = r.statusMessage?.trim() || "—";
                    const canSend = !!r.email;
                    const title = r.email
                      ? r.email
                      : "個人檔案無信箱，無法發送 Slack 私訊";
                    return (
                      <div
                        key={r.userId}
                        title={title}
                        className={`flex gap-3 rounded-md border p-2 items-start ${!canSend ? "opacity-60" : ""}`}
                      >
                        <Checkbox
                          checked={r.email ? selectedEmails.has(r.email) : false}
                          disabled={!canSend}
                          onCheckedChange={() => r.email && toggleEmail(r.email)}
                          className="mt-0.5 shrink-0"
                        />
                        <p className="text-sm text-muted-foreground min-w-0 flex-1 leading-snug break-words">
                          <span className="font-medium text-foreground">{r.displayName}</span>{" "}
                          <span className="whitespace-nowrap">({utcOffset})</span> {statusText}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
