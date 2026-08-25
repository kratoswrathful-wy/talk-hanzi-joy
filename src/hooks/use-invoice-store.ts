import { useSyncExternalStore, useEffect } from "react";
import { invoiceStore } from "@/stores/invoice-store";

/** Hook only ensures load; auth / poll / realtime ownership lives in invoice-store. */
function ensureLoaded() {
  void invoiceStore.ensureLoaded();
}

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
