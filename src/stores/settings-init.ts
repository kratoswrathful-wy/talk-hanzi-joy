import { supabase } from "@/integrations/supabase/client";
import { selectOptionsStore } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { labelStyleStore } from "@/stores/label-style-store";
import { toolTemplateStore } from "@/stores/tool-template-store";
import { pageTemplateStore } from "@/stores/page-template-store";
import { commonLinksStore } from "@/stores/common-links-store";
import { currencyStore } from "@/stores/currency-store";
import { resetLoadedKeys } from "@/stores/settings-persistence";

let loaded = false;
let loadTimer: ReturnType<typeof setTimeout> | null = null;

async function loadAllSettings() {
  // Reset loaded flags so stores won't save until load completes
  resetLoadedKeys();

  await Promise.all([
    selectOptionsStore.loadSettings(),
    defaultPricingStore.loadSettings(),
    labelStyleStore.loadSettings(),
    toolTemplateStore.loadSettings(),
    pageTemplateStore.loadSettings(),
    commonLinksStore.loadSettings(),
    selectOptionsStore.loadAssignees(),
  ]);
}

function ensureLoaded() {
  if (!loaded) {
    loaded = true;
    loadAllSettings();
  }
}

// Debounce auth state changes to avoid duplicate loads
supabase.auth.onAuthStateChange(() => {
  loaded = false;
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    loadAllSettings();
  }, 100);
});

// Realtime: reload settings when app_settings change
let settingsReloadTimer: ReturnType<typeof setTimeout> | null = null;
supabase
  .channel("settings-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "app_settings" },
    () => {
      // Debounce to avoid multiple rapid reloads
      if (settingsReloadTimer) clearTimeout(settingsReloadTimer);
      settingsReloadTimer = setTimeout(() => {
        if (loaded) loadAllSettings();
      }, 300);
    }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "profiles" },
    () => {
      // Reload assignees when profiles change
      if (loaded) selectOptionsStore.loadAssignees();
    }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "member_translator_settings" },
    () => {
      // Reload assignees when member settings change
      if (loaded) selectOptionsStore.loadAssignees();
    }
  )
  .subscribe();

export function initSettings() {
  ensureLoaded();
}
