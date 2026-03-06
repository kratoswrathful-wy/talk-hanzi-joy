import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface TestAccount {
  email: string;
  label: string;
}

const TEST_ACCOUNTS: TestAccount[] = [
  { email: "valodja.j@gmail.com", label: "執行官" },
  { email: "kratoswrathful@gmail.com", label: "譯者 - K" },
  { email: "alexandria1up@gmail.com", label: "PM - Alex1UP" },
];

export function DevRoleSwitcher() {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentEmail(data.session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Hide on published production URL
  const isProduction = window.location.hostname === "talk-hanzi-joy.lovable.app";
  if (isProduction) return null;

  const handleSwitch = async (email: string) => {
    if (email === currentEmail || switching) return;
    setSwitching(email);
    try {
      // Call edge function to get a magic link token
      const { data, error } = await supabase.functions.invoke("dev-switch-user", {
        body: { email },
      });
      if (error || !data?.token) {
        console.error("Dev switch failed:", error || data?.error);
        setSwitching(null);
        return;
      }

      // Sign out current user first
      await supabase.auth.signOut();

      // Verify OTP with the token
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token,
        type: "magiclink",
      });
      if (verifyError) {
        console.error("OTP verify failed:", verifyError.message);
      }
    } catch (err) {
      console.error("Dev switch error:", err);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <span className="font-medium shrink-0">分身切換：</span>
      {TEST_ACCOUNTS.map((acct) => (
        <Button
          key={acct.email}
          variant={currentEmail === acct.email ? "default" : "outline"}
          size="sm"
          className="h-6 text-xs px-2.5"
          onClick={() => handleSwitch(acct.email)}
          disabled={switching !== null}
        >
          {switching === acct.email ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            acct.label
          )}
        </Button>
      ))}
    </div>
  );
}
