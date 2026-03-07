import { supabase } from "@/integrations/supabase/client";
import { envKey } from "@/lib/environment";

/** Debounced save to app_settings table */
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Track which keys have been loaded from DB (load attempted) */
const loadedKeys = new Set<string>();

/** Track which keys have been explicitly mutated by user actions.
 *  CRITICAL: Only dirty keys are saved to DB, preventing hardcoded
 *  defaults from overwriting production data on app init / publish. */
const dirtyKeys = new Set<string>();

export function isSettingLoaded(key: string): boolean {
  return loadedKeys.has(key);
}

export function markSettingLoaded(key: string) {
  loadedKeys.add(key);
}

/** Mark a key as user-mutated so it can be saved */
export function markDirty(key: string) {
  dirtyKeys.add(key);
}

export function resetLoadedKeys() {
  loadedKeys.clear();
  dirtyKeys.clear();
  // Also cancel any pending saves
  for (const key of Object.keys(saveTimers)) {
    clearTimeout(saveTimers[key]);
    delete saveTimers[key];
  }
}

/**
 * Load a setting from DB using environment-prefixed key.
 * e.g. "select_options" → "test:select_options" or "production:select_options"
 */
export async function loadSetting<T>(key: string): Promise<T | null> {
  const dbKey = envKey(key);

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", dbKey)
    .maybeSingle();

  if (error) {
    console.error(`[settings] Failed to load "${dbKey}":`, error.message);
    markSettingLoaded(key);
    return null;
  }

  // If found under env-prefixed key, use it
  if (data?.value != null) {
    markSettingLoaded(key);
    dirtyKeys.add(key);
    return data.value as T;
  }

  // Backward compatibility: try non-prefixed key (legacy data)
  const { data: legacyData, error: legacyError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  markSettingLoaded(key);

  if (legacyError || !legacyData?.value) {
    return null;
  }

  // Found legacy data — mark dirty so it will be saved under the prefixed key
  dirtyKeys.add(key);
  return legacyData.value as T;
}

/**
 * Save a setting to DB using environment-prefixed key.
 * Only saves if the key has been loaded AND marked dirty.
 */
export function saveSetting(key: string, value: unknown, debounceMs = 500) {
  // CRITICAL: Don't save until initial load from DB has completed
  // AND the key has been explicitly mutated by user action (dirty).
  if (!isSettingLoaded(key) || !dirtyKeys.has(key)) return;

  const dbKey = envKey(key);

  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // not logged in

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: dbKey, value: value as any, updated_by: user.id },
        { onConflict: "key" }
      );

    if (error) {
      // RLS will block non-admin writes – this is expected, not an error for non-admins
      if (!error.message.includes("row-level security")) {
        console.error(`[settings] Failed to save "${dbKey}":`, error.message);
      }
    }
  }, debounceMs);
}
