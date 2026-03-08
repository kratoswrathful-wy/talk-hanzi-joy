import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getEnvironment } from "@/lib/environment";

export interface FieldPermission {
  view: boolean;
  edit: boolean;
}

export interface PermissionConfig {
  fields: Record<string, Record<string, FieldPermission>>;
  settings_sections: Record<string, Record<string, boolean>>;
  custom_roles?: RoleDefinition[];
  role_order?: string[];
  role_label_overrides?: Record<string, string>;
  module_permissions?: any;
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
    const env = getEnvironment();
    const { data } = await supabase
      .from("permission_settings")
      .select("config")
      .eq("env" as any, env)
      .limit(1)
      .single();
    if (data?.config) {
      setConfig(data.config as unknown as PermissionConfig);
    }
    setLoading(false);
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
      const { data: existing } = await (supabase
        .from("permission_settings")
        .select("id") as any)
        .eq("env", env)
        .limit(1)
        .single();

      let error;
      if (existing) {
        ({ error } = await supabase
          .from("permission_settings")
          .update({ config: newConfig as any, updated_at: new Date().toISOString() })
          .eq("id", existing.id));
      } else {
        ({ error } = await supabase
          .from("permission_settings")
          .insert({ config: newConfig as any, env } as any));
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
    const modulePerms = (config as any)?.module_permissions?.[primaryRole]?.[moduleKey];
    if (!modulePerms) return true;
    if (!modulePerms.visible) return false;
    const itemPerm = modulePerms.items?.[itemKey];
    if (!itemPerm) return true;
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
