import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  /** PKCE / hash recovery: wait until session exists before allowing password update */
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      // Supabase v2 default PKCE: email links use ?code=...
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setSessionError(error.message);
          toast.error(error.message);
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        setSessionReady(true);
        return;
      }

      // Implicit flow: tokens in hash (#access_token=...&type=recovery)
      const hash = window.location.hash?.replace(/^#/, "") ?? "";
      if (hash.includes("type=recovery") || hash.includes("access_token")) {
        await supabase.auth.getSession();
        if (cancelled) return;
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setSessionError(error.message);
        return;
      }
      if (session) {
        setSessionReady(true);
        return;
      }

      // One more tick: client may still be parsing hash from URL
      await new Promise((r) => setTimeout(r, 100));
      const {
        data: { session: s2 },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (s2) {
        setSessionReady(true);
        return;
      }

      setSessionError(
        "尚未取得重設連結的登入狀態。請從信箱裡的「重設密碼」連結開啟本頁，勿自行輸入網址或重新整理成空白連結。"
      );
    }

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionReady) {
      toast.error("請先從信件中的重設連結開啟本頁");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("密碼已更新");
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>設定新密碼</CardTitle>
          <CardDescription>請輸入您的新密碼</CardDescription>
        </CardHeader>
        <CardContent>
          {!sessionReady && !sessionError && (
            <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在驗證重設連結…
            </div>
          )}
          {sessionError && (
            <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{sessionError}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">新密碼</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={!sessionReady}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !sessionReady}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              更新密碼
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
