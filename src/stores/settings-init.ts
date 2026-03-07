import { supabase } from "@/integrations/supabase/client";
import { selectOptionsStore } from "@/stores/select-options-store";
import { defaultPricingStore } from "@/stores/default-pricing-store";
import { labelStyleStore } from "@/stores/label-style-store";

let loaded = false;

async function loadAllSettings() {
  await Promise.all([
    selectOptionsStore.loadSettings(),
    defaultPricingStore.loadSettings(),
    labelStyleStore.loadSettings(),
    selectOptionsStore.loadAssignees(),
  ]);
}

function ensureLoaded() {
  if (!loaded) {
    loaded = true;
    loadAllSettings();
  }
}

// Reset and reload on auth changes
supabase.auth.onAuthStateChange(() => {
  loaded = false;
  loadAllSettings();
});

export function initSettings() {
  ensureLoaded();
}
