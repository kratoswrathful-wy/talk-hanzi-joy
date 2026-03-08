import { supabase } from "@/integrations/supabase/client";
import { selectOptionsStore } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { labelStyleStore } from "@/stores/label-style-store";
import { toolTemplateStore } from "@/stores/tool-template-store";
import { commonLinksStore } from "@/stores/common-links-store";
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

export function initSettings() {
  ensureLoaded();
}
