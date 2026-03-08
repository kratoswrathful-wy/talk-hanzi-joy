import { useSyncExternalStore, useEffect } from "react";
import { invoiceStore } from "@/stores/invoice-store";
import { supabase } from "@/integrations/supabase/client";

let loadPromise: Promise<any> | null = null;
function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = invoiceStore.loadInvoices();
  }
}

// Reset cache on auth changes (login/logout/switch)
supabase.auth.onAuthStateChange(() => {
  loadPromise = null;
  invoiceStore.loadInvoices();
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
