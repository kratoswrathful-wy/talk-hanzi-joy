import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface FieldPermission {
  view: boolean;
  edit: boolean;
}

export interface PermissionConfig {
  fields: Record<string, Record<string, FieldPermission>>;
  settings_sections: Record<string, Record<string, boolean>>;
}

const DEFAULT_CONFIG: PermissionConfig = {
  fields: {},
  settings_sections: {},
};

export function usePermissions() {
  const { primaryRole } = useAuth();
  const [config, setConfig] = useState<PermissionConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase
      .from("permission_settings")
      .select("config")
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
      if (!roleConfig || !roleConfig[fieldKey]) return true; // default: visible
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
      const { error } = await supabase
        .from("permission_settings")
        .update({ config: newConfig as any, updated_at: new Date().toISOString() })
        .not("id", "is", null); // update all rows (should be just 1)
      if (!error) {
        setConfig(newConfig);
      }
      return error;
    },
    []
  );

  return {
    config,
    loading,
    canViewField,
    canEditField,
    canViewSection,
    updateConfig,
    refetch: fetchConfig,
  };
}
