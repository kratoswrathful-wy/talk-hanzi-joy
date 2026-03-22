import type { CSSProperties } from "react";
import { useMemo, useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";
import { getUiButtonDef, type UiButtonDef } from "@/lib/ui-button-registry";
import { cn } from "@/lib/utils";
import { MODULE_TOOLBAR_BTN } from "@/lib/module-toolbar-buttons";

type Listener = () => void;

export interface UiButtonColors {
  bgColor: string;
  textColor: string;
}

export type ButtonOverride = Partial<UiButtonColors & { label?: string }>;

type OverridesState = Record<string, ButtonOverride>;

export interface UiToolbarLayout {
  /** 所有工具列按鈕共用的寬度（rem），與原 min-w-[8.25rem] 一致 */
  widthRem: number;
}

const DEFAULT_LAYOUT: UiToolbarLayout = { widthRem: 8.25 };

const SETTINGS_KEY = "ui_button_styles";

interface PersistedV2 {
  v: 2;
  overrides: OverridesState;
  layout: UiToolbarLayout;
}

let overrides: OverridesState = {};
let layout: UiToolbarLayout = { ...DEFAULT_LAYOUT };
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, { v: 2, overrides, layout } satisfies PersistedV2);
}

function migrateLoaded(raw: unknown): { overrides: OverridesState; layout: UiToolbarLayout } {
  if (!raw || typeof raw !== "object") {
    return { overrides: {}, layout: { ...DEFAULT_LAYOUT } };
  }
  const o = raw as Record<string, unknown>;
  if (o.v === 2 && o.overrides && typeof o.overrides === "object") {
    const lay = o.layout && typeof o.layout === "object" ? (o.layout as Partial<UiToolbarLayout>) : {};
    const w = typeof lay.widthRem === "number" && lay.widthRem > 0 ? lay.widthRem : DEFAULT_LAYOUT.widthRem;
    return { overrides: o.overrides as OverridesState, layout: { widthRem: w } };
  }
  return { overrides: raw as OverridesState, layout: { ...DEFAULT_LAYOUT } };
}

