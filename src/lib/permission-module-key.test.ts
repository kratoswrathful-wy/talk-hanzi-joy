import { describe, expect, it } from "vitest";
import {
  canonicalizePermissionModuleKey,
  permissionModuleKeyLookupOrder,
} from "./permission-module-key";

describe("permission-module-key", () => {
  it("maps plural list/route keys to PermissionsPage singular", () => {
    expect(canonicalizePermissionModuleKey("translator_invoices")).toBe("translator_invoice");
    expect(canonicalizePermissionModuleKey("client_invoices")).toBe("client_invoice");
  });

  it("leaves singular and unrelated keys unchanged", () => {
    expect(canonicalizePermissionModuleKey("translator_invoice")).toBe("translator_invoice");
    expect(canonicalizePermissionModuleKey("fee_management")).toBe("fee_management");
  });

  it("lookup order tries singular then plural for compat", () => {
    expect(permissionModuleKeyLookupOrder("client_invoices")).toEqual([
      "client_invoice",
      "client_invoices",
    ]);
    expect(permissionModuleKeyLookupOrder("client_invoice")).toEqual([
      "client_invoice",
      "client_invoices",
    ]);
  });
});
