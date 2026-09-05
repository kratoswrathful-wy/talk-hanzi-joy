/**
 * 維護寫入閘門：以呼叫者 JWT 查 maintenance_write_gate。
 * 不得以 service_role 略過；不得把所有 service_role 當安全例外。
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "./cors.ts";

export type MaintenanceGateResult = {
  ok: boolean;
  enabled: boolean;
  allowed: boolean;
  error?: string | null;
};

async function readMaintenanceGate(
  jwt: string,
): Promise<{ gate: MaintenanceGateResult | null; rpcError: string | null }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { gate: null, rpcError: "server_misconfigured" };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await userClient.rpc("maintenance_write_gate");
  if (error) {
    console.error("maintenance_write_gate rpc failed", error.message);
    return { gate: null, rpcError: error.message };
  }
  return { gate: data as MaintenanceGateResult, rpcError: null };
}

/**
 * G2-9 必要路徑（oauth start／callback／disconnect）：
 * 維護關閉→放行；維護開啟→僅 allowlist。
 * 閘門 RPC 失敗→503（不可誤判為可寫入）。
 */
export async function enforceMaintenanceWriteGate(
  jwt: string,
): Promise<Response | null> {
  const { gate, rpcError } = await readMaintenanceGate(jwt);
  if (rpcError === "server_misconfigured") {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (rpcError || !gate) {
    return new Response(
      JSON.stringify({
        error: "maintenance_gate_unavailable",
        message: "無法確認維護寫入閘門，拒絕繼續",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (gate.enabled === true && gate.allowed !== true) {
    return new Response(
      JSON.stringify({
        error: "maintenance_write_denied",
        message: "維護驗收中，僅允許指定操作／測試帳號",
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}

/**
 * 非 G2-9 必要路徑：維護一啟用即拒絕（含 allowlist 操作者）。
 */
export async function rejectWhenMaintenanceEnabled(
  jwt: string,
): Promise<Response | null> {
  const { gate, rpcError } = await readMaintenanceGate(jwt);
  if (rpcError === "server_misconfigured") {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (rpcError || !gate) {
    return new Response(
      JSON.stringify({
        error: "maintenance_gate_unavailable",
        message: "無法確認維護寫入閘門，拒絕繼續",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (gate.enabled === true) {
    return new Response(
      JSON.stringify({
        error: "maintenance_path_blocked",
        message: "維護期間停用此 Edge 路徑",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}