function getState() {
  return { overrides, layout };
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

export function getUiButtonLabel(id: string): string {
  const def = getUiButtonDef(id);
  const o = overrides[id];
  const custom = o?.label?.trim();
  if (custom) return custom;
  if (!def) return "";
  return def.label;
}

export function isUiButtonLabelEditable(id: string): boolean {
  const def = getUiButtonDef(id);
  if (!def) return false;
  return def.labelEditable !== false;
}

function appearanceExtras(
  def: UiButtonDef | undefined,
  colors: UiButtonColors,
  widthRem: number
) {
  const widthStyle: CSSProperties = {
    width: `${widthRem}rem`,
    minWidth: `${widthRem}rem`,
    maxWidth: `${widthRem}rem`,
  };
  const appearance = def?.appearance ?? "solid";
  switch (appearance) {
    case "ghost":
      return {
        style: {
          ...widthStyle,
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
          ...widthStyle,
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
          ...widthStyle,
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
          ...widthStyle,
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
  return appearanceExtras(def, colors, layout.widthRem);
}

export const uiButtonStyleStore = {
  getOverrides: () => overrides,
  getLayout: () => layout,

  setButtonPatch: (id: string, patch: ButtonOverride) => {
    const def = getUiButtonDef(id);
    const cur: ButtonOverride = { ...overrides[id] };
    if (patch.bgColor !== undefined) cur.bgColor = patch.bgColor;
    if (patch.textColor !== undefined) cur.textColor = patch.textColor;
    if (patch.label !== undefined) {
      const tr = patch.label.trim();
      if (!tr || (def && tr === def.label)) {
        delete cur.label;
      } else {
        cur.label = tr;
      }
    }

    const out: ButtonOverride = {};
    if (def) {
      if (cur.bgColor !== undefined && cur.bgColor !== def.defaultBg) out.bgColor = cur.bgColor;
      if (cur.textColor !== undefined && cur.textColor !== def.defaultText) out.textColor = cur.textColor;
      if (def.labelEditable !== false && cur.label !== undefined && cur.label !== def.label) {
        out.label = cur.label;
      }
    } else {
      if (cur.bgColor !== undefined) out.bgColor = cur.bgColor;
      if (cur.textColor !== undefined) out.textColor = cur.textColor;
      if (cur.label !== undefined) out.label = cur.label;
    }

    if (Object.keys(out).length === 0) {
      const { [id]: _, ...rest } = overrides;
      overrides = rest;
    } else {
      overrides = { ...overrides, [id]: out };
    }
    notify();
  },

  /** 與舊 API 相容 */
  setButtonColors: (id: string, patch: Partial<UiButtonColors>) => {
    uiButtonStyleStore.setButtonPatch(id, patch);
  },

  setLayoutWidthRem: (widthRem: number) => {
    const w = Math.min(24, Math.max(4, widthRem));
    if (layout.widthRem === w) return;
    layout = { widthRem: w };
    notify();
  },

  resetButton: (id: string) => {
    if (!overrides[id]) return;
    const { [id]: _, ...rest } = overrides;
    overrides = rest;
    notify();
  },

  resetAll: () => {
    if (Object.keys(overrides).length === 0 && layout.widthRem === DEFAULT_LAYOUT.widthRem) return;
    overrides = {};
    layout = { ...DEFAULT_LAYOUT };
    notify();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => getState(),

  loadSettings: async () => {
    const saved = await loadSetting<unknown>(SETTINGS_KEY);
    const m = migrateLoaded(saved);
    overrides = m.overrides;
    layout = m.layout;
    listeners.forEach((l) => l());
  },
};

export function useUiButtonColors(id: string): UiButtonColors {
  const overrideKey = useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => JSON.stringify(uiButtonStyleStore.getOverrides()[id] ?? {}),
    () => JSON.stringify(uiButtonStyleStore.getOverrides()[id] ?? {})
  );
  return useMemo(() => getUiButtonColors(id), [id, overrideKey]);
}

export function useUiButtonLabel(id: string | undefined): string | undefined {
  const key = useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => (id ? JSON.stringify(uiButtonStyleStore.getOverrides()[id] ?? {}) : "__none__"),
    () => (id ? JSON.stringify(uiButtonStyleStore.getOverrides()[id] ?? {}) : "__none__")
  );
  return useMemo(() => {
    if (!id) return undefined;
    return getUiButtonLabel(id);
  }, [id, key]);
}

export function useToolbarLayoutWidthRem(): number {
  const key = useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => JSON.stringify(uiButtonStyleStore.getLayout()),
    () => JSON.stringify(uiButtonStyleStore.getLayout())
  );
  return useMemo(() => uiButtonStyleStore.getLayout().widthRem, [key]);
}

/** 訂閱 store 並回傳可直接餵給 &lt;Button&gt; 的 props（含 MODULE_TOOLBAR_BTN） */
export function useToolbarButtonUiProps(id: string): { style: CSSProperties; className: string } {
  const toolbarKey = useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () =>
      JSON.stringify({
        o: uiButtonStyleStore.getOverrides()[id] ?? {},
        l: uiButtonStyleStore.getLayout(),
      }),
    () =>
      JSON.stringify({
        o: uiButtonStyleStore.getOverrides()[id] ?? {},
        l: uiButtonStyleStore.getLayout(),
      })
  );
  return useMemo(() => {
    const def = getUiButtonDef(id);
    const colors = getUiButtonColors(id);
    return appearanceExtras(def, colors, uiButtonStyleStore.getLayout().widthRem);
  }, [id, toolbarKey]);
}

/** id 為空時不訂閱、回傳 null（給可選範本按鈕等） */
export function useToolbarButtonUiPropsMaybe(
  id: string | undefined
): { style: CSSProperties; className: string } | null {
  const key = useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => (id ? JSON.stringify({ o: uiButtonStyleStore.getOverrides()[id] ?? {}, l: uiButtonStyleStore.getLayout() }) : "_"),
    () => (id ? JSON.stringify({ o: uiButtonStyleStore.getOverrides()[id] ?? {}, l: uiButtonStyleStore.getLayout() }) : "_")
  );
  return useMemo(() => (id ? getToolbarButtonUiProps(id) : null), [id, key]);
}
