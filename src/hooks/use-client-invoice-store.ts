import { useSyncExternalStore, useEffect } from "react";
import { clientInvoiceStore } from "@/stores/client-invoice-store";
import { supabase } from "@/integrations/supabase/client";

let loadPromise: Promise<any> | null = null;
function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = clientInvoiceStore.loadInvoices();
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "TOKEN_REFRESHED") return;
  loadPromise = null;
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
    loadPromise = clientInvoiceStore.loadInvoices();
  }
});

export function useClientInvoices() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(clientInvoiceStore.subscribe, clientInvoiceStore.getInvoices);
}

export function useClientInvoicesLoaded() {
  return useSyncExternalStore(clientInvoiceStore.subscribe, clientInvoiceStore.isLoaded);
}

export function useClientInvoice(id: string | undefined) {
  const invoices = useClientInvoices();
  return id ? invoices.find((i) => i.id === id) : undefined;
}

export { clientInvoiceStore };
