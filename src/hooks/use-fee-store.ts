import { useSyncExternalStore, useEffect } from "react";
import { feeStore } from "@/stores/fee-store";
import { supabase } from "@/integrations/supabase/client";

// Load fees from DB; reset on auth changes so RLS filters apply per-user
let loadPromise: Promise<any> | null = null;
function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = feeStore.loadFees();
  }
}

// Reset cache on auth changes — only reload on sign-in to avoid race conditions
supabase.auth.onAuthStateChange((event) => {
  loadPromise = null;
  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
    // Small delay to ensure the new session token is fully propagated
    loadPromise = new Promise((resolve) => setTimeout(resolve, 100)).then(() => feeStore.loadFees());
  }
});

export function useFees() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(feeStore.subscribe, feeStore.getFees);
}

export function useFee(id: string | undefined) {
  const fees = useFees();
  return id ? fees.find((f) => f.id === id) : undefined;
}

export { feeStore };
