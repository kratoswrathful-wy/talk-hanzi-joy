import { supabase } from "@/integrations/supabase/client";

/** Debounced save to app_settings table */
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Track which keys have been loaded from DB to prevent overwriting before load */
const loadedKeys = new Set<string>();

export function isSettingLoaded(key: string): boolean {
  return loadedKeys.has(key);
}

export function markSettingLoaded(key: string) {
  loadedKeys.add(key);
}

export function resetLoadedKeys() {
  loadedKeys.clear();
  // Also cancel any pending saves
  for (const key of Object.keys(saveTimers)) {
    clearTimeout(saveTimers[key]);
    delete saveTimers[key];
  }
}

export async function loadSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[settings] Failed to load "${key}":`, error.message);
    // Still mark as loaded so the app can function with defaults
    markSettingLoaded(key);
    return null;
  }

  markSettingLoaded(key);
  return data?.value as T | null;
}

export function saveSetting(key: string, value: unknown, debounceMs = 500) {
  // CRITICAL: Don't save until initial load from DB has completed
  // This prevents hardcoded defaults from overwriting production data
  if (!isSettingLoaded(key)) return;

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
      // RLS will block non-admin writes – this is expected, not an error for non-admins
      if (!error.message.includes("row-level security")) {
        console.error(`[settings] Failed to save "${key}":`, error.message);
      }
    }
  }, debounceMs);
}
