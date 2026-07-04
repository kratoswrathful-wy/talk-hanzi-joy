/**
 * CAT AI Model Registry Phase 2：server-only 授權 helper。
 *
 * 只能在 Vercel serverless（api/**）呼叫，絕不可被前端 bundle 引用：
 * 使用 SUPABASE_SERVICE_ROLE_KEY 建立 admin client，用來驗證呼叫者 JWT 並查 DB user_roles。
 *
 * 規則（不可更動）：
 *   - 不信任任何前端傳來的角色字串（_tmsRole / role / userId 等）——一律以 JWT → auth.getUser() → DB user_roles 為準。
 *   - 多列 role 使用者用 .some(role === 'executive') 判斷，不用 .single()（避免誤判）。
 *   - 不用 is_admin()（pm 也會通過），本次僅 executive 可執行 sync。
 *   - 絕不把 JWT、service role key、OpenAI key 寫進回傳值或 log。
 */

import { createClient } from "@supabase/supabase-js";

/**
 * @returns {{ url: string, serviceRoleKey: string } | null} 缺任一項回傳 null。
 */
export function readSupabaseServerConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function extractBearerToken(req) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * 驗證請求為已登入 executive。
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<
 *   | { ok: true, userId: string, supabaseAdmin: import('@supabase/supabase-js').SupabaseClient }
 *   | { ok: false, error: "server_missing_supabase_config" | "unauthorized" | "forbidden" }
 * >}
 */
export async function requireExecutive(req) {
  const config = readSupabaseServerConfig();
  if (!config) {
    return { ok: false, error: "server_missing_supabase_config" };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, error: "unauthorized" };
  }

  const supabaseAdmin = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) {
      return { ok: false, error: "unauthorized" };
    }
    userId = data.user.id;
  } catch {
    return { ok: false, error: "unauthorized" };
  }

  let roleRows;
  try {
    const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (error) {
      return { ok: false, error: "unauthorized" };
    }
    roleRows = data ?? [];
  } catch {
    return { ok: false, error: "unauthorized" };
  }

  const isExecutive = roleRows.some((r) => r.role === "executive");
  if (!isExecutive) {
    return { ok: false, error: "forbidden" };
  }

  return { ok: true, userId, supabaseAdmin };
}
