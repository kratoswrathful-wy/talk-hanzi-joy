/**
 * Ensures login/register toasts always show readable text (Supabase AuthError may have empty message).
 */
const DEFAULT_MSG = "連線失敗或逾時，請稍後再試";

export function formatLoginError(err: unknown): string {
  if (err == null) return DEFAULT_MSG;
  if (typeof err === "string") {
    const t = err.trim();
    return t || DEFAULT_MSG;
  }
  if (err instanceof Error) {
    const t = err.message?.trim();
    return t || DEFAULT_MSG;
  }
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = String((err as { message?: unknown }).message ?? "").trim();
    return m || DEFAULT_MSG;
  }
  return DEFAULT_MSG;
}
