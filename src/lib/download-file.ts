/**
 * Trigger a browser download with a chosen filename.
 * Use for cross-origin URLs (e.g. Supabase Storage public URLs) where <a download> is ignored.
 */
export function sanitizeDownloadFileName(name: string): string {
  const trimmed = name.trim() || "download";
  return trimmed.replace(/[/\\?%*:|"<>]/g, "_");
}

export async function downloadFile(url: string, fileName: string): Promise<void> {
  const safeName = sanitizeDownloadFileName(fileName);
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    throw new Error(`無法取得檔案（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = safeName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
