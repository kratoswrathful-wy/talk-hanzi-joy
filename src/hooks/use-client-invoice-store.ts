import { useSyncExternalStore, useEffect } from "react";
import { clientInvoiceStore } from "@/stores/client-invoice-store";

/** Hook only ensures load; auth / poll / realtime ownership lives in client-invoice-store. */
function ensureLoaded() {
  void clientInvoiceStore.ensureLoaded();
}

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
