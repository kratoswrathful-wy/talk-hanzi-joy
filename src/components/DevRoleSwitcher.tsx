import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resetEnvironmentCache } from "@/lib/environment";
import { Loader2, FlaskConical, LogOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * 測試模式面板（執行長專用）。
 *
 * - 真人執行長（executive 且非測試帳號）：顯示「進入測試模式」。進入時先為自己預先取得一張
 *   免密碼返回票（magic link token，存 sessionStorage），再切換為假執行長並重整。
 * - 測試帳號（假人）登入中：顯示各假人切換鈕 + 「離開測試模式（切回本人）」。
 *   離開時優先用返回票免密碼切回；票失效則登出回登入頁。
 *
 * 安全：dev-switch-user 後端僅允許「切到自己」或「切到 @test.local 測試帳」，
 * 因此假帳號無法藉此跳進任何真人帳號。
 */

const EXEC_TEST_EMAIL = "test-exec@test.local";
const RETURN_TOKEN_KEY = "tms_test_mode_return_token";
const RETURN_EMAIL_KEY = "tms_test_mode_return_email";

interface Persona {
  email: string;
  label: string;
}

const FALLBACK_PERSONAS: Persona[] = [
  { email: "test-exec@test.local", label: "執行長" },
  { email: "test-pm@test.local", label: "PM" },
  { email: "test-t1@test.local", label: "譯者一" },
  { email: "test-t2@test.local", label: "譯者二" },
];

async function requestSwitchToken(email: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("dev-switch-user", {
    body: { email },
  });
  if (error || !data?.token) {
    console.error("[test-mode] switch token failed:", error || data?.error);
    return null;
  }
  return data.token as string;
}

async function consumeTokenAndReload(token: string) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) {
    console.error("[test-mode] verifyOtp failed:", error.message);
    toast({ title: "切換失敗", description: error.message, variant: "destructive" });
    return;
  }
  resetEnvironmentCache();
  // 整頁重整：一次清掉所有 store 記憶體與 realtime 訂閱，避免跨環境殘留。
  window.location.reload();
}

export function DevRoleSwitcher() {
  const { user, isRealExecutive, isTestAccount } = useAuth();
  const currentEmail = user?.email ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>(FALLBACK_PERSONAS);

  // 載入假人清單（profiles.is_test = true）；失敗則用預設四人。
  useEffect(() => {
    if (!isRealExecutive && !isTestAccount) return;
    let active = true;
    void (async () => {
      // profiles.is_test 為新欄位（尚未進 generated types），用 as any 避免型別過深推導。
      const { data } = await (supabase as any)
        .from("profiles")
        .select("email, display_name")
        .eq("is_test", true)
        .order("email");
      if (!active) return;
      const rows = ((data ?? []) as { email: string | null; display_name: string | null }[])
        .filter((r) => !!r.email)
        .map((r) => ({
          email: r.email as string,
          label: r.display_name || (r.email as string),
        }));
      if (rows.length > 0) setPersonas(rows);
    })();
    return () => {
      active = false;
    };
  }, [isRealExecutive, isTestAccount]);

  const enterTestMode = useCallback(async () => {
    if (busy || !currentEmail) return;
    setBusy(EXEC_TEST_EMAIL);
    try {
      // 1. 先為自己預先取得免密碼返回票（趁仍是真人執行長），供日後切回本人。
      const returnToken = await requestSwitchToken(currentEmail);
      if (returnToken) {
        sessionStorage.setItem(RETURN_TOKEN_KEY, returnToken);
        sessionStorage.setItem(RETURN_EMAIL_KEY, currentEmail);
      }
      // 2. 切換為假執行長。
      const token = await requestSwitchToken(EXEC_TEST_EMAIL);
      if (!token) {
        toast({ title: "無法進入測試模式", description: "請確認測試帳號已建立。", variant: "destructive" });
        setBusy(null);
        return;
      }
      await consumeTokenAndReload(token);
    } catch (e) {
      console.error("[test-mode] enter error:", e);
      setBusy(null);
    }
  }, [busy, currentEmail]);

  const switchPersona = useCallback(
    async (email: string) => {
      if (busy || email === currentEmail) return;
      setBusy(email);
      try {
        const token = await requestSwitchToken(email);
        if (!token) {
          setBusy(null);
          return;
        }
        await consumeTokenAndReload(token);
      } catch (e) {
        console.error("[test-mode] switch error:", e);
        setBusy(null);
      }
    },
    [busy, currentEmail],
  );

  const leaveTestMode = useCallback(async () => {
    if (busy) return;
    setBusy("__leave__");
    try {
      const token = sessionStorage.getItem(RETURN_TOKEN_KEY);
      sessionStorage.removeItem(RETURN_TOKEN_KEY);
      sessionStorage.removeItem(RETURN_EMAIL_KEY);
      if (token) {
        await consumeTokenAndReload(token);
        return;
      }
      // 無返回票（票已用過／逾時）：登出回登入頁，請執行長以本人帳號重新登入。
      await supabase.auth.signOut();
      resetEnvironmentCache();
      window.location.href = "/";
    } catch (e) {
      console.error("[test-mode] leave error:", e);
      setBusy(null);
    }
  }, [busy]);

  // 真人執行長、尚未進入測試模式：只顯示入口。
  if (isRealExecutive && !isTestAccount) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium shrink-0">測試模式：</span>
        <Button size="sm" variant="outline" className="h-6 text-xs px-2.5" onClick={enterTestMode} disabled={busy !== null}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "進入測試模式"}
        </Button>
      </div>
    );
  }

  // 測試帳號登入中：顯示假人切換 + 離開。
  if (isTestAccount) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-400/60 bg-amber-50/60 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium shrink-0">測試模式 — 目前扮演：</span>
        {personas.map((p) => (
          <Button
            key={p.email}
            variant={currentEmail === p.email ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs px-2.5"
            onClick={() => switchPersona(p.email)}
            disabled={busy !== null}
          >
            {busy === p.email ? <Loader2 className="h-3 w-3 animate-spin" /> : p.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2.5 ml-auto"
          onClick={leaveTestMode}
          disabled={busy !== null}
        >
          {busy === "__leave__" ? <Loader2 className="h-3 w-3 animate-spin" /> : (<><LogOut className="h-3 w-3 mr-1" />離開測試模式</>)}
        </Button>
      </div>
    );
  }

  return null;
}
