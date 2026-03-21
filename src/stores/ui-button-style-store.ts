import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";
import { getUiButtonDef, type UiButtonDef } from "@/lib/ui-button-registry";
import { cn } from "@/lib/utils";
import { MODULE_TOOLBAR_BTN } from "@/lib/module-toolbar-buttons";

type Listener = () => void;

export interface UiButtonColors {
  bgColor: string;
  textColor: string;
}

/** 僅儲存與預設不同的覆寫值 */
type OverridesState = Record<string, Partial<UiButtonColors>>;

const SETTINGS_KEY = "ui_button_styles";

let overrides: OverridesState = {};
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, overrides);
}

export function getUiButtonColors(id: string): UiButtonColors {
  const def = getUiButtonDef(id);
  const o = overrides[id];
  if (!def) {
    return {
      bgColor: o?.bgColor ?? "#888888",
      textColor: o?.textColor ?? "#FFFFFF",
    };
  }
  return {
    bgColor: o?.bgColor ?? def.defaultBg,
    textColor: o?.textColor ?? def.defaultText,
  };
}

function appearanceExtras(def: UiButtonDef | undefined, colors: UiButtonColors) {
  const appearance = def?.appearance ?? "solid";
  switch (appearance) {
    case "ghost":
      return {
        style: {
          ...(colors.bgColor !== "transparent" ? { backgroundColor: colors.bgColor } : {}),
          color: colors.textColor,
        } as CSSProperties,
        className: cn(
          MODULE_TOOLBAR_BTN,
          "border-0 shadow-none",
          colors.bgColor === "transparent" ? "hover:bg-accent/50" : "hover:opacity-90"
        ),
      };
    case "outline":
      return {
        style: {
          backgroundColor: colors.bgColor,
          color: colors.textColor,
          borderColor: colors.bgColor === "transparent" ? "hsl(var(--border))" : colors.bgColor,
        } as CSSProperties,
        className: cn(
          MODULE_TOOLBAR_BTN,
          "border shadow-none hover:opacity-90 [&_svg]:text-current"
        ),
      };
    case "light":
      return {
        style: {
          backgroundColor: colors.bgColor,
          color: colors.textColor,
          borderColor: `color-mix(in srgb, ${colors.textColor} 18%, transparent)`,
        } as CSSProperties,
        className: cn(
          MODULE_TOOLBAR_BTN,
          "border shadow-none hover:opacity-90 [&_svg]:text-current"
        ),
      };
    case "solid":
    default:
      return {
        style: {
          backgroundColor: colors.bgColor,
          color: colors.textColor,
        } as CSSProperties,
        className: cn(
          MODULE_TOOLBAR_BTN,
          "border-0 shadow-none hover:opacity-90 [&_svg]:text-current"
        ),
      };
  }
}

/** 合併註冊表 appearance 與使用者顏色，產生 Button 的 style／className */
export function getToolbarButtonUiProps(id: string): { style: CSSProperties; className: string } | null {
  if (!id || !getUiButtonDef(id)) return null;
  const def = getUiButtonDef(id)!;
  const colors = getUiButtonColors(id);
  return appearanceExtras(def, colors);
}

export const uiButtonStyleStore = {
  getOverrides: () => overrides,

  setButtonColors: (id: string, patch: Partial<UiButtonColors>) => {
    const def = getUiButtonDef(id);
    const cur = { ...overrides[id] };
    if (patch.bgColor !== undefined) cur.bgColor = patch.bgColor;
    if (patch.textColor !== undefined) cur.textColor = patch.textColor;
    const out: Partial<UiButtonColors> = {};
    if (def) {
      if (cur.bgColor !== undefined && cur.bgColor !== def.defaultBg) out.bgColor = cur.bgColor;
      if (cur.textColor !== undefined && cur.textColor !== def.defaultText) out.textColor = cur.textColor;
    } else {
      if (cur.bgColor !== undefined) out.bgColor = cur.bgColor;
      if (cur.textColor !== undefined) out.textColor = cur.textColor;
    }
    if (Object.keys(out).length === 0) {
      const { [id]: _, ...rest } = overrides;
      overrides = rest;
    } else {
      overrides = { ...overrides, [id]: out };
    }
    notify();
  },

  resetButton: (id: string) => {
    if (!overrides[id]) return;
    const { [id]: _, ...rest } = overrides;
    overrides = rest;
    notify();
  },

  resetAll: () => {
    if (Object.keys(overrides).length === 0) return;
    overrides = {};
    notify();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => overrides,

  loadSettings: async () => {
    const saved = await loadSetting<OverridesState>(SETTINGS_KEY);
    if (saved && typeof saved === "object") {
      overrides = saved;
      listeners.forEach((l) => l());
    }
  },
};

export function useUiButtonColors(id: string): UiButtonColors {
  return useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => getUiButtonColors(id),
    () => getUiButtonColors(id)
  );
}

/** 訂閱 store 並回傳可直接餵給 &lt;Button&gt; 的 props（含 MODULE_TOOLBAR_BTN） */
export function useToolbarButtonUiProps(id: string): { style: CSSProperties; className: string } {
  const colors = useUiButtonColors(id);
  const def = getUiButtonDef(id);
  return appearanceExtras(def, colors);
}

/** id 為空時不訂閱、回傳 null（給可選範本按鈕等） */
export function useToolbarButtonUiPropsMaybe(
  id: string | undefined
): { style: CSSProperties; className: string } | null {
  return useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => (id ? getToolbarButtonUiProps(id) : null),
    () => (id ? getToolbarButtonUiProps(id) : null)
  );
}
