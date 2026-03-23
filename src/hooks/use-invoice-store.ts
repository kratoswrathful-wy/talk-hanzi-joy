import { useSyncExternalStore, useEffect } from "react";
import { invoiceStore } from "@/stores/invoice-store";
import { supabase } from "@/integrations/supabase/client";

let loadPromise: Promise<any> | null = null;
function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = invoiceStore.loadInvoices();
  }
}

// invoice-store handles TOKEN_REFRESHED with background reload only
supabase.auth.onAuthStateChange((event) => {
  if (event === "TOKEN_REFRESHED") return;
  loadPromise = null;
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
    loadPromise = invoiceStore.loadInvoices();
  }
});

export function useInvoices() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(invoiceStore.subscribe, invoiceStore.getInvoices);
}

export function useInvoicesLoaded() {
  return useSyncExternalStore(invoiceStore.subscribe, invoiceStore.isLoaded);
}

export function useInvoice(id: string | undefined) {
  const invoices = useInvoices();
  return id ? invoices.find((i) => i.id === id) : undefined;
}

export { invoiceStore };
