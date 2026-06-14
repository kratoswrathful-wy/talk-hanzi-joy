import { getUserTimezone } from "@/lib/format-timestamp";

/** 使用者時區的今日日期，格式 YYYY-MM-DD */
export function todayDateString(timezone?: string | null): string {
  const tz = timezone || getUserTimezone();
  return new Date().toLocaleDateString("sv-SE", { timeZone: tz });
}

/** 解析 YYYY-MM-DD 或 ISO datetime 字串為日期部分 */
export function parseDateOnly(value?: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const datePart = value.length >= 10 ? value.slice(0, 10) : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1) return null;
  return { year, month, day };
}

/** 組合 YYYY-MM-DD */
export function dateOnlyToString(year: number, month: number, day: number): string | null {
  if (isNaN(year) || year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const maxDay = new Date(year, month, 0).getDate();
  if (day > maxDay) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 顯示 YYYY/MM/DD */
export function formatDateOnlyDisplay(value?: string | null): string {
  const p = parseDateOnly(value);
  if (!p) return "";
  return `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}`;
}
