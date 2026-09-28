import { supabase } from "@/integrations/supabase/client";
import {
  INVOICE_INTERNAL_FILES_BUCKET,
  invoiceInternalFilePathFromRef,
  toInvoiceInternalFileRef,
} from "@/lib/invoice-internal-file-refs";
import { buildCaseFilePathWithPrefix } from "@/lib/storage-case-files";

export {
  INVOICE_INTERNAL_FILES_BUCKET,
  INVOICE_INTERNAL_FILE_REF_PREFIX,
  invoiceInternalFilePathFromRef,
  isInvoiceInternalFileRef,
  toInvoiceInternalFileRef,
} from "@/lib/invoice-internal-file-refs";

export async function uploadInvoiceInternalFile(file: File): Promise<{ name: string; url: string } | null> {
  const path = buildCaseFilePathWithPrefix("invoice-internal", file);
  const { error } = await supabase.storage.from(INVOICE_INTERNAL_FILES_BUCKET).upload(path, file);
  if (error) return null;
  return { name: file.name, url: toInvoiceInternalFileRef(path) };
}

export async function resolveInvoiceInternalFileUrl(url: string): Promise<string> {
  const path = invoiceInternalFilePathFromRef(url);
  if (!path) return url;
  const { data, error } = await supabase.storage
    .from(INVOICE_INTERNAL_FILES_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error("無法開啟內部附件");
  }
  return data.signedUrl;
}
