import { useSyncExternalStore, useEffect } from "react";
import { invoiceStore } from "@/stores/invoice-store";

let loadPromise: Promise<any> | null = null;
function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = invoiceStore.loadInvoices();
  }
}

export function useInvoices() {
  useEffect(() => { ensureLoaded(); }, []);
  return useSyncExternalStore(invoiceStore.subscribe, invoiceStore.getInvoices);
}

export function useInvoice(id: string | undefined) {
  const invoices = useInvoices();
  return id ? invoices.find((i) => i.id === id) : undefined;
}

export { invoiceStore };
