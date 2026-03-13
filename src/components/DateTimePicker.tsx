import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { format, addDays, startOfDay, isSameMonth, isSameDay, getDaysInMonth } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { getUserTimezone } from "@/lib/format-timestamp";
import { getTimezoneInfo } from "@/data/timezone-options";

interface DateTimePickerProps {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  defaultOpen?: boolean;
  onClose?: () => void;
}

/* ── Timezone helpers ── */

/** Get UTC offset label string for a timezone, e.g. "UTC+8" */
function getTzLabel(tz: string): string {
  const info = getTimezoneInfo(tz);
  if (info) return info.utcOffset;
  try {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
    const parts = fmt.formatToParts(d);
    const tzPart = parts.find(p => p.type === "timeZoneName");
    if (tzPart) return tzPart.value.replace("GMT", "UTC");
  } catch {}
  return "UTC+8";
}

/** Parse an ISO string into { year, month, day, hour, minute } in a given timezone */
function isoToTzParts(iso: string, tz: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => {
    const p = parts.find(p => p.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };
  // hour12:false with en-US: midnight can be "24" in some locales
  let hour = get("hour");
  if (hour === 24) hour = 0;
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

/** Build an ISO string from date/time parts in a given timezone */
function tzPartsToIso(y: number, mm: number, dd: number, hh: number, mi: number, tz: string): string | null {
  if (isNaN(y) || y < 1900 || y > 2100) return null;
  if (mm < 1 || mm > 12 || dd < 1) return null;
  const maxDay = getDaysInMonth(new Date(y, mm - 1));
  if (dd > maxDay) return null;
  if (hh > 23 || mi > 59) return null;

  // Create a Date as if in UTC, then adjust by the timezone offset
  const utcGuess = new Date(Date.UTC(y, mm - 1, dd, hh, mi, 0));
  // Find what the tz shows for this UTC time
  const inTz = isoToTzParts(utcGuess.toISOString(), tz);
  // Compute offset: the difference between what we wanted and what the tz shows
  const wantedMinutes = hh * 60 + mi;
  const gotMinutes = inTz.hour * 60 + inTz.minute;
  // Also account for date difference
  const wantedDayVal = y * 10000 + mm * 100 + dd;
  const gotDayVal = inTz.year * 10000 + inTz.month * 100 + inTz.day;
  let dayDiffMinutes = 0;
  if (gotDayVal > wantedDayVal) dayDiffMinutes = 1440;
  else if (gotDayVal < wantedDayVal) dayDiffMinutes = -1440;

  const offsetMinutes = (gotMinutes + dayDiffMinutes) - wantedMinutes;
  const result = new Date(utcGuess.getTime() - offsetMinutes * 60000);

  // Verify the result
  const verify = isoToTzParts(result.toISOString(), tz);
  if (verify.year !== y || verify.month !== mm || verify.day !== dd || verify.hour !== hh || verify.minute !== mi) {
    // DST edge case - try a second pass
    const utcGuess2 = new Date(Date.UTC(y, mm - 1, dd, hh, mi, 0));
    const offset2 = offsetMinutes + (offsetMinutes > 0 ? -60 : 60);
    const result2 = new Date(utcGuess2.getTime() - offset2 * 60000);
    const v2 = isoToTzParts(result2.toISOString(), tz);
    if (v2.year === y && v2.month === mm && v2.day === dd && v2.hour === hh && v2.minute === mi) {
      return result2.toISOString();
    }
  }

  if (isNaN(result.getTime())) return null;
  return result.toISOString();
}

/* ── Generic rolling N-digit input hook ── */
function useRollingInput(maxDigits: number, initial: string) {
  const [digits, setDigits] = useState<string>(initial.padStart(maxDigits, "0"));

  const reset = useCallback((raw: string) => {
    setDigits(raw.replace(/\D/g, "").padStart(maxDigits, "0").slice(-maxDigits));
  }, [maxDigits]);

  const handleKey = useCallback((key: string) => {
    if (key === "Backspace") {
      setDigits((prev) => {
        const next = prev.length > 1 ? prev.slice(0, -1) : "0";
        return next.padStart(maxDigits, "0").slice(-maxDigits);
      });
      return;
    }
    if (!/^\d$/.test(key)) return;
    setDigits((prev) => {
      let next = prev + key;
      if (next.length > maxDigits) next = next.slice(next.length - maxDigits);
      return next;
    });
  }, [maxDigits]);

  const padded = digits.padStart(maxDigits, "0").slice(-maxDigits);

  return { padded, reset, handleKey };
}

/* ── Custom calendar with today indicator logic ── */
function DateTimeCalendar({
  selected,
  onSelect,
  displayMonth,
  onMonthChange,
}: {
  selected: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  displayMonth: Date;
  onMonthChange: (m: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const todayInDisplayMonth = isSameMonth(today, displayMonth);
  const todayIsSelected = selected ? isSameDay(today, selected) : false;

  // Determine if today is before or after the displayed month
  const todayBefore = today < displayMonth && !todayInDisplayMonth;
  const todayAfter = !todayBefore && !todayInDisplayMonth;

  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onSelect}
      month={displayMonth}
      onMonthChange={onMonthChange}
      showOutsideDays
      weekStartsOn={1}
      className="p-0 pointer-events-auto"
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: cn(
          "absolute left-1",
          todayBefore && "opacity-100 border-destructive text-destructive hover:text-destructive hover:border-destructive"
        ),
        nav_button_next: cn(
          "absolute right-1",
          todayAfter && "opacity-100 border-destructive text-destructive hover:text-destructive hover:border-destructive"
        ),
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: todayIsSelected
          ? "bg-primary text-primary-foreground"
          : "bg-transparent ring-1 ring-inset ring-muted-foreground text-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
    />
  );
}

/* ── Inline fix input for AlertDialog ── */
function FixInput({
  maxDigits,
  separator,
  initial,
  validate,
  onConfirm,
}: {
  maxDigits: number;
  separator: string;
  initial: string;
  validate: (padded: string) => boolean;
  onConfirm: (padded: string) => void;
}) {
  const rolling = useRollingInput(maxDigits, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = `${rolling.padded.slice(0, 2)}${separator}${rolling.padded.slice(2, 4)}`;
  const [error, setError] = useState(false);
  const [focused, setFocused] = useState(false);

  // Auto-focus on mount with multiple retries to beat AlertDialog focus trap
  useEffect(() => {
    const attempts = [50, 150, 300, 500];
    const timers = attempts.map((ms) =>
      setTimeout(() => inputRef.current?.focus(), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const tryConfirm = () => {
    if (validate(rolling.padded)) {
      onConfirm(rolling.padded);
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoFocus
        value={display}
        onChange={() => {}} // controlled, actual input via onKeyDown
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => inputRef.current?.focus()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            tryConfirm();
            return;
          }
          if (e.key === "Backspace" || /^\d$/.test(e.key)) {
            e.preventDefault();
            setError(false);
            rolling.handleKey(e.key);
          }
          // Allow Tab but prevent other defaults
          if (e.key !== "Tab") {
            e.preventDefault();
          }
        }}
        className={cn(
          "flex h-9 w-[70px] rounded-md border bg-background px-2 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 cursor-text caret-transparent select-none",
          error ? "border-destructive focus-visible:ring-destructive" : "border-input focus-visible:ring-ring",
          focused && "ring-2 ring-ring"
        )}
      />
      <Button size="sm" onClick={tryConfirm}>確定</Button>
    </div>
  );
}

export default function DateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "選擇日期與時間",
  className,
  defaultOpen = false,
  onClose,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const tz = getUserTimezone();
  const tzLabel = getTzLabel(tz);

  // Parse value in user timezone
  const tzParts = value ? isoToTzParts(value, tz) : null;

  // Year is a regular text input
  const [yearInput, setYearInput] = useState(tzParts ? String(tzParts.year) : "");
  // MMDD rolling input
  const dateRolling = useRollingInput(4, tzParts ? String(tzParts.month).padStart(2, "0") + String(tzParts.day).padStart(2, "0") : "0101");
  // HHmm rolling input
  const timeRolling = useRollingInput(4, tzParts ? String(tzParts.hour).padStart(2, "0") + String(tzParts.minute).padStart(2, "0") : "0000");

  const [timeError, setTimeError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  // For calendar display, create a pseudo-Date in local browser time that represents the tz parts
  const calendarDate = tzParts ? new Date(tzParts.year, tzParts.month - 1, tzParts.day) : undefined;
  const [displayMonth, setDisplayMonth] = useState<Date>(calendarDate || new Date());

  const dateDisplay = `${dateRolling.padded.slice(0, 2)}/${dateRolling.padded.slice(2, 4)}`;
  const timeDisplay = `${timeRolling.padded.slice(0, 2)}:${timeRolling.padded.slice(2, 4)}`;

  // Sync from outside
  useEffect(() => {
    if (value) {
      const p = isoToTzParts(value, tz);
      setYearInput(String(p.year));
      dateRolling.reset(String(p.month).padStart(2, "0") + String(p.day).padStart(2, "0"));
      timeRolling.reset(String(p.hour).padStart(2, "0") + String(p.minute).padStart(2, "0"));
      setDisplayMonth(new Date(p.year, p.month - 1, p.day));
    } else {
      setYearInput("");
      dateRolling.reset("0101");
      timeRolling.reset("0000");
    }
    setTimeError(false);
    setDateError(false);
    setValidationMsg(null);
  }, [value]);

  const buildIso = (year: string, mmdd: string, hhmm: string): string | null => {
    const y = parseInt(year);
    const mm = parseInt(mmdd.slice(0, 2));
    const dd = parseInt(mmdd.slice(2, 4));
    const hh = parseInt(hhmm.slice(0, 2));
    const mi = parseInt(hhmm.slice(2, 4));
    return tzPartsToIso(y, mm, dd, hh, mi, tz);
  };

  const commitAll = () => {
    const iso = buildIso(yearInput, dateRolling.padded, timeRolling.padded);
    onChange(iso);
  };

  const validateDate = (): boolean => {
    const mm = parseInt(dateRolling.padded.slice(0, 2));
    const dd = parseInt(dateRolling.padded.slice(2, 4));
    const y = parseInt(yearInput) || new Date().getFullYear();
    if (mm < 1 || mm > 12 || dd < 1 || dd > getDaysInMonth(new Date(y, mm - 1))) {
      setDateError(true);
      setValidationMsg("日期格式不正確，月份須為 01-12，日期須為有效日");
      return false;
    }
    setDateError(false);
    return true;
  };

  const validateTime = (): boolean => {
    const hh = parseInt(timeRolling.padded.slice(0, 2));
    const mi = parseInt(timeRolling.padded.slice(2, 4));
    if (hh > 23 || mi > 59) {
      setTimeError(true);
      setValidationMsg("時間格式不正確，小時須為 0-23，分鐘須為 0-59");
      return false;
    }
    setTimeError(false);
    return true;
  };

  const handleCalendarSelect = (selected: Date | undefined) => {
    if (!selected) return;
    // selected is a browser-local Date from the calendar; extract its y/m/d
    const sy = selected.getFullYear();
    const sm = selected.getMonth() + 1;
    const sd = selected.getDate();
    setYearInput(String(sy));
    const mmdd = String(sm).padStart(2, "0") + String(sd).padStart(2, "0");
    dateRolling.reset(mmdd);
    setDateError(false);
    // Commit immediately
    const iso = buildIso(String(sy), mmdd, timeRolling.padded);
    onChange(iso);
    setTimeout(() => timeRef.current?.focus(), 50);
  };

  const handleQuickDate = (daysFromNow: number) => {
    // "Today" in user's timezone
    const nowParts = isoToTzParts(new Date().toISOString(), tz);
    const target = new Date(nowParts.year, nowParts.month - 1, nowParts.day + daysFromNow);
    const ty = target.getFullYear();
    const tm = target.getMonth() + 1;
    const td = target.getDate();
    setYearInput(String(ty));
    const mmdd = String(tm).padStart(2, "0") + String(td).padStart(2, "0");
    dateRolling.reset(mmdd);
    setDateError(false);
    setDisplayMonth(target);
    const iso = buildIso(String(ty), mmdd, timeRolling.padded);
    onChange(iso);
    setTimeout(() => timeRef.current?.focus(), 50);
  };

  const handleClear = () => {
    setYearInput("");
    dateRolling.reset("0101");
    timeRolling.reset("0000");
    setTimeError(false);
    setDateError(false);
    onChange(null);
    setOpen(false);
  };

  const handleYearBlur = () => {
    if (yearInput) commitAll();
  };

  const makeRollingKeyHandler = (
    rolling: { handleKey: (k: string) => void },
    errorSetter: (v: boolean) => void,
    validateFn: () => boolean,
    nextRef?: React.RefObject<HTMLInputElement | null>,
  ) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === "Enter") {
      if (validateFn()) {
        commitAll();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Tab") {
      if (validateFn()) {
        commitAll();
        if (!e.shiftKey && nextRef?.current) {
          setTimeout(() => nextRef.current?.focus(), 0);
        }
      }
      return;
    }
    if (e.key === "Backspace" || /^\d$/.test(e.key)) {
      errorSetter(false);
      rolling.handleKey(e.key);
    }
  };

  const handleDateKeyDown = makeRollingKeyHandler(dateRolling, setDateError, validateDate, timeRef);
  const handleTimeKeyDown = makeRollingKeyHandler(timeRolling, setTimeError, validateTime);

  const handleDateBlur = () => {
    if (validateDate() && yearInput) commitAll();
  };

  const handleTimeBlur = () => {
    if (validateTime() && yearInput) commitAll();
  };

  const handleOpenChange = (v: boolean) => {
    if (disabled) return;
    if (v && !value) {
      // Default to next whole hour in user timezone
      const nowIso = new Date().toISOString();
      const nowParts = isoToTzParts(nowIso, tz);
      // Next whole hour
      let nh = nowParts.hour + 1;
      let nd = nowParts.day;
      let nm = nowParts.month;
      let ny = nowParts.year;
      if (nh > 23) {
        nh = 0;
        // Advance day
        const temp = new Date(ny, nm - 1, nd + 1);
        ny = temp.getFullYear();
        nm = temp.getMonth() + 1;
        nd = temp.getDate();
      }
      setYearInput(String(ny));
      const mmdd = String(nm).padStart(2, "0") + String(nd).padStart(2, "0");
      const hhmm = String(nh).padStart(2, "0") + "00";
      dateRolling.reset(mmdd);
      timeRolling.reset(hhmm);
      setDisplayMonth(new Date(ny, nm - 1, nd));
      setDateError(false);
      setTimeError(false);
      const iso = tzPartsToIso(ny, nm, nd, nh, 0, tz);
      onChange(iso);
    }
    if (v) {
      // Always focus date input when opening
      setTimeout(() => dateRef.current?.focus(), 50);
    }
    if (!v) {
      if (!validateDate() || !validateTime()) return;
      commitAll();
      onClose?.();
    }
    setOpen(v);
  };

  // Display text on the trigger button - show in user timezone + UTC offset
  const displayText = tzParts
    ? `${String(tzParts.year)}/${String(tzParts.month).padStart(2, "0")}/${String(tzParts.day).padStart(2, "0")} ${String(tzParts.hour).padStart(2, "0")}:${String(tzParts.minute).padStart(2, "0")} (${tzLabel})`
    : null;

  return (
    <>
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          title={displayText || undefined}
          className={cn(
            "justify-start text-left font-normal h-9 min-w-0 overflow-hidden",
            !displayText && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{displayText || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <div className="p-3 space-y-3">
          {/* Year + MM/DD + HH:mm inputs + timezone label */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={yearInput}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setYearInput(v);
              }}
              onBlur={handleYearBlur}
              placeholder="yyyy"
              className="flex h-8 w-[52px] rounded-md border border-input bg-background px-1.5 py-1 text-sm text-center ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-muted-foreground text-sm">/</span>
            <input
              ref={dateRef}
              type="text"
              value={dateDisplay}
              onKeyDown={handleDateKeyDown}
              onBlur={handleDateBlur}
              readOnly
              className={cn(
                "flex h-8 w-[58px] rounded-md border bg-background px-1.5 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-1 cursor-text caret-transparent",
                dateError
                  ? "border-destructive focus-visible:ring-destructive"
                  : "border-input focus-visible:ring-ring"
              )}
            />
            <input
              ref={timeRef}
              type="text"
              value={timeDisplay}
              onKeyDown={handleTimeKeyDown}
              onBlur={handleTimeBlur}
              readOnly
              className={cn(
                "flex h-8 w-[58px] rounded-md border bg-background px-1.5 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-1 cursor-text caret-transparent",
                timeError
                  ? "border-destructive focus-visible:ring-destructive"
                  : "border-input focus-visible:ring-ring"
              )}
            />
            <span className="text-xs text-muted-foreground shrink-0">{tzLabel}</span>
          </div>

          {/* Calendar */}
          <DateTimeCalendar
            selected={calendarDate}
            onSelect={handleCalendarSelect}
            displayMonth={displayMonth}
            onMonthChange={setDisplayMonth}
          />

          <Separator />

          {/* Quick buttons + Clear */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleQuickDate(0)}>
                今天
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleQuickDate(1)}>
                明天
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleQuickDate(2)}>
                後天
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-destructive hover:text-destructive" onClick={handleClear}>
              清除
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <AlertDialog open={!!validationMsg} onOpenChange={() => {}}>
      <AlertDialogContent className="max-w-sm" onEscapeKeyDown={(e: any) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            輸入格式錯誤
          </AlertDialogTitle>
          <AlertDialogDescription>{validationMsg}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-center gap-2 py-2">
          <span className="text-sm text-muted-foreground">
            {dateError ? "請輸入正確日期 (MM/DD)：" : "請輸入正確時間 (HH:MM)："}
          </span>
          <FixInput
            maxDigits={4}
            separator={dateError ? "/" : ":"}
            initial={dateError ? dateRolling.padded : timeRolling.padded}
            validate={(padded) => {
              if (dateError) {
                const mm = parseInt(padded.slice(0, 2));
                const dd = parseInt(padded.slice(2, 4));
                const y = parseInt(yearInput) || new Date().getFullYear();
                return mm >= 1 && mm <= 12 && dd >= 1 && dd <= getDaysInMonth(new Date(y, mm - 1));
              } else {
                const hh = parseInt(padded.slice(0, 2));
                const mi = parseInt(padded.slice(2, 4));
                return hh <= 23 && mi <= 59;
              }
            }}
            onConfirm={(padded) => {
              if (dateError) {
                dateRolling.reset(padded);
                setDateError(false);
              } else {
                timeRolling.reset(padded);
                setTimeError(false);
              }
              setValidationMsg(null);
              // Commit with corrected value
              const newDatePadded = dateError ? padded : dateRolling.padded;
              const newTimePadded = dateError ? timeRolling.padded : padded;
              const iso = buildIso(yearInput, newDatePadded, newTimePadded);
              onChange(iso);
            }}
          />
        </div>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
