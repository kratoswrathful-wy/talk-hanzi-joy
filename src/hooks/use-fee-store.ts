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

// Reset cache on auth changes (login/logout/switch)
supabase.auth.onAuthStateChange(() => {
  loadPromise = null;
  feeStore.loadFees();
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
