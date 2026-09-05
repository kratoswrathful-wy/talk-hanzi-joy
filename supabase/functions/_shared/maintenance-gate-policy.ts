/**
 * 純決策邏輯（無 Deno／網路）：供 Vitest 與 Edge maintenance-gate 共用。
 */
export type MaintenanceGateResult = {
  ok?: boolean;
  enabled?: boolean;
  allowed?: boolean;
  error?: string | null;
};

export type GateDecision =
  | { action: "allow" }
  | { action: "deny"; error: string; status: number }
  | { action: "unavailable"; error: string; status: number }
  | { action: "misconfigured"; error: string; status: number };

function isObjectGate(gate: unknown): gate is MaintenanceGateResult {
  return gate !== null && typeof gate === "object" && !Array.isArray(gate);
}

/** G2-9 必要路徑：維護關→放行；維護開→僅 allowed。RPC 失敗／非法回應→不可用。 */
export function decideEnforceMaintenanceWriteGate(
  gate: unknown,
  rpcError: string | null,
): GateDecision {
  if (rpcError === "server_misconfigured") {
    return { action: "misconfigured", error: "server_misconfigured", status: 500 };
  }
  if (rpcError || !isObjectGate(gate)) {
    return {
      action: "unavailable",
      error: "maintenance_gate_unavailable",
      status: 503,
    };
  }
  if (typeof gate.enabled !== "boolean" || typeof gate.allowed !== "boolean") {
    return {
      action: "unavailable",
      error: "maintenance_gate_unavailable",
      status: 503,
    };
  }
  if (gate.enabled === true && gate.allowed !== true) {
    return { action: "deny", error: "maintenance_write_denied", status: 403 };
  }
  return { action: "allow" };
}

/** 非必要路徑：維護一啟用即拒（含 allowlist）。 */
export function decideRejectWhenMaintenanceEnabled(
  gate: unknown,
  rpcError: string | null,
): GateDecision {
  if (rpcError === "server_misconfigured") {
    return { action: "misconfigured", error: "server_misconfigured", status: 500 };
  }
  if (rpcError || !isObjectGate(gate)) {
    return {
      action: "unavailable",
      error: "maintenance_gate_unavailable",
      status: 503,
    };
  }
  if (typeof gate.enabled !== "boolean") {
    return {
      action: "unavailable",
      error: "maintenance_gate_unavailable",
      status: 503,
    };
  }
  if (gate.enabled === true) {
    return { action: "deny", error: "maintenance_path_blocked", status: 503 };
  }
  return { action: "allow" };
}
