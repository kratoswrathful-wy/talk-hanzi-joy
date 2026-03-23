import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import logo from "@/assets/1UP_Mark.png";
import { formatLoginError } from "@/lib/format-auth-error";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Canonical origin for auth redirects; must match Supabase Redirect URLs. */
function getAuthRedirectOrigin(): string {
  const fromEnv = import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_ORIGIN?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return window.location.origin;
}

function persistLoginPreference(keepLoggedIn: boolean) {
  if (keepLoggedIn) {
    localStorage.setItem("keep_logged_in", "true");
    sessionStorage.removeItem("session_active");
    return;
  }

  localStorage.removeItem("keep_logged_in");
  sessionStorage.setItem("session_active", "true");
}

function clearLoginPreference() {
  localStorage.removeItem("keep_logged_in");
  sessionStorage.removeItem("session_active");
}

async function signInWithPasswordFallback(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, gotrue_meta_security: {} }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      error: new Error(payload?.msg || payload?.message || "登入失敗，請稍後再試"),
    };
  }

  const accessToken = payload?.access_token;
  const refreshToken = payload?.refresh_token;

  if (!accessToken || !refreshToken) {
    return {
      error: new Error("登入失敗，認證服務未回傳有效 session"),
    };
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return { error };
}

const AUTH_REQUEST_TIMEOUT_MS = 30_000;

function timeoutPromise(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const loginTimedOutRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (showReset) {
      if (!trimmedEmail) {
        toast.error("請輸入電子信箱");
        return;
      }
      if (!emailPattern.test(trimmedEmail)) {
        toast.error("請輸入有效的電子信箱格式");
        return;
      }
    } else {
      if (!trimmedEmail) {
        toast.error("請輸入電子信箱");
        return;
      }
      if (!emailPattern.test(trimmedEmail)) {
        toast.error("請輸入有效的電子信箱格式");
        return;
      }
      if (!password) {
        toast.error("請輸入密碼");
        return;
      }
      if (password.length < 6) {
        toast.error("密碼至少需要 6 個字元");
        return;
      }
      if (!isLogin && !displayName.trim()) {
        toast.error("請輸入顯示名稱");
        return;
      }
    }

    setLoading(true);

    try {
      if (showReset) {
        try {
          const { error } = await Promise.race([
            supabase.auth.resetPasswordForEmail(trimmedEmail, {
              redirectTo: `${getAuthRedirectOrigin()}/reset-password`,
            }),
            timeoutPromise(AUTH_REQUEST_TIMEOUT_MS, "連線逾時，請檢查網路後再試"),
          ]);
          if (error) {
            toast.error(formatLoginError(error));
          } else {
            toast.success("密碼重設信已寄出，請檢查您的信箱");
            setShowReset(false);
          }
        } catch (caught) {
          toast.error(formatLoginError(caught));
        }
        return;
      }

      if (isLogin) {
        persistLoginPreference(keepLoggedIn);
        loginTimedOutRef.current = false;

        const runLogin = async () => {
          let error: Error | null = null;
          try {
            const result = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
            error = result.error;

            if (error?.message === "Failed to fetch") {
              const fallback = await signInWithPasswordFallback(trimmedEmail, password);
              error = fallback.error ?? null;
            }
          } catch (caught) {
            const fallback = await signInWithPasswordFallback(trimmedEmail, password).catch((fallbackError) => ({ error: fallbackError as Error }));
            error = fallback.error ?? (caught instanceof Error ? caught : new Error("登入失敗，請稍後再試"));
          }

          if (error && !loginTimedOutRef.current) {
            clearLoginPreference();
            toast.error(formatLoginError(error));
          }
        };

        try {
          await Promise.race([
            runLogin(),
            timeoutPromise(AUTH_REQUEST_TIMEOUT_MS, "連線逾時，請檢查網路後再試"),
          ]);
        } catch (caught) {
          loginTimedOutRef.current = true;
          clearLoginPreference();
          toast.error(formatLoginError(caught));
        }
      } else {
        try {
          const { error } = await Promise.race([
            supabase.auth.signUp({
              email: trimmedEmail,
              password,
              options: {
                data: { display_name: displayName },
                emailRedirectTo: getAuthRedirectOrigin(),
              },
            }),
            timeoutPromise(AUTH_REQUEST_TIMEOUT_MS, "連線逾時，請檢查網路後再試"),
          ]);
          if (error) {
            toast.error(formatLoginError(error));
          } else {
            toast.success("註冊成功！請檢查您的信箱以驗證帳號");
          }
        } catch (caught) {
          toast.error(formatLoginError(caught));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (showReset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center">
              <img src={logo} alt="Logo" className="h-10 w-10 object-contain" />
            </div>
            <CardTitle>重設密碼</CardTitle>
            <CardDescription>輸入您的電子信箱以接收重設連結</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">電子信箱</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                寄送重設連結
              </Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setShowReset(false)}>
                返回登入
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center">
            <img src={logo} alt="Logo" className="h-10 w-10 object-contain" />
          </div>
          <CardTitle>{isLogin ? "登入" : "註冊"}</CardTitle>
          <CardDescription>
            {isLogin ? "登入您的帳號以繼續" : "建立新帳號"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="displayName">顯示名稱</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="您的名稱"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">電子信箱</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? "登入" : "註冊"}
            </Button>
          </form>
          <div className="mt-4 space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              {isLogin ? (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="keepLoggedIn"
                    checked={keepLoggedIn}
                    onCheckedChange={(checked) => setKeepLoggedIn(checked === true)}
                  />
                  <Label htmlFor="keepLoggedIn" className="cursor-pointer text-sm font-normal">
                    保持登入
                  </Label>
                </div>
              ) : <div />}
              <div>
                {isLogin ? "還沒有帳號？" : "已有帳號？"}{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => setIsLogin(!isLogin)}>
                  {isLogin ? "註冊" : "登入"}
                </button>
              </div>
            </div>
            {isLogin && (
              <div className="text-right">
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowReset(true)}>
                  忘記密碼？
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
