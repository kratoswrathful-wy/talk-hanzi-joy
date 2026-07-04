import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getEnvironment } from "@/lib/environment";
import type { Json } from "@/integrations/supabase/types";

export interface FieldPermission {
  view: boolean;
  edit: boolean;
}

/** 單一模組在某角色下的權限設定：本區塊可見度＋各項目的檢視／編輯權限 */
export interface ModulePermissionEntry {
  visible?: boolean;
  items?: Record<string, FieldPermission>;
}

/** roleKey → moduleKey → 該模組權限設定 */
export type ModulePermissionsConfig = Record<string, Record<string, ModulePermissionEntry>>;

export interface PermissionConfig {
  fields: Record<string, Record<string, FieldPermission>>;
  settings_sections: Record<string, Record<string, boolean>>;
  custom_roles?: RoleDefinition[];
  role_order?: string[];
  role_label_overrides?: Record<string, string>;
  module_permissions?: ModulePermissionsConfig;
}

export interface RoleDefinition {
  key: string;
  label: string;
  builtIn: boolean;
}

const BUILT_IN_ROLES = ["member", "pm", "executive"];
const BUILT_IN_LABELS: Record<string, string> = {
  member: "譯者",
  pm: "PM",
  executive: "執行官",
};

const DEFAULT_CONFIG: PermissionConfig = {
  fields: {},
  settings_sections: {},
};

function fieldPermissionFromJson(x: Json | undefined): FieldPermission | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  if (typeof x.view !== "boolean" || typeof x.edit !== "boolean") return undefined;
  return { view: x.view, edit: x.edit };
}

function coerceFieldsMap(value: Json | undefined): Record<string, Record<string, FieldPermission>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, FieldPermission>> = {};
  for (const [roleKey, roleVal] of Object.entries(value)) {
    if (!roleVal || typeof roleVal !== "object" || Array.isArray(roleVal)) continue;
    const inner: Record<string, FieldPermission> = {};
    for (const [fieldKey, fieldVal] of Object.entries(roleVal)) {
      const perm = fieldPermissionFromJson(fieldVal);
      if (perm) inner[fieldKey] = perm;
    }
    out[roleKey] = inner;
  }
  return out;
}

function coerceSettingsSections(value: Json | undefined): Record<string, Record<string, boolean>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, boolean>> = {};
  for (const [roleKey, roleVal] of Object.entries(value)) {
    if (!roleVal || typeof roleVal !== "object" || Array.isArray(roleVal)) continue;
    const inner: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(roleVal)) {
      if (typeof v === "boolean") inner[k] = v;
    }
    out[roleKey] = inner;
  }
  return out;
}

function coerceModulePermissions(value: Json | undefined): ModulePermissionsConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: ModulePermissionsConfig = {};
  for (const [roleKey, roleVal] of Object.entries(value)) {
    if (!roleVal || typeof roleVal !== "object" || Array.isArray(roleVal)) continue;
    const modules: Record<string, ModulePermissionEntry> = {};
    for (const [moduleKey, moduleVal] of Object.entries(roleVal)) {
      if (!moduleVal || typeof moduleVal !== "object" || Array.isArray(moduleVal)) continue;
      const entry: ModulePermissionEntry = {};
      if (typeof moduleVal.visible === "boolean") entry.visible = moduleVal.visible;
      const rawItems = moduleVal.items;
      if (rawItems && typeof rawItems === "object" && !Array.isArray(rawItems)) {
        const items: Record<string, FieldPermission> = {};
        for (const [itemKey, itemVal] of Object.entries(rawItems)) {
          const perm = fieldPermissionFromJson(itemVal);
          if (perm) items[itemKey] = perm;
        }
        entry.items = items;
      }
      modules[moduleKey] = entry;
    }
    out[roleKey] = modules;
  }
  return out;
}

function coerceRoleDefinitions(value: Json | undefined): RoleDefinition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: RoleDefinition[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item) && typeof item.key === "string" && typeof item.label === "string" && typeof item.builtIn === "boolean") {
      out.push({ key: item.key, label: item.label, builtIn: item.builtIn });
    }
  }
  return out;
}

function coerceStringArray(value: Json | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) if (typeof item === "string") out.push(item);
  return out;
}

function coerceStringRecord(value: Json | undefined): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
  return out;
}

/** 將 DB jsonb `config` 欄位逐欄位解析為 PermissionConfig（未知或型別不符欄位給預設值，不經 as unknown as）。 */
function coercePermissionConfig(raw: Json | null | undefined): PermissionConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_CONFIG;
  return {
    fields: coerceFieldsMap(raw.fields),
    settings_sections: coerceSettingsSections(raw.settings_sections),
    custom_roles: coerceRoleDefinitions(raw.custom_roles),
    role_order: coerceStringArray(raw.role_order),
    role_label_overrides: coerceStringRecord(raw.role_label_overrides),
    module_permissions: coerceModulePermissions(raw.module_permissions),
  };
}

/** 將 PermissionConfig 轉為 DB jsonb 欄位可接受的 Json：以序列化往返確保結構真正符合 Json。 */
function toJson<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value ?? null));
}

