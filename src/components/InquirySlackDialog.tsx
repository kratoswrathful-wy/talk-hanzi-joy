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
import type { CaseRecord } from "@/data/case-types";
import {
  buildInquiryMessagePlainText,
  collectTranslatorNamesFromCases,
} from "@/lib/inquiry-slack-message";
import { getTimezoneInfo } from "@/data/timezone-options";
import { Link } from "react-router-dom";

export type TranslatorRow = {
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
  const { session, user, isAdmin } = useAuth();
  const [slackConnected, setSlackConnected] = useState<boolean | null>(null);
  const [rows, setRows] = useState<TranslatorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  const messagePreview = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildInquiryMessagePlainText(origin, cases);
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

    const names = collectTranslatorNamesFromCases(cases);
    if (names.length === 0) {
      setRows([]);
      setSelectedEmails(new Set());
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("email, display_name, timezone, status_message")
        .in("display_name", names);

      if (cancelled) return;
      setLoading(false);

      if (error) {
        console.error(error);
        toast.error("無法載入譯者資料");
        setRows([]);
        return;
      }

      const byName = new Map((data || []).map((p) => [p.display_name?.trim() || "", p]));
      const nextRows: TranslatorRow[] = names.map((name) => {
        const p = byName.get(name);
        return {
          displayName: name,
          email: p?.email ?? null,
          timezone: p?.timezone ?? null,
          statusMessage: p?.status_message ?? null,
        };
      });
      setRows(nextRows);
      const withEmail = nextRows.filter((r) => r.email).map((r) => r.email!);
      setSelectedEmails(new Set(withEmail));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, cases]);

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const n = new Set(prev);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  };

  const handleSend = async () => {
    if (!session) {
      toast.error("請先登入");
      return;
    }
    if (!slackConnected) {
      toast.error("請先到「設定」連結 Slack");
      return;
    }
    const emails = [...selectedEmails];
    if (emails.length === 0) {
      toast.error("請至少選擇一位有電子信箱的譯者");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("slack-send-dm", {
        body: {
          recipient_emails: emails,
          message: messagePreview,
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
            <Label className="text-xs text-muted-foreground">選擇譯者（依個人檔案顯示時區與狀態）</Label>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                載入譯者…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">所選案件中沒有指派譯者。</p>
            ) : (
              <ScrollArea className="h-[220px] border rounded-md mt-2 p-2">
                <div className="space-y-3 pr-2">
                  {rows.map((r) => {
                    const tzLabel = r.timezone ? getTimezoneInfo(r.timezone)?.label || r.timezone : "—";
                    const canSend = !!r.email;
                    return (
                      <div
                        key={r.displayName}
                        className={`flex gap-3 rounded-md border p-2 ${!canSend ? "opacity-60" : ""}`}
                      >
                        <Checkbox
                          checked={r.email ? selectedEmails.has(r.email) : false}
                          disabled={!canSend}
                          onCheckedChange={() => r.email && toggleEmail(r.email)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-sm font-medium">{r.displayName}</p>
                          <p className="text-xs text-muted-foreground">信箱：{r.email || "（個人檔案無信箱，無法發送）"}</p>
                          <p className="text-xs text-muted-foreground">時區：{tzLabel}</p>
                          {r.statusMessage ? (
                            <p className="text-xs text-muted-foreground line-clamp-2">狀態：{r.statusMessage}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground/70">狀態：—</p>
                          )}
                        </div>
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
