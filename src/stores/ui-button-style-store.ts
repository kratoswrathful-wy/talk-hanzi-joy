import type { CSSProperties } from "react";
import { useMemo, useSyncExternalStore } from "react";
import { loadSetting, saveSetting, markDirty } from "./settings-persistence";
import { getUiButtonDef, type UiButtonDef } from "@/lib/ui-button-registry";
import { cn } from "@/lib/utils";
import { MODULE_TOOLBAR_BTN } from "@/lib/module-toolbar-buttons";
import {
  buildDefaultGroupsByModule,
  mergeGroupsWithRegistry,
  type ModuleToolbarGroupsState,
} from "@/lib/ui-toolbar-groups-defaults";

type Listener = () => void;

export interface UiButtonColors {
  bgColor: string;
  textColor: string;
}

export type ButtonOverride = Partial<
  UiButtonColors & {
    label?: string;
    /** `lucide:Name` 或 `custom:slack` */
    iconKey?: string;
    /** 自訂圖（data URL）；優先於 iconKey 顯示 */
    customIconDataUrl?: string;
  }
>;

type OverridesState = Record<string, ButtonOverride>;

export interface UiToolbarLayout {
  widthRem: number;
  /** 設定頁各模組的按鈕群組（可自訂） */
  groupsByModule?: Record<string, ModuleToolbarGroupsState>;
}

const DEFAULT_LAYOUT: UiToolbarLayout = {
  widthRem: 8.25,
  groupsByModule: buildDefaultGroupsByModule(),
};

const SETTINGS_KEY = "ui_button_styles";

interface PersistedV2 {
  v: 2;
  overrides: OverridesState;
  layout: { widthRem: number };
}

interface PersistedV3 {
  v: 3;
  overrides: OverridesState;
  layout: UiToolbarLayout;
}

let overrides: OverridesState = {};
let layout: UiToolbarLayout = { ...DEFAULT_LAYOUT, groupsByModule: buildDefaultGroupsByModule() };
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
  markDirty(SETTINGS_KEY);
  saveSetting(SETTINGS_KEY, {
    v: 3,
    overrides,
    layout: {
      ...layout,
      groupsByModule: layout.groupsByModule ?? buildDefaultGroupsByModule(),
    },
  } satisfies PersistedV3);
}

const LEGACY_NEUTRAL_ID = "cases_detail_neutral";
const NEUTRAL_SPLIT_IDS = [
  "cases_detail_revert_to_draft",
  "cases_detail_cancel_dispatch",
  "cases_detail_revert_revision",
  "cases_detail_revert_to_feedback",
  "cases_detail_delete_draft",
] as const;

function migrateNeutralOverride(o: OverridesState): OverridesState {
  const legacy = o[LEGACY_NEUTRAL_ID];
  if (!legacy) return o;
  const next = { ...o };
  delete next[LEGACY_NEUTRAL_ID];
  for (const id of NEUTRAL_SPLIT_IDS) {
    if (next[id]) continue;
    const merged: ButtonOverride = {};
    if (legacy.bgColor !== undefined) merged.bgColor = legacy.bgColor;
    if (legacy.textColor !== undefined) merged.textColor = legacy.textColor;
    if (Object.keys(merged).length > 0) next[id] = merged;
  }
  return next;
}

