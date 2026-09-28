export const INVOICE_INTERNAL_FILES_BUCKET = "invoice-internal-files";
export const INVOICE_INTERNAL_FILE_REF_PREFIX = "invoice-internal:";

export function isInvoiceInternalFileRef(url: string): boolean {
  return url.startsWith(INVOICE_INTERNAL_FILE_REF_PREFIX);
}

export function invoiceInternalFilePathFromRef(url: string): string | null {
  if (!isInvoiceInternalFileRef(url)) return null;
  const path = url.slice(INVOICE_INTERNAL_FILE_REF_PREFIX.length);
  return path.length > 0 ? path : null;
}

export function toInvoiceInternalFileRef(path: string): string {
  return `${INVOICE_INTERNAL_FILE_REF_PREFIX}${path}`;
}
