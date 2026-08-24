import { supabase } from "@/integrations/supabase/client";
import { envKey } from "@/lib/environment";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import type { Json } from "@/integrations/supabase/types";

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const loadedKeys = new Set<string>();
const dirtyKeys = new Set<string>();

export function isSettingLoaded(key: string): boolean {
  return loadedKeys.has(key);
}

export function markSettingLoaded(key: string) {
  loadedKeys.add(key);
}

export function markDirty(key: string) {
  dirtyKeys.add(key);
}

/**
 * Session teardown (sign-out / user switch): clear load flags and cancel pending saves.
 * Do NOT call this for ordinary reloads — that would drop in-flight setting writes.
 */
export function resetLoadedKeys() {
  loadedKeys.clear();
  dirtyKeys.clear();
  for (const key of Object.keys(saveTimers)) {
    clearTimeout(saveTimers[key]);
    delete saveTimers[key];
  }
}

/**
 * Soft reload: clear only load flags so stores re-fetch, without cancelling save timers.
 * Pending dirty saves continue; after reload completes, loadSetting will re-mark loaded/dirty.
 */
export function clearLoadedFlagsOnly() {
  loadedKeys.clear();
}

export async function loadSetting<T>(key: string): Promise<T | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

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

  if (data?.value != null) {
    markSettingLoaded(key);
    dirtyKeys.add(key);
    return data.value as T;
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  markSettingLoaded(key);

  if (legacyError || !legacyData?.value) {
    return null;
  }

  dirtyKeys.add(key);
  return legacyData.value as T;
}

export function saveSetting(key: string, value: unknown, debounceMs = 500) {
  if (!isSettingLoaded(key) || !dirtyKeys.has(key)) return;

  const dbKey = envKey(key);

  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(async () => {
    const user = await getAuthenticatedUser();
    if (!user) return;

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: dbKey, value: value as Json, updated_by: user.id },
        { onConflict: "key" }
      );

    if (error && !error.message.includes("row-level security")) {
      console.error(`[settings] Failed to save "${dbKey}":`, error.message);
    }
  }, debounceMs);
}
