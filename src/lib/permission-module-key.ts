/**
 * PermissionsPage 以單數 module key 為 canonical（DB runtime 設定亦然）。
 * 列表／路由若仍傳複數別名，查權限前先正規化，並在讀 config 時相容複數鍵。
 */
const PLURAL_TO_SINGULAR: Record<string, string> = {
  translator_invoices: "translator_invoice",
  client_invoices: "client_invoice",
};

const SINGULAR_TO_PLURAL: Record<string, string> = {
  translator_invoice: "translator_invoices",
  client_invoice: "client_invoices",
};

export function canonicalizePermissionModuleKey(moduleKey: string): string {
  return PLURAL_TO_SINGULAR[moduleKey] ?? moduleKey;
}

/** Config lookup keys to try (canonical first, then legacy plural). */
export function permissionModuleKeyLookupOrder(moduleKey: string): string[] {
  const canonical = canonicalizePermissionModuleKey(moduleKey);
  const plural = SINGULAR_TO_PLURAL[canonical];
  if (plural && plural !== canonical) return [canonical, plural];
  return [canonical];
}
