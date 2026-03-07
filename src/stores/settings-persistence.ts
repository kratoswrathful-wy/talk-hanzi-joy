import { supabase } from "@/integrations/supabase/client";

/** Debounced save to app_settings table */
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export async function loadSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[settings] Failed to load "${key}":`, error.message);
    return null;
  }
  return data?.value as T | null;
}

export function saveSetting(key: string, value: unknown, debounceMs = 500) {
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // not logged in

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key, value: value as any, updated_by: user.id },
        { onConflict: "key" }
      );

    if (error) {
      console.error(`[settings] Failed to save "${key}":`, error.message);
    }
  }, debounceMs);
}
