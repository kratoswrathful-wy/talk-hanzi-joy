import type { Json } from "@/integrations/supabase/types";

/** 禁止出現在 admin_create_case p_payload 的鍵（server 亦會拒絕）。 */
export const ADMIN_CREATE_FORBIDDEN_PAYLOAD_KEYS = [
  "id",
  "env",
  "created_at",
  "created_by",
  "revision",
  "updated_at",
  "login_account",
  "login_password",
  "login_url",
  "other_login_info",
  "tools",
  "question_tools",
  "tool_field_values",
] as const;

export type AdminCreateForbiddenKey = (typeof ADMIN_CREATE_FORBIDDEN_PAYLOAD_KEYS)[number];

const FORBIDDEN_SET = new Set<string>(ADMIN_CREATE_FORBIDDEN_PAYLOAD_KEYS);

export function isAdminCreateForbiddenKey(key: string): key is AdminCreateForbiddenKey {
  return FORBIDDEN_SET.has(key);
}

export function findAdminCreateForbiddenKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).filter((k) => FORBIDDEN_SET.has(k));
}

/**
 * 從 toDb 輸出組裝業務欄位 payload；若含禁止鍵則 throw（不得靜默剝除）。
 * 刪除復原 snapshot 可能含 created_by／id — 須在 toDb 排除後再呼叫。
 */
export function buildAdminCreateRpcPayload(
  dbFields: Record<string, Json | undefined>,
): Record<string, Json> {
  const forbidden = findAdminCreateForbiddenKeys(dbFields);
  if (forbidden.length > 0) {
    throw new Error(
      `admin_create_case payload must not include forbidden keys: ${forbidden.join(", ")}`,
    );
  }
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(dbFields)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}
