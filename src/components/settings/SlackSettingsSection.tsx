import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { messageFromFunctionsInvokeErrorAsync } from "@/lib/functions-invoke-error";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-access-token";

export function SlackSettingsSection() {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [slackUserId, setSlackUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = async () => {
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
  }, [user?.id]);

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

  if (!isAdmin) return null;

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
          <MessageSquare className="h-4 w-4" />
          Slack 私訊（詢案）
        </CardTitle>
        <CardDescription>
          連結後，可在案件列表或案件頁以<strong>您的 Slack 身分</strong>私訊譯者；需在 Slack 建立 App 並設定 Redirect URL 與環境變數。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            讀取連線狀態…
          </div>
        ) : connected ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              已連結 Slack（使用者 ID：<span className="font-mono text-xs">{slackUserId}</span>）
            </p>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              解除連結
            </Button>
          </div>
        ) : (
          <Button onClick={handleConnect} disabled={actionLoading}>
            {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            連結 Slack
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
