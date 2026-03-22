import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, MessageSquare, Bell, Link2 } from "lucide-react";
import { toast } from "sonner";
import { messageFromFunctionsInvokeErrorAsync } from "@/lib/functions-invoke-error";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-access-token";
import {
  DEFAULT_ACCEPT_SUFFIX,
  DEFAULT_DECLINE_LINE1_SUFFIX,
  DEFAULT_DECLINE_LINE2_SUFFIX,
  DEFAULT_DECLINE_LINE3_SUFFIX,
} from "@/lib/slack-case-reply-defaults";
import { Input } from "@/components/ui/input";
import { MultilineInput } from "@/components/ui/multiline-input";

const PREVIEW_PLACEHOLDER_TITLE = "<案件標題>";
const PREVIEW_PLACEHOLDER_DEADLINE = "<所輸入的建議期限>";
const PREVIEW_PLACEHOLDER_VOLUME = "<所輸入的可承接量>";
const PREVIEW_LINE4_PLACEHOLDER = "<按下按鈕後額外輸入的補充留言>";

type ProfileSlackCardProps = {
  isAdmin: boolean;
  receiveCaseReplySlackDms: boolean;
  onReceiveCaseReplySlackDmsChange: (v: boolean) => void;
  /** Text after the auto case link for accept (empty = use built-in default). */
  acceptCaseSuffix: string;
  onAcceptCaseSuffixChange: (v: string) => void;
  /** First line after link for decline (empty = use built-in default). */
  declineLine1Suffix: string;
  onDeclineLine1SuffixChange: (v: string) => void;
  declineLine2Suffix: string;
  onDeclineLine2SuffixChange: (v: string) => void;
  declineLine3Suffix: string;
  onDeclineLine3SuffixChange: (v: string) => void;
};

/**
 * 個人檔案：Slack 連結（全角色）＋分區說明
 * - 承接／無法承接自動通知（含 PM/Exec 接收開關）
 * - Slack 詢案（僅 PM／Executive 顯示說明；與上共用同一連結）
 */
