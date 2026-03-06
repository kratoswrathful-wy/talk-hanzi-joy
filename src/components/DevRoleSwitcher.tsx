import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentEmail(data.session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!import.meta.env.DEV) return null;

  const handleSwitch = async (email: string) => {
    if (email === currentEmail) return;
    // Sign out first, then sign in with the test account
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: "test1234",
    });
    if (error) {
      console.error("Dev switch failed:", error.message);
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
        >
          {acct.label}
        </Button>
      ))}
    </div>
  );
}
