/**
 * Map app_settings DB keys (with optional env prefix) to logical setting keys.
 * Used by settings-init realtime for targeted reload.
 */

export const SETTINGS_LOGICAL_KEYS = [
  "select_options",
  "default_pricing",
  "label_styles",
  "tool_templates",
  "page_templates",
  "common_links",
  "currencies",
  "ui_button_styles",
] as const;

export type SettingsLogicalKey = (typeof SETTINGS_LOGICAL_KEYS)[number];

const LOGICAL_KEY_SET = new Set<string>(SETTINGS_LOGICAL_KEYS);

/**
 * Strip `test:` / `production:` prefix and return a known logical key, or null.
 */
export function parseSettingsLogicalKey(rawKey: string | null | undefined): SettingsLogicalKey | null {
  if (!rawKey || typeof rawKey !== "string") return null;
  const trimmed = rawKey.trim();
  if (!trimmed) return null;

  const prefixed = /^(?:test|production):(.+)$/.exec(trimmed);
  const logical = prefixed ? prefixed[1] : trimmed;
  if (LOGICAL_KEY_SET.has(logical)) {
    return logical as SettingsLogicalKey;
  }
  return null;
}