export function ProfileSlackCard({
  isAdmin,
  receiveCaseReplySlackDms,
  onReceiveCaseReplySlackDmsChange,
  acceptCaseSuffix,
  onAcceptCaseSuffixChange,
  declineLine1Suffix,
  onDeclineLine1SuffixChange,
  declineLine2Suffix,
  onDeclineLine2SuffixChange,
  declineLine3Suffix,
  onDeclineLine3SuffixChange,
}: ProfileSlackCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [slackUserId, setSlackUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const acceptPreviewText = useMemo(() => {
    const acceptSuf = acceptCaseSuffix.trim() || DEFAULT_ACCEPT_SUFFIX.trim();
    return `第 1 行：${PREVIEW_PLACEHOLDER_TITLE} ${acceptSuf}`;
  }, [acceptCaseSuffix]);

  const declinePreviewText = useMemo(() => {
    const line1Suf = declineLine1Suffix.trim() || DEFAULT_DECLINE_LINE1_SUFFIX.trim();
    const line2Suf = declineLine2Suffix.trim() || DEFAULT_DECLINE_LINE2_SUFFIX.trim();
    const line3Suf = declineLine3Suffix.trim() || DEFAULT_DECLINE_LINE3_SUFFIX.trim();
    const parts = [
      `第 1 行：${PREVIEW_PLACEHOLDER_TITLE} ${line1Suf}`,
      `第 2 行：${PREVIEW_PLACEHOLDER_DEADLINE} ${line2Suf}`,
      `第 3 行：${PREVIEW_PLACEHOLDER_VOLUME} ${line3Suf}`,
      `第 4 行：${PREVIEW_LINE4_PLACEHOLDER}`,
    ];
    return parts.join("\n");
  }, [declineLine1Suffix, declineLine2Suffix, declineLine3Suffix]);

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      setConnected(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("user_slack_meta").select("slack_user_id").eq("user_id", user.id).maybeSingle();
    setConnected(!!data);
    setSlackUserId(data?.slack_user_id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const slack = searchParams.get("slack");
    const err = searchParams.get("slack_error");
    if (slack === "connected") {
      toast.success("Slack 已連結");
      searchParams.delete("slack");
      setSearchParams(searchParams, { replace: true });
      void refresh();
    }
    if (err) {
      toast.error(`Slack 授權失敗：${decodeURIComponent(err)}`);
      searchParams.delete("slack_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const token = await getAccessTokenForEdgeFunctions();
      if (!token) {
        toast.error("請重新登入後再試");
        return;
      }
      const { data, error } = await supabase.functions.invoke("slack-oauth-start", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        toast.error(await messageFromFunctionsInvokeErrorAsync(error, data));
        return;
      }
      const url = (data as { url?: string })?.url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error("無法取得 Slack 授權網址");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      const token = await getAccessTokenForEdgeFunctions();
      if (!token) {
        toast.error("請重新登入後再試");
        return;
      }
      const { data, error } = await supabase.functions.invoke("slack-disconnect", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        toast.error(await messageFromFunctionsInvokeErrorAsync(error, data));
        return;
      }
      toast.success("已解除 Slack 連結");
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4 shrink-0" />
          Slack（選用）
        </CardTitle>
        <CardDescription>
          連結同一組 Slack 工作區帳號後，下列功能會共用此連線。需在 Slack 建立 App 並設定 Redirect URL 與環境變數。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <p className="text-sm font-medium">連結狀態</p>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              讀取中…
            </div>
          ) : connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                已連結 Slack（使用者 ID：<span className="font-mono text-xs">{slackUserId}</span>）
              </p>
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={actionLoading}>
                {actionLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                解除 Slack 連結
              </Button>
            </div>
          ) : (
            <Button onClick={handleConnect} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              連結 Slack
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4 shrink-0" />
            承接／無法承接自動通知
          </div>
          <p className="text-sm text-muted-foreground">
            在案件上完成「承接」或「無法承接」並成功送出後，若您已連結 Slack，系統可自動以<strong>您的 Slack 身分</strong>通知派案端（PM／執行長）。
            一般成員請先於上方連結 Slack，後續功能才會生效。
          </p>

          <div className="space-y-4 rounded-md border border-dashed bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              訊息開頭會自動插入<strong>可點擊的案件連結</strong>（預覽以 <span className="font-mono">&lt;案件標題&gt;</span> 表示）。下方欄位只編輯連結<strong>後面</strong>緊接的文字；留空則使用系統預設。
            </p>
            <div className="space-y-2">
              <Label htmlFor="slackAcceptSuffix" className="text-sm">
                承接 — 連結後文字
              </Label>
              <div className="rounded-md border bg-background/80 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                <span className="text-[10px] uppercase tracking-wide text-primary/90">即時預覽</span>
                {"\n"}
                {acceptPreviewText}
              </div>
              <p className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded border border-border/60">
                {"<案件標題>"}
              </p>
              <Input
                id="slackAcceptSuffix"
                value={acceptCaseSuffix}
                onChange={(e) => onAcceptCaseSuffixChange(e.target.value)}
                placeholder={`預設：${DEFAULT_ACCEPT_SUFFIX.trim()}`}
              />
            </div>
            <div className="space-y-3">
              <Label className="text-sm">無法承接 — 訊息預覽（含第 4 行佔位）</Label>
              <div className="rounded-md border bg-background/80 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                <span className="text-[10px] uppercase tracking-wide text-primary/90">即時預覽</span>
                {"\n"}
                {declinePreviewText}
              </div>
              <div className="space-y-2">
                <Label htmlFor="slackDeclineLine1" className="text-sm">
                  第 1 行連結後文字
                </Label>
                <p className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded border border-border/60">
                  {"<案件標題>"}
                </p>
                <Input
                  id="slackDeclineLine1"
                  value={declineLine1Suffix}
                  onChange={(e) => onDeclineLine1SuffixChange(e.target.value)}
                  placeholder={`預設：${DEFAULT_DECLINE_LINE1_SUFFIX.trim()}`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slackDeclineLine2" className="text-sm">
                  第 2 行建議交期後文字
                </Label>
                <MultilineInput
                  id="slackDeclineLine2"
                  value={declineLine2Suffix}
                  onChange={(e) => onDeclineLine2SuffixChange(e.target.value)}
                  placeholder={`預設：${DEFAULT_DECLINE_LINE2_SUFFIX.trim()}`}
                  minRows={1}
                  maxRows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slackDeclineLine3" className="text-sm">
                  第 3 行可接案量後文字
                </Label>
                <MultilineInput
                  id="slackDeclineLine3"
                  value={declineLine3Suffix}
                  onChange={(e) => onDeclineLine3SuffixChange(e.target.value)}
                  placeholder={`預設：${DEFAULT_DECLINE_LINE3_SUFFIX.trim()}`}
                  minRows={1}
                  maxRows={4}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                第 2、3 行僅在「無法承接」表單有填寫建議期限或可承接字數時會實際送出；第 4 行會帶入表單中的補充留言。
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="space-y-1 pr-2">
                <Label htmlFor="receiveCaseReplySlackProfile" className="text-base font-normal cursor-pointer">
                  接收「承接／無法承接」自動 Slack 私訊
                </Label>
                <p className="text-xs text-muted-foreground">
                  僅影響<strong>已連結 Slack</strong>的派案端是否收到承接類通知；與下方「Slack 詢案」無關。
                </p>
              </div>
              <Switch
                id="receiveCaseReplySlackProfile"
                checked={receiveCaseReplySlackDms}
                onCheckedChange={onReceiveCaseReplySlackDmsChange}
              />
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4 shrink-0" />
              Slack 詢案
            </div>
            <p className="text-sm text-muted-foreground">
              連結 Slack 後，可在<strong>案件列表</strong>或<strong>案件頁</strong>使用「Slack 詢案」，以<strong>您的 Slack 身分</strong>私訊所選譯者（依信箱對應 Slack 成員）。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
