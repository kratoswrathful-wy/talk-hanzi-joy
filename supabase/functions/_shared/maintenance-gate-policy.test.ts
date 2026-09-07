import { describe, expect, it } from "vitest";
import {
  decideEnforceMaintenanceWriteGate,
  decideRejectWhenMaintenanceEnabled,
} from "./maintenance-gate-policy";

describe("decideEnforceMaintenanceWriteGate", () => {
  it("allows when maintenance disabled", () => {
    expect(
      decideEnforceMaintenanceWriteGate(
        { ok: true, enabled: false, allowed: true },
        null,
      ),
    ).toEqual({ action: "allow" });
  });

  it("allows when enabled and allowed", () => {
    expect(
      decideEnforceMaintenanceWriteGate(
        { ok: true, enabled: true, allowed: true },
        null,
      ),
    ).toEqual({ action: "allow" });
  });

  it("denies when enabled and not allowed", () => {
    expect(
      decideEnforceMaintenanceWriteGate(
        { ok: false, enabled: true, allowed: false, error: "maintenance_write_denied" },
        null,
      ),
    ).toEqual({
      action: "deny",
      error: "maintenance_write_denied",
      status: 403,
    });
  });

  it("returns unavailable on rpc failure (must not treat as open)", () => {
    expect(decideEnforceMaintenanceWriteGate(null, "connection refused")).toEqual({
      action: "unavailable",
      error: "maintenance_gate_unavailable",
      status: 503,
    });
  });

  it("returns unavailable on invalid payload", () => {
    expect(decideEnforceMaintenanceWriteGate({ enabled: true }, null)).toEqual({
      action: "unavailable",
      error: "maintenance_gate_unavailable",
      status: 503,
    });
    expect(decideEnforceMaintenanceWriteGate("yes", null).action).toBe("unavailable");
  });

  it("returns misconfigured when server env missing", () => {
    expect(decideEnforceMaintenanceWriteGate(null, "server_misconfigured")).toEqual({
      action: "misconfigured",
      error: "server_misconfigured",
      status: 500,
    });
  });
});

describe("decideRejectWhenMaintenanceEnabled", () => {
  it("allows when disabled", () => {
    expect(
      decideRejectWhenMaintenanceEnabled(
        { ok: true, enabled: false, allowed: true },
        null,
      ),
    ).toEqual({ action: "allow" });
  });

  it("blocks even allowlisted when enabled", () => {
    expect(
      decideRejectWhenMaintenanceEnabled(
        { ok: true, enabled: true, allowed: true },
        null,
      ),
    ).toEqual({
      action: "deny",
      error: "maintenance_path_blocked",
      status: 503,
    });
  });

  it("returns unavailable on rpc failure", () => {
    expect(decideRejectWhenMaintenanceEnabled(null, "timeout")).toEqual({
      action: "unavailable",
      error: "maintenance_gate_unavailable",
      status: 503,
    });
  });
});
