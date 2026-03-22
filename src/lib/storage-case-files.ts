/**
 * Build a storage object path for the `case-files` bucket.
 * Sanitizes the filename, blocks `..`, caps length, and uses a UUID folder prefix
 * so keys stay valid for Supabase Storage / S3.
 */
export function buildCaseFileObjectPath(file: File): string {
  let safe = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, "_");
  safe = safe.replace(/\.\.+/g, "_").replace(/^\.+|\.+$/g, "");
  if (!safe || /^_+$/.test(safe)) {
    safe = `file_${Date.now()}.bin`;
  }
  const max = 200;
  if (safe.length > max) {
    const extIdx = safe.lastIndexOf(".");
    if (extIdx > 0 && extIdx < safe.length - 1) {
      const ext = safe.slice(extIdx);
      const stem = safe.slice(0, extIdx);
      const budget = max - ext.length;
      safe = `${stem.slice(0, Math.max(1, budget))}${ext}`.slice(0, max);
    } else {
      safe = safe.slice(0, max);
    }
  }
  const folder =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `${folder}/${safe}`;
}