function migrateLoaded(raw: unknown): { overrides: OverridesState; layout: UiToolbarLayout } {
  if (!raw || typeof raw !== "object") {
    return { overrides: {}, layout: { ...DEFAULT_LAYOUT, groupsByModule: buildDefaultGroupsByModule() } };
  }
  const o = raw as Record<string, unknown>;

  let ov: OverridesState = {};
  let lay: UiToolbarLayout = { ...DEFAULT_LAYOUT, groupsByModule: buildDefaultGroupsByModule() };

  if (o.v === 3 && o.overrides && typeof o.overrides === "object") {
    ov = migrateNeutralOverride(o.overrides as OverridesState);
    const l = o.layout && typeof o.layout === "object" ? (o.layout as Partial<UiToolbarLayout>) : {};
    const w = typeof l.widthRem === "number" && l.widthRem > 0 ? l.widthRem : DEFAULT_LAYOUT.widthRem;
    const gbm = l.groupsByModule && typeof l.groupsByModule === "object"
      ? (l.groupsByModule as Record<string, ModuleToolbarGroupsState>)
      : buildDefaultGroupsByModule();
    lay = {
      widthRem: w,
      groupsByModule: gbm,
    };
  } else if (o.v === 2 && o.overrides && typeof o.overrides === "object") {
    ov = migrateNeutralOverride(o.overrides as OverridesState);
    const l = o.layout && typeof o.layout === "object" ? (o.layout as Partial<UiToolbarLayout>) : {};
    const w = typeof l.widthRem === "number" && l.widthRem > 0 ? l.widthRem : DEFAULT_LAYOUT.widthRem;
    lay = { widthRem: w, groupsByModule: buildDefaultGroupsByModule() };
  } else if (!("v" in o) && typeof raw === "object") {
    ov = migrateNeutralOverride(raw as OverridesState);
  }

  const mergedGroups: Record<string, ModuleToolbarGroupsState> = {};
  const defaults = buildDefaultGroupsByModule();
  for (const mod of Object.keys(defaults)) {
    mergedGroups[mod] = mergeGroupsWithRegistry(mod, lay.groupsByModule?.[mod]);
  }
  lay = { ...lay, groupsByModule: mergedGroups };

  return { overrides: ov, layout: lay };
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

export interface ResolvedUiButtonIcon {
  iconKey?: string;
  customIconDataUrl?: string;
}

/** 合併 registry 預設 icon 與使用者覆寫 */
export function getUiButtonIconResolved(id: string): ResolvedUiButtonIcon | null {
  const def = getUiButtonDef(id);
  const o = overrides[id];
  if (!def && !o?.iconKey && !o?.customIconDataUrl) return null;
  return {
    iconKey: o?.iconKey ?? def?.defaultIconKey,
    customIconDataUrl: o?.customIconDataUrl,
  };
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

function normalizeButtonOverrideOut(id: string, cur: ButtonOverride): ButtonOverride {
  const def = getUiButtonDef(id);
  const out: ButtonOverride = {};
  if (!def) {
    if (cur.bgColor !== undefined) out.bgColor = cur.bgColor;
    if (cur.textColor !== undefined) out.textColor = cur.textColor;
    if (cur.label !== undefined) out.label = cur.label;
    if (cur.iconKey !== undefined) out.iconKey = cur.iconKey;
    if (cur.customIconDataUrl !== undefined) out.customIconDataUrl = cur.customIconDataUrl;
    return out;
  }
  if (cur.bgColor !== undefined && cur.bgColor !== def.defaultBg) out.bgColor = cur.bgColor;
  if (cur.textColor !== undefined && cur.textColor !== def.defaultText) out.textColor = cur.textColor;
  if (def.labelEditable !== false && cur.label !== undefined && cur.label !== def.label) {
    out.label = cur.label;
  }
  if (cur.iconKey !== undefined && cur.iconKey !== def.defaultIconKey) out.iconKey = cur.iconKey;
  if (cur.customIconDataUrl !== undefined && cur.customIconDataUrl.trim()) {
    out.customIconDataUrl = cur.customIconDataUrl;
  }
  return out;
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
    if (patch.iconKey !== undefined) {
      const tr = patch.iconKey.trim();
      if (!tr || (def && tr === def.defaultIconKey)) {
        delete cur.iconKey;
      } else {
        cur.iconKey = tr;
      }
    }
    if (patch.customIconDataUrl !== undefined) {
      const tr = patch.customIconDataUrl.trim();
      if (!tr) delete cur.customIconDataUrl;
      else cur.customIconDataUrl = tr;
    }

    const out = normalizeButtonOverrideOut(id, cur);

    if (Object.keys(out).length === 0) {
      const { [id]: _, ...rest } = overrides;
      overrides = rest;
    } else {
      overrides = { ...overrides, [id]: out };
    }
    notify();
  },

  setButtonColors: (id: string, patch: Partial<UiButtonColors>) => {
    uiButtonStyleStore.setButtonPatch(id, patch);
  },

  setLayoutWidthRem: (widthRem: number) => {
    const w = Math.min(24, Math.max(4, widthRem));
    if (layout.widthRem === w) return;
    layout = { ...layout, widthRem: w };
    notify();
  },

  setModuleGroups: (module: string, state: ModuleToolbarGroupsState) => {
    const merged = mergeGroupsWithRegistry(module, state);
    layout = {
      ...layout,
      groupsByModule: { ...(layout.groupsByModule ?? buildDefaultGroupsByModule()), [module]: merged },
    };
    notify();
  },

  resetButton: (id: string) => {
    if (!overrides[id]) return;
    const { [id]: _, ...rest } = overrides;
    overrides = rest;
    notify();
  },

  resetAll: () => {
    overrides = {};
    layout = { ...DEFAULT_LAYOUT, groupsByModule: buildDefaultGroupsByModule() };
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

export function useUiButtonIconResolved(id: string): ResolvedUiButtonIcon | null {
  const key = useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => JSON.stringify(uiButtonStyleStore.getOverrides()[id] ?? {}),
    () => JSON.stringify(uiButtonStyleStore.getOverrides()[id] ?? {})
  );
  return useMemo(() => getUiButtonIconResolved(id), [id, key]);
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

export function useModuleToolbarGroups(module: string): ModuleToolbarGroupsState {
  const key = useSyncExternalStore(
    uiButtonStyleStore.subscribe,
    () => JSON.stringify(uiButtonStyleStore.getLayout().groupsByModule ?? {}),
    () => JSON.stringify(uiButtonStyleStore.getLayout().groupsByModule ?? {})
  );
  return useMemo(() => {
    const raw = uiButtonStyleStore.getLayout().groupsByModule?.[module];
    return mergeGroupsWithRegistry(module, raw);
  }, [module, key]);
}
