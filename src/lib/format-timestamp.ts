/** Shared 24-hour timestamp formatter for all detail pages, with UTC+8 */
export function formatTimestamp24h(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const formatted = d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  });
  return `${formatted} (UTC+8)`;
}
