import { supabase } from "@/integrations/supabase/client";
import { selectOptionsStore } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { labelStyleStore } from "@/stores/label-style-store";
import { toolTemplateStore } from "@/stores/tool-template-store";
import { pageTemplateStore } from "@/stores/page-template-store";
import { commonLinksStore } from "@/stores/common-links-store";
import { currencyStore } from "@/stores/currency-store";
import { uiButtonStyleStore } from "@/stores/ui-button-style-store";
import { clearLoadedFlagsOnly, resetLoadedKeys } from "@/stores/settings-persistence";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import {
  parseSettingsLogicalKey,
  type SettingsLogicalKey,
} from "@/stores/settings-key-map";

let loaded = false;
let loadPromise: Promise<void> | null = null;
let loadGeneration = 0;
let currentUserId: string | null = null;

const settingsKeyReloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
let assigneesReloadTimer: ReturnType<typeof setTimeout> | null = null;
let fullReloadTimer: ReturnType<typeof setTimeout> | null = null;

type SettingReloader = () => Promise<void>;

const SETTING_RELOADERS: Record<SettingsLogicalKey, SettingReloader> = {
  select_options: () => selectOptionsStore.loadSettings(),
  default_pricing: () => defaultPricingStore.loadSettings(),
  label_styles: () => labelStyleStore.loadSettings(),
  tool_templates: () => toolTemplateStore.loadSettings(),
  page_templates: () => pageTemplateStore.loadSettings(),
  common_links: () => commonLinksStore.loadSettings(),
  currencies: () => currencyStore.loadSettings(),
  ui_button_styles: () => uiButtonStyleStore.loadSettings(),
};

async function reloadAllSettingStores(): Promise<void> {
  // Soft reload: do not cancel pending saveSetting timers.
  clearLoadedFlagsOnly();
  await Promise.all([
    selectOptionsStore.loadSettings(),
    defaultPricingStore.loadSettings(),
    labelStyleStore.loadSettings(),
    toolTemplateStore.loadSettings(),
    pageTemplateStore.loadSettings(),
    commonLinksStore.loadSettings(),
    currencyStore.loadSettings(),
    uiButtonStyleStore.loadSettings(),
  ]);
}

async function runFullSettingsLoad(userId: string, generation: number): Promise<void> {
  const user = await getAuthenticatedUser();
  if (generation !== loadGeneration || currentUserId !== userId) return;
  if (!user || user.id !== userId) {
    loaded = false;
    return;
  }

  await reloadAllSettingStores();
  if (generation !== loadGeneration || currentUserId !== userId) return;

  void selectOptionsStore.loadAssignees().catch((e) =>
    console.error("[settings-init] loadAssignees", e)
  );

  loaded = true;
}

/**
 * Sole entry that may start a full settings load for the current session.
 * Concurrent callers share the same in-flight Promise.
 */
async function ensureLoaded(): Promise<void> {
  if (loaded && !loadPromise) return;

  const user = await getAuthenticatedUser();
  if (!user) {
    loaded = false;
    currentUserId = null;
    return;
  }

  if (loaded && currentUserId === user.id && !loadPromise) return;

  if (loadPromise && currentUserId === user.id) {
    await loadPromise;
    return;
  }

  const generation = ++loadGeneration;
  currentUserId = user.id;
  loaded = false;

  loadPromise = (async () => {
    try {
      await runFullSettingsLoad(user.id, generation);
    } catch (e) {
      console.error("[settings-init] full load failed", e);
      if (generation === loadGeneration) {
        loaded = false;
      }
    } finally {
      if (generation === loadGeneration) {
        loadPromise = null;
      }
    }
  })();

  await loadPromise;
}

function resetSessionState(): void {
  loadGeneration += 1;
  loadPromise = null;
  loaded = false;
  currentUserId = null;
  resetLoadedKeys();
  for (const timer of settingsKeyReloadTimers.values()) clearTimeout(timer);
  settingsKeyReloadTimers.clear();
  if (assigneesReloadTimer) clearTimeout(assigneesReloadTimer);
  assigneesReloadTimer = null;
  if (fullReloadTimer) clearTimeout(fullReloadTimer);
  fullReloadTimer = null;
}

function scheduleSettingKeyReload(logicalKey: SettingsLogicalKey): void {
  const existing = settingsKeyReloadTimers.get(logicalKey);
  if (existing) clearTimeout(existing);
  settingsKeyReloadTimers.set(
    logicalKey,
    setTimeout(() => {
      settingsKeyReloadTimers.delete(logicalKey);
      if (!loaded && !loadPromise) return;
      void SETTING_RELOADERS[logicalKey]().catch((e) =>
        console.error(`[settings-init] reload ${logicalKey}`, e)
      );
    }, 300)
  );
}

function scheduleUnknownKeyFullReload(rawKey: string): void {
  console.warn("[settings-init] unknown app_settings key; scheduling soft full reload:", rawKey);
  if (fullReloadTimer) clearTimeout(fullReloadTimer);
  fullReloadTimer = setTimeout(() => {
    fullReloadTimer = null;
    if (!loaded && !loadPromise) return;
    // Soft full reload of setting stores only — never loadAssignees here.
    void reloadAllSettingStores().catch((e) =>
      console.error("[settings-init] unknown-key full reload", e)
    );
  }, 300);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED") {
    return;
  }

  const nextUserId = session?.user?.id ?? null;

  if (!session || event === "SIGNED_OUT") {
    resetSessionState();
    return;
  }

  if (
    (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
    loaded &&
    currentUserId &&
    nextUserId &&
    currentUserId === nextUserId
  ) {
    return;
  }

  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    if (currentUserId && nextUserId && currentUserId !== nextUserId) {
      resetSessionState();
    }
    currentUserId = nextUserId;
    void ensureLoaded();
    return;
  }

  // Other events (e.g. USER_UPDATED): do not clear loaded — that would silence realtime.
});

supabase
  .channel("settings-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "app_settings" },
    (payload) => {
      const row = (payload.new ?? payload.old) as { key?: string } | null;
      const rawKey = row?.key;
      const logical = parseSettingsLogicalKey(rawKey);
      if (logical) {
        scheduleSettingKeyReload(logical);
        return;
      }
      scheduleUnknownKeyFullReload(String(rawKey ?? ""));
    }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "profiles" },
    () => {
      if (assigneesReloadTimer) clearTimeout(assigneesReloadTimer);
      assigneesReloadTimer = setTimeout(() => {
        if (loaded || loadPromise) void selectOptionsStore.loadAssignees();
      }, 300);
    }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "member_translator_settings" },
    () => {
      if (assigneesReloadTimer) clearTimeout(assigneesReloadTimer);
      assigneesReloadTimer = setTimeout(() => {
        if (loaded || loadPromise) void selectOptionsStore.loadAssignees();
      }, 300);
    }
  )
  .subscribe();

export function initSettings() {
  void ensureLoaded();
}

/** Test helpers — not for production callers. */
export const __settingsInitTest = {
  ensureLoaded,
  isLoaded: () => loaded,
  getCurrentUserId: () => currentUserId,
  resetSessionState,
  getLoadPromise: () => loadPromise,
};
