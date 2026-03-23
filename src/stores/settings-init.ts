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

  // 譯者下拉等需掃 profiles／settings，資料量大時易拖慢首屏；與其餘設定分開載入
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
  void selectOptionsStore.loadAssignees().catch((e) => console.error("[settings-init] loadAssignees", e));
}

async function ensureLoaded() {
  if (loaded) return;
  const user = await getAuthenticatedUser();
  if (!user) return;
  loaded = true;
  await loadAllSettings();
}

supabase.auth.onAuthStateChange((event, session) => {
  // Keep `loaded` true so realtime handlers (profiles → loadAssignees) keep working
  if (event === "TOKEN_REFRESHED") {
    return;
  }

  loaded = false;
  if (loadTimer) clearTimeout(loadTimer);

  if (!session) {
    resetLoadedKeys();
    return;
  }

  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
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
