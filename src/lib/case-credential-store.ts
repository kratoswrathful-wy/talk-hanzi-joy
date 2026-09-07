import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createCaseCredentialAccess } from "@/lib/case-credential-access";

export const caseCredentialAccess = createCaseCredentialAccess(supabase);

supabase.auth.onAuthStateChange((_event, session) => {
  const nextUserId = session?.user?.id ?? null;
  caseCredentialAccess.setActiveUser(nextUserId);
});

supabase
  .channel(`case-credential-invalidation-${getEnvironment()}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "case_change_signals",
      filter: `env=eq.${getEnvironment()}`,
    },
    (payload) => {
      const row = payload.new;
      if (
        row
        && typeof row === "object"
        && "case_id" in row
        && typeof row.case_id === "string"
      ) {
        caseCredentialAccess.clear(row.case_id);
      }
    },
  )
  .subscribe();
