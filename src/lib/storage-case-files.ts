/**
 * Build ASCII-only object paths for the `case-files` bucket.
 * Supabase Storage rejects many non-ASCII keys ("Invalid key"); callers keep
 * `File.name` for display — only the storage path is normalized here.
 */

const EXT_MAX_LEN = 10;

function randomId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Last path segment after ".", letters and digits only, lowercase, capped length. */
export function asciiStorageExtension(fileName: string): string {
  const raw = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ascii = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, EXT_MAX_LEN).toLowerCase();
  return ascii || "bin";
}

/** Normalize a single path segment: lowercase letters, digits, hyphen only. */
function sanitizePrefixSegment(prefix: string): string {
  const s = prefix.replace(/[^a-z0-9-]/gi, "").replace(/^-+|-+$/g, "");
  return s || "files";
}

/**
 * Random folder + random file id + safe extension (e.g. case attachments).
 */
export function buildCaseFileObjectPath(file: File): string {
  const ext = asciiStorageExtension(file.name);
  return `${randomId()}/${randomId()}.${ext}`;
}

/**
 * Prefixed path under `case-files`, e.g. `editor-files/{uuid}/{uuid}.png`.
 */
export function buildCaseFilePathWithPrefix(prefix: string, file: File): string {
  const safePrefix = sanitizePrefixSegment(prefix);
  const ext = asciiStorageExtension(file.name);
  return `${safePrefix}/${randomId()}/${randomId()}.${ext}`;
}
