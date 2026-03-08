export interface TimezoneOption {
  value: string; // IANA timezone id
  label: string;
  utcOffset: string; // e.g. "UTC+8"
  offsetHours: number;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "Pacific/Midway", label: "中途島 (UTC-11)", utcOffset: "UTC-11", offsetHours: -11 },
  { value: "Pacific/Honolulu", label: "夏威夷 (UTC-10)", utcOffset: "UTC-10", offsetHours: -10 },
  { value: "America/Anchorage", label: "阿拉斯加 (UTC-9)", utcOffset: "UTC-9", offsetHours: -9 },
  { value: "America/Los_Angeles", label: "太平洋時間 (UTC-8)", utcOffset: "UTC-8", offsetHours: -8 },
  { value: "America/Denver", label: "山區時間 (UTC-7)", utcOffset: "UTC-7", offsetHours: -7 },
  { value: "America/Chicago", label: "中部時間 (UTC-6)", utcOffset: "UTC-6", offsetHours: -6 },
  { value: "America/New_York", label: "東部時間 (UTC-5)", utcOffset: "UTC-5", offsetHours: -5 },
  { value: "America/Caracas", label: "委內瑞拉 (UTC-4:30)", utcOffset: "UTC-4:30", offsetHours: -4.5 },
  { value: "America/Halifax", label: "大西洋時間 (UTC-4)", utcOffset: "UTC-4", offsetHours: -4 },
  { value: "America/Sao_Paulo", label: "巴西利亞 (UTC-3)", utcOffset: "UTC-3", offsetHours: -3 },
  { value: "Atlantic/South_Georgia", label: "南喬治亞 (UTC-2)", utcOffset: "UTC-2", offsetHours: -2 },
  { value: "Atlantic/Azores", label: "亞速群島 (UTC-1)", utcOffset: "UTC-1", offsetHours: -1 },
  { value: "Europe/London", label: "格林威治標準時間 (UTC+0)", utcOffset: "UTC+0", offsetHours: 0 },
  { value: "Europe/Paris", label: "中歐時間 (UTC+1)", utcOffset: "UTC+1", offsetHours: 1 },
  { value: "Europe/Helsinki", label: "東歐時間 (UTC+2)", utcOffset: "UTC+2", offsetHours: 2 },
  { value: "Europe/Moscow", label: "莫斯科時間 (UTC+3)", utcOffset: "UTC+3", offsetHours: 3 },
  { value: "Asia/Dubai", label: "波斯灣標準時間 (UTC+4)", utcOffset: "UTC+4", offsetHours: 4 },
  { value: "Asia/Kolkata", label: "印度標準時間 (UTC+5:30)", utcOffset: "UTC+5:30", offsetHours: 5.5 },
  { value: "Asia/Dhaka", label: "孟加拉時間 (UTC+6)", utcOffset: "UTC+6", offsetHours: 6 },
  { value: "Asia/Bangkok", label: "中南半島時間 (UTC+7)", utcOffset: "UTC+7", offsetHours: 7 },
  { value: "Asia/Taipei", label: "台灣標準時間 (UTC+8)", utcOffset: "UTC+8", offsetHours: 8 },
  { value: "Asia/Tokyo", label: "日本標準時間 (UTC+9)", utcOffset: "UTC+9", offsetHours: 9 },
  { value: "Australia/Sydney", label: "澳洲東部時間 (UTC+10)", utcOffset: "UTC+10", offsetHours: 10 },
  { value: "Pacific/Noumea", label: "新喀里多尼亞 (UTC+11)", utcOffset: "UTC+11", offsetHours: 11 },
  { value: "Pacific/Auckland", label: "紐西蘭標準時間 (UTC+12)", utcOffset: "UTC+12", offsetHours: 12 },
];

/** Get timezone display info by IANA timezone value */
export function getTimezoneInfo(tz: string | null | undefined): TimezoneOption | undefined {
  return TIMEZONE_OPTIONS.find((t) => t.value === tz);
}

/** Get UTC offset label for display. Returns empty string for UTC+8 (Taiwan). */
export function getTimezoneOffsetLabel(tz: string | null | undefined): string {
  if (!tz || tz === "Asia/Taipei") return "";
  const info = getTimezoneInfo(tz);
  if (!info) return "";
  return info.utcOffset;
}
