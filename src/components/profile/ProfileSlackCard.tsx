import { useEffect, useState } from "react";
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

type ProfileSlackCardProps = {
  isAdmin: boolean;
  receiveCaseReplySlackDms: boolean;
  onReceiveCaseReplySlackDmsChange: (v: boolean) => void;
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
}: ProfileSlackCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [slackUserId, setSlackUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

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
          {isAdmin && (
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="space-y-1 pr-2">
                <Label htmlFor="receiveCaseReplySlackProfile" className="text-base font-normal cursor-pointer">
                  接收「承接／無法承接」自動 Slack 私訊
                </Label>
                <p className="text-xs text-muted-foreground">
                  僅影響派案端是否收到他人承接類通知；與下方「Slack 詢案」無關。
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
