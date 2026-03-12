import { getTimezoneInfo } from "@/data/timezone-options";

/**
 * Get the UTC offset label for an IANA timezone.
 * e.g. "Asia/Taipei" → "(UTC+8)", "America/New_York" → "(UTC-5)"
 */
function getUtcLabel(tz: string): string {
  const info = getTimezoneInfo(tz);
  if (info) return `(${info.utcOffset})`;
  // fallback: compute from Date
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
  const parts = fmt.formatToParts(d);
  const tzPart = parts.find(p => p.type === "timeZoneName");
  if (tzPart) {
    // "GMT+8" → "UTC+8"
    return `(${tzPart.value.replace("GMT", "UTC")})`;
  }
  return "(UTC+8)";
}

/** Shared 24-hour timestamp formatter for detail pages */
export function formatTimestamp24h(date: Date | string, timezone?: string | null): string {
  const tz = timezone || "Asia/Taipei";
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

/** Format date only (no time) for tables, with timezone conversion */
export function formatDateTz(iso: string, timezone?: string | null): string {
  const tz = timezone || "Asia/Taipei";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }) + " " + getUtcLabel(tz);
}

/** Format date+time for tables (shorter, no year), with timezone conversion */
export function formatDateTimeTz(iso: string | null, timezone?: string | null): string {
  if (!iso) return "—";
  const tz = timezone || "Asia/Taipei";
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
