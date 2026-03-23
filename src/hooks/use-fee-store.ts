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

// fee-store handles TOKEN_REFRESHED with background reload only (avoids loaded=false storms)
supabase.auth.onAuthStateChange((event) => {
  if (event === "TOKEN_REFRESHED") return;
  loadPromise = null;
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    loadPromise = new Promise((resolve) => setTimeout(resolve, 100)).then(() => feeStore.loadFees());
  }
});

export function useFees() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(feeStore.subscribe, feeStore.getFees);
}

export function useFeesLoaded() {
  return useSyncExternalStore(feeStore.subscribe, feeStore.isLoaded);
}

export function useFee(id: string | undefined) {
  const fees = useFees();
  return id ? fees.find((f) => f.id === id) : undefined;
}

export { feeStore };