/** Build ordered list of all roles from config */
export function getAllRolesOrdered(config: PermissionConfig): RoleDefinition[] {
  const overrides = config.role_label_overrides || {};
  const builtInRoles: RoleDefinition[] = BUILT_IN_ROLES.map((r) => ({
    key: r,
    label: overrides[r] || BUILT_IN_LABELS[r],
    builtIn: true,
  }));
  const customRoles: RoleDefinition[] = (config.custom_roles || []).map((r) => ({
    ...r,
    label: overrides[r.key] || r.label,
  }));
  const allRolesMap = new Map<string, RoleDefinition>();
  for (const r of [...builtInRoles, ...customRoles]) {
    allRolesMap.set(r.key, r);
  }

  const order = config.role_order;
  if (order && order.length > 0) {
    const ordered: RoleDefinition[] = [];
    for (const key of order) {
      const role = allRolesMap.get(key);
      if (role) {
        ordered.push(role);
        allRolesMap.delete(key);
      }
    }
    // Append any roles not in the order array
    for (const role of allRolesMap.values()) {
      ordered.push(role);
    }
    return ordered;
  }

  return [...builtInRoles, ...customRoles];
}

export function usePermissions() {
  const { primaryRole } = useAuth();
  const [config, setConfig] = useState<PermissionConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const env = getEnvironment();
      const { data, error } = await supabase
        .from("permission_settings")
        .select("config")
        .eq("env", env)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[usePermissions] permission_settings:", error.message);
      }
      if (data?.config) {
        setConfig(coercePermissionConfig(data.config));
      }
    } catch (e) {
      console.error("[usePermissions] fetchConfig:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const canViewField = useCallback(
    (fieldKey: string): boolean => {
      const roleConfig = config.fields[primaryRole];
      if (!roleConfig || !roleConfig[fieldKey]) return true;
      return roleConfig[fieldKey].view;
    },
    [config, primaryRole]
  );

  const canEditField = useCallback(
    (fieldKey: string): boolean => {
      const roleConfig = config.fields[primaryRole];
      if (!roleConfig || !roleConfig[fieldKey]) return false;
      return roleConfig[fieldKey].edit;
    },
    [config, primaryRole]
  );

  const canViewSection = useCallback(
    (sectionKey: string): boolean => {
      const roleConfig = config.settings_sections[primaryRole];
      if (!roleConfig) return false;
      return roleConfig[sectionKey] ?? false;
    },
    [config, primaryRole]
  );

  const updateConfig = useCallback(
    async (newConfig: PermissionConfig) => {
      const env = getEnvironment();
      const { data: existing } = await supabase
        .from("permission_settings")
        .select("id")
        .eq("env", env)
        .limit(1)
        .single();

      let error;
      if (existing) {
        ({ error } = await supabase
          .from("permission_settings")
          .update({ config: toJson(newConfig), updated_at: new Date().toISOString() })
          .eq("id", existing.id));
      } else {
        ({ error } = await supabase
          .from("permission_settings")
          .insert({ config: toJson(newConfig), env }));
      }

      if (!error) {
        setConfig(newConfig);
      }
      return error;
    },
    []
  );

  const allRoles = getAllRolesOrdered(config);

  const checkPerm = useCallback((moduleKey: string, itemKey: string, permType: "view" | "edit"): boolean => {
    const modulePerms = config.module_permissions?.[primaryRole]?.[moduleKey];
    if (!modulePerms) {
      // Default restrictions for new modules when no explicit config exists
      // 客戶請款 & 團隊成員: PM+ only (member cannot view)
      if ((moduleKey === "client_invoices" || moduleKey === "team_members") && primaryRole === "member") return false;
      // 工具管理 & 內部資料: PM+ only
      if ((moduleKey === "tool_management" || moduleKey === "field_reference") && primaryRole === "member") return false;
      // 內部註記: executive only by default
      if (moduleKey === "internal_notes" && primaryRole !== "executive") return false;
      // 權限管理: executive only
      if (moduleKey === "permissions" && primaryRole !== "executive") return false;
      // 案件管理 - 本案費用區塊: member 預設限制
      if (moduleKey === "case_management" && primaryRole === "member") {
        const memberRestrictedItems = ["case_fee_generate_button", "case_fee_warning", "case_fee_badges", "case_detail_client", "case_detail_contact", "case_detail_keyword", "case_draft_publish_prompt"];
        if (memberRestrictedItems.includes(itemKey)) return false;
      }
      // 費用管理 - 列表欄位：member 預設限制
      if (moduleKey === "fee_management" && primaryRole === "member") {
        if (itemKey === "table_field_clientInvoiceStatus" || itemKey === "fee_list_batchFinalize") return false;
      }
      return true;
    }
    if (!modulePerms.visible) return false;
    const itemPerm = modulePerms.items?.[itemKey];
    if (!itemPerm) {
      // Same member defaults even when module has partial config
      if (moduleKey === "case_management" && primaryRole === "member") {
        const memberRestrictedItems = ["case_fee_generate_button", "case_fee_warning", "case_fee_badges", "case_detail_client", "case_detail_contact", "case_detail_keyword", "case_draft_publish_prompt"];
        if (memberRestrictedItems.includes(itemKey)) return false;
      }
      if (moduleKey === "fee_management" && primaryRole === "member" && itemKey === "fee_list_batchFinalize") return false;
      return true;
    }
    return itemPerm[permType] ?? true;
  }, [config, primaryRole]);

  return {
    config,
    loading,
    canViewField,
    canEditField,
    canViewSection,
    updateConfig,
    refetch: fetchConfig,
    allRoles,
    checkPerm,
  };
}
