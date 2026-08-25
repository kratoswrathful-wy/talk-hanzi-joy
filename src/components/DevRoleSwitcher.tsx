import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resetEnvironmentCache } from "@/lib/environment";
import {
  clearTestModeReturnTicket,
  replaceTestModeReturnTicket,
  restoreTestModeReturnSession,
} from "@/lib/test-mode-return-session";
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

async function verifySwitchToken(token: string): Promise<{
  email: string | null;
  error: string | null;
}> {
  // 不在此處呼叫 signOut：verifyOtp 會直接以新 session 覆寫本機 session，
  // 隨後由呼叫端整頁重整，清掉記憶體與 realtime 訂閱。
  //
  // 過去這裡先呼叫 signOut() 反而是換人「靜默失效」的根因：GoTrue 的
  // POST /logout?scope=local 會在「伺服器端」撤銷目前這張 session（local=僅目前這張，
  // 非「不打伺服器」）。測試模式中多個 Playwright context 共用同一張假執行長 session，
  // 任一 context 一旦 signOut，其餘 context 的 token 就在伺服器端失效，換人時
  // dev-switch-user 內的 getUser 回 401 → 換人失敗卻仍以原身分執行（誤判通過）。
  // 實測（tests/_diag3-verifyotp-revoke）確認 verifyOtp 消費 magic link 不會撤銷簽發者
  // session，故移除 signOut 即可讓共用 session 存活、換人穩定成功。
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: "magiclink",
  });
  return {
    email: data.user?.email ?? data.session?.user.email ?? null,
    error: error?.message ?? null,
  };
}

async function consumeTokenForEmail(
  token: string,
  expectedEmail: string,
): Promise<boolean> {
  const result = await verifySwitchToken(token);
  const matchesExpectedIdentity =
    result.email?.toLowerCase() === expectedEmail.toLowerCase();

  if (!result.error && matchesExpectedIdentity) {
    return true;
  }

  const description = result.error
    ?? `實際切換為 ${result.email || "未知帳號"}，與預期身分不符。`;
  console.error("[test-mode] verifyOtp failed:", description);
  toast({ title: "切換失敗", description, variant: "destructive" });

  // verifyOtp 若成功卻回到錯誤身分，不得讓該 session 繼續停留在畫面上。
  if (!result.error && !matchesExpectedIdentity) {
    await supabase.auth.signOut({ scope: "local" });
    resetEnvironmentCache();
    window.location.href = "/";
  }

  return false;
}

function reloadAfterIdentitySwitch(): void {
  resetEnvironmentCache();
  // 整頁重整：一次清掉所有 store 記憶體與 realtime 訂閱，避免跨環境殘留。
  window.location.reload();
}

async function signOutLocalSession(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    throw error;
  }
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
      const { data } = await supabase
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
      // 先清除可能殘留的舊票；拿不到新票就不進入測試模式，確保同分頁可安全切回。
      clearTestModeReturnTicket(sessionStorage);
      const returnToken = await requestSwitchToken(currentEmail);
      if (!returnToken) {
        toast({
          title: "無法進入測試模式",
          description: "無法建立切回本人所需的返回票，請稍後再試。",
          variant: "destructive",
        });
        setBusy(null);
        return;
      }
      replaceTestModeReturnTicket(sessionStorage, {
        token: returnToken,
        email: currentEmail,
      });

      // 2. 切換為假執行長。
      const token = await requestSwitchToken(EXEC_TEST_EMAIL);
      if (!token) {
        clearTestModeReturnTicket(sessionStorage);
        toast({ title: "無法進入測試模式", description: "請確認測試帳號已建立。", variant: "destructive" });
        setBusy(null);
        return;
      }
      const switched = await consumeTokenForEmail(token, EXEC_TEST_EMAIL);
      if (!switched) {
        clearTestModeReturnTicket(sessionStorage);
        setBusy(null);
        return;
      }
      reloadAfterIdentitySwitch();
    } catch (e) {
      console.error("[test-mode] enter error:", e);
      clearTestModeReturnTicket(sessionStorage);
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
        const switched = await consumeTokenForEmail(token, email);
        if (!switched) {
          setBusy(null);
          return;
        }
        reloadAfterIdentitySwitch();
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
      const result = await restoreTestModeReturnSession({
        storage: sessionStorage,
        verifyToken: verifySwitchToken,
        signOut: signOutLocalSession,
      });
      resetEnvironmentCache();

      if (result.status === "restored") {
        window.location.reload();
        return;
      }

      if (result.reason !== "missing-ticket") {
        const description = result.reason === "identity-mismatch"
          ? "返回票切回的身分與本人帳號不符，已安全登出。"
          : `返回票已失效，已安全登出。${result.message ? `（${result.message}）` : ""}`;
        toast({ title: "無法自動切回本人", description, variant: "destructive" });
      }

      // 無票或票失效時回登入頁；scope: local 不撤銷其他分頁共用的測試 session。
      window.location.href = "/";
    } catch (e) {
      console.error("[test-mode] leave error:", e);
      setBusy(null);
    }
  }, [busy]);

  // 真人執行長、尚未進入測試模式：只顯示入口（內嵌於頂欄，不另占一行）。
  if (isRealExecutive && !isTestAccount) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium shrink-0">測試模式：</span>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={enterTestMode} disabled={busy !== null}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "進入測試模式"}
        </Button>
      </div>
    );
  }

  // 測試帳號登入中：顯示假人切換 + 離開（頂欄橫向捲動，避免撐高版面）。
  if (isTestAccount) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-xs text-amber-900 dark:text-amber-200 [scrollbar-width:thin]">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0 font-medium">測試模式 — 目前扮演：</span>
        {personas.map((p) => (
          <Button
            key={p.email}
            variant={currentEmail === p.email ? "default" : "outline"}
            size="sm"
            className="h-7 shrink-0 text-xs px-2.5"
            onClick={() => switchPersona(p.email)}
            disabled={busy !== null}
          >
            {busy === p.email ? <Loader2 className="h-3 w-3 animate-spin" /> : p.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs px-2.5"
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
