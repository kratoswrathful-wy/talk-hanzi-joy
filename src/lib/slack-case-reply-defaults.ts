/**
 * Profile JSON for Slack case-reply auto messages (accept / decline first line suffixes).
 * Stored in profiles.slack_message_defaults; null/empty uses built-in defaults.
 */
export type SlackMessageDefaults = {
  accept_suffix?: string | null;
  decline_line1_suffix?: string | null;
  /** Optional 2nd / 3rd line of decline template (after line 1). */
  decline_line2_suffix?: string | null;
  decline_line3_suffix?: string | null;
};

/** App defaults when profile key is missing or empty. */
export const DEFAULT_ACCEPT_SUFFIX = " 這件我接了，謝謝！";
export const DEFAULT_DECLINE_LINE1_SUFFIX = " 這件我沒辦法接，感謝詢問！";

export function parseSlackMessageDefaults(raw: unknown): SlackMessageDefaults {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    accept_suffix: typeof o.accept_suffix === "string" ? o.accept_suffix : null,
    decline_line1_suffix: typeof o.decline_line1_suffix === "string" ? o.decline_line1_suffix : null,
    decline_line2_suffix: typeof o.decline_line2_suffix === "string" ? o.decline_line2_suffix : null,
    decline_line3_suffix: typeof o.decline_line3_suffix === "string" ? o.decline_line3_suffix : null,
  };
}

export function effectiveAcceptSuffix(raw: unknown): string {
  const v = parseSlackMessageDefaults(raw).accept_suffix?.trim();
  return v || DEFAULT_ACCEPT_SUFFIX;
}

export function effectiveDeclineLine1Suffix(raw: unknown): string {
  const v = parseSlackMessageDefaults(raw).decline_line1_suffix?.trim();
  return v || DEFAULT_DECLINE_LINE1_SUFFIX;
}

export function effectiveDeclineLine2Suffix(raw: unknown): string {
  return parseSlackMessageDefaults(raw).decline_line2_suffix?.trim() ?? "";
}

export function effectiveDeclineLine3Suffix(raw: unknown): string {
  return parseSlackMessageDefaults(raw).decline_line3_suffix?.trim() ?? "";
}
