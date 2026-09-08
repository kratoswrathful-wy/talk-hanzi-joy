/**
 * 維護寫入閘門：以呼叫者 JWT 查 maintenance_write_gate。
 * 不得以 service_role 略過；不得把所有 service_role 當安全例外。
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "./cors.ts";
import {
  decideEnforceMaintenanceWriteGate,
  decideRejectWhenMaintenanceEnabled,
  type MaintenanceGateResult,
} from "./maintenance-gate-policy.ts";

export type { MaintenanceGateResult };

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

function decisionToResponse(
  decision: ReturnType<typeof decideEnforceMaintenanceWriteGate>,
  denyMessage: string,
): Response | null {
  if (decision.action === "allow") return null;
  const body =
    decision.action === "deny"
      ? { error: decision.error, message: denyMessage }
      : {
          error: decision.error,
          message:
            decision.action === "misconfigured"
              ? "server_misconfigured"
              : "無法確認維護寫入閘門，拒絕繼續",
        };
  return new Response(JSON.stringify(body), {
    status: decision.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  return decisionToResponse(
    decideEnforceMaintenanceWriteGate(gate, rpcError),
    "維護驗收中，僅允許指定操作／測試帳號",
  );
}

/**
 * 非 G2-9 必要路徑：維護一啟用即拒絕（含 allowlist 操作者）。
 */
export async function rejectWhenMaintenanceEnabled(
  jwt: string,
): Promise<Response | null> {
  const { gate, rpcError } = await readMaintenanceGate(jwt);
  return decisionToResponse(
    decideRejectWhenMaintenanceEnabled(gate, rpcError),
    "維護期間停用此 Edge 路徑",
  );
}
