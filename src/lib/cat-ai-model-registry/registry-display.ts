import { shouldOmitTemperature } from "./model-capabilities";

export const FALLBACK_MODEL_ID = "gpt-4.1-mini";

export type RegistryRowFlags = {
  isDefault: boolean;
  isEnabled: boolean;
  isFallback: boolean;
  providerUnavailable: boolean;
  missingUsageHint: boolean;
  missingShortLabel: boolean;
  omitTemperature: boolean;
};

export type RegistryRowForDisplay = {
  model_id: string;
  enabled: boolean;
  is_default: boolean;
  usage_hint_zh: string | null;
  short_label_zh: string | null;
  providerAvailable: boolean;
};

export function isBlankZh(text: string | null | undefined): boolean {
  return text == null || text.trim() === "";
}

export function formatNullableZh(text: string | null | undefined): string {
  return isBlankZh(text) ? "（未設定）" : String(text);
}

export function getRegistryRowFlags(row: RegistryRowForDisplay): RegistryRowFlags {
  return {
    isDefault: row.is_default,
    isEnabled: row.enabled,
    isFallback: row.model_id === FALLBACK_MODEL_ID && row.enabled && !row.is_default,
    providerUnavailable: !row.providerAvailable,
    missingUsageHint: isBlankZh(row.usage_hint_zh),
    missingShortLabel: isBlankZh(row.short_label_zh),
    omitTemperature: shouldOmitTemperature(row.model_id),
  };
}

export function sortRegistryRows<T extends { sort_order: number; display_name_zh: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.display_name_zh.localeCompare(b.display_name_zh, "zh-Hant");
  });
}
