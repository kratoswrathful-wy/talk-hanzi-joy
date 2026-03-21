import { supabase } from "@/integrations/supabase/client";

/**
 * 取得可用於 Edge Functions（verify_jwt）的 access token。
 * 先 refresh 再取 token，避免 access 已過期仍送出而得到 401（與 React state 是否同步無關）。
 */
export async function getAccessTokenForEdgeFunctions(): Promise<string | null> {
  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (refreshed.session?.access_token) {
    return refreshed.session.access_token;
  }
  if (error) {
    console.warn("[auth] refreshSession:", error.message);
  }
  const { data: fallback } = await supabase.auth.getSession();
  return fallback.session?.access_token ?? null;
}
