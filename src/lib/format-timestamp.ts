import { getTimezoneInfo } from "@/data/timezone-options";

/**
 * Get the UTC offset label for an IANA timezone.
 */
function getUtcLabel(tz: string): string {
  const info = getTimezoneInfo(tz);
  if (info) return `(${info.utcOffset})`;
  try {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
    const parts = fmt.formatToParts(d);
    const tzPart = parts.find(p => p.type === "timeZoneName");
    if (tzPart) return `(${tzPart.value.replace("GMT", "UTC")})`;
  } catch {}
  return "(UTC+8)";
}

/** Module-level user timezone cache. Updated by useUserTimezone hook. */
let _userTimezone: string = "Asia/Taipei";

/** Set the user timezone for all formatters in this module */
export function setUserTimezone(tz: string | null | undefined) {
  _userTimezone = tz || "Asia/Taipei";
}

/** Get current user timezone */
export function getUserTimezone(): string {
  return _userTimezone;
}

/** Shared 24-hour timestamp formatter for detail pages */
export function formatTimestamp24h(date: Date | string, timezone?: string | null): string {
  const tz = timezone || _userTimezone;
  const d = typeof date === "string" ? new Date(date) : date;
  const formatted = d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  return `${formatted} ${getUtcLabel(tz)}`;
}

/** Format date only (no time) for tables */
export function formatDateTz(iso: string, timezone?: string | null): string {
  const tz = timezone || _userTimezone;
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }) + " " + getUtcLabel(tz);
}

/** Format date+time for tables (shorter, no year) */
export function formatDateTimeTz(iso: string | null, timezone?: string | null): string {
  if (!iso) return "—";
  const tz = timezone || _userTimezone;
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }) + " " + getUtcLabel(tz);
}
