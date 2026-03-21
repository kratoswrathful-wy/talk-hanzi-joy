import { supabase } from "@/integrations/supabase/client";
import { selectOptionsStore } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { labelStyleStore } from "@/stores/label-style-store";
import { toolTemplateStore } from "@/stores/tool-template-store";
import { pageTemplateStore } from "@/stores/page-template-store";
import { commonLinksStore } from "@/stores/common-links-store";
import { currencyStore } from "@/stores/currency-store";
import { uiButtonStyleStore } from "@/stores/ui-button-style-store";
import { resetLoadedKeys } from "@/stores/settings-persistence";
import { getAuthenticatedUser } from "@/lib/auth-ready";

let loaded = false;
let loadTimer: ReturnType<typeof setTimeout> | null = null;

async function loadAllSettings() {
  const user = await getAuthenticatedUser();
  if (!user) {
    loaded = false;
    resetLoadedKeys();
    return;
  }

  resetLoadedKeys();

  await Promise.all([
    selectOptionsStore.loadSettings(),
    defaultPricingStore.loadSettings(),
    labelStyleStore.loadSettings(),
    toolTemplateStore.loadSettings(),
    pageTemplateStore.loadSettings(),
    commonLinksStore.loadSettings(),
    currencyStore.loadSettings(),
    uiButtonStyleStore.loadSettings(),
    selectOptionsStore.loadAssignees(),
  ]);
}

async function ensureLoaded() {
  if (loaded) return;
  const user = await getAuthenticatedUser();
  if (!user) return;
  loaded = true;
  await loadAllSettings();
}

supabase.auth.onAuthStateChange((event, session) => {
  loaded = false;
  if (loadTimer) clearTimeout(loadTimer);

  if (!session) {
    resetLoadedKeys();
    return;
  }

  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
    loadTimer = setTimeout(() => {
      void loadAllSettings();
    }, 100);
  }
});

let settingsReloadTimer: ReturnType<typeof setTimeout> | null = null;
supabase
  .channel("settings-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "app_settings" },
    () => {
      if (settingsReloadTimer) clearTimeout(settingsReloadTimer);
      settingsReloadTimer = setTimeout(() => {
        if (loaded) void loadAllSettings();
      }, 300);
    }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "profiles" },
    () => {
      if (loaded) void selectOptionsStore.loadAssignees();
    }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "member_translator_settings" },
    () => {
      if (loaded) void selectOptionsStore.loadAssignees();
    }
  )
  .subscribe();

export function initSettings() {
  void ensureLoaded();
}
