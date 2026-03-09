import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { format, addDays, startOfDay, isSameMonth, isSameDay, getDaysInMonth } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
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

interface DateTimePickerProps {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** UTC offset hours from user profile timezone. Default 8 (UTC+8). */
  utcOffsetHours?: number;
}

/* ── helpers ── */
function formatOffsetLabel(offsetHours: number): string {
  if (offsetHours === 0) return "UTC+0";
  const sign = offsetHours >= 0 ? "+" : "-";
  const abs = Math.abs(offsetHours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return m ? `UTC${sign}${h}:${String(m).padStart(2, "0")}` : `UTC${sign}${h}`;
}

/** Convert a UTC Date to a "local" Date shifted by offsetHours (for display only) */
function utcToLocal(utcDate: Date, offsetHours: number): Date {
  return new Date(utcDate.getTime() + offsetHours * 60 * 60 * 1000);
}

/** Build an ISO string from local inputs, converting back to UTC */
function buildIsoWithOffset(year: string, mmdd: string, hhmm: string, offsetHours: number): string | null {
  const y = parseInt(year);
  if (!year || isNaN(y) || y < 1900 || y > 2100) return null;
  const mm = parseInt(mmdd.slice(0, 2));
  const dd = parseInt(mmdd.slice(2, 4));
  if (mm < 1 || mm > 12 || dd < 1) return null;
  const maxDay = getDaysInMonth(new Date(y, mm - 1));
  if (dd > maxDay) return null;
  const hh = parseInt(hhmm.slice(0, 2));
  const mi = parseInt(hhmm.slice(2, 4));
  if (hh > 23 || mi > 59) return null;
  // Build as UTC then subtract offset
  const utcMs = Date.UTC(y, mm - 1, dd, hh, mi, 0, 0) - offsetHours * 60 * 60 * 1000;
  const dt = new Date(utcMs);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
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
        onChange={() => {}}
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
      <Button size="sm" onClick={tryConfirm}>確認</Button>
    </div>
  );
}

/* ── UTC offset spinner ── */
function UtcOffsetSpinner({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow typing negative sign, numbers, colon
    if (raw === "" || raw === "-" || raw === "+") return;
    const num = parseFloat(raw);
    if (!isNaN(num) && num >= -12 && num <= 14) {
      onChange(num);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">UTC</span>
      <div className="flex flex-col">
        <button
          type="button"
          className="h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onChange(Math.min(14, value + 1))}
          tabIndex={-1}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onChange(Math.max(-12, value - 1))}
          tabIndex={-1}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value >= 0 ? `+${value}` : `${value}`}
        onChange={handleInputChange}
        onFocus={() => inputRef.current?.select()}
        className="flex h-8 w-[38px] rounded-md border border-input bg-background px-1 py-1 text-xs text-center ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}

export default function DateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "選擇日期與時間",
  className,
  utcOffsetHours: initialOffset = 8,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const [currentOffset, setCurrentOffset] = useState(initialOffset);

  // Sync offset if prop changes
  useEffect(() => {
    setCurrentOffset(initialOffset);
  }, [initialOffset]);

  // Parse value (UTC ISO) and convert to local for display
  const parsedUtc = value ? new Date(value) : null;
  const parsedLocal = parsedUtc ? utcToLocal(parsedUtc, currentOffset) : null;

  // Year is a regular text input
  const [yearInput, setYearInput] = useState(parsedLocal ? format(parsedLocal, "yyyy") : "");
  // MMDD rolling input
  const dateRolling = useRollingInput(4, parsedLocal ? format(parsedLocal, "MMdd") : "0101");
  // HHmm rolling input
  const timeRolling = useRollingInput(4, parsedLocal ? format(parsedLocal, "HHmm") : "0000");

  const [timeError, setTimeError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [displayMonth, setDisplayMonth] = useState<Date>(parsedLocal || new Date());

  const dateDisplay = `${dateRolling.padded.slice(0, 2)}/${dateRolling.padded.slice(2, 4)}`;
  const timeDisplay = `${timeRolling.padded.slice(0, 2)}:${timeRolling.padded.slice(2, 4)}`;

  // Sync from outside
  useEffect(() => {
    if (value) {
      const d = utcToLocal(new Date(value), currentOffset);
      setYearInput(format(d, "yyyy"));
      dateRolling.reset(format(d, "MMdd"));
      timeRolling.reset(format(d, "HHmm"));
      setDisplayMonth(d);
    } else {
      setYearInput("");
      dateRolling.reset("0101");
      timeRolling.reset("0000");
    }
    setTimeError(false);
    setDateError(false);
    setValidationMsg(null);
  }, [value, currentOffset]);

  const commitAll = () => {
    const iso = buildIsoWithOffset(yearInput, dateRolling.padded, timeRolling.padded, currentOffset);
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
    setYearInput(format(selected, "yyyy"));
    dateRolling.reset(format(selected, "MMdd"));
    setDateError(false);
    const iso = buildIsoWithOffset(format(selected, "yyyy"), format(selected, "MMdd"), timeRolling.padded, currentOffset);
    onChange(iso);
    setTimeout(() => timeRef.current?.focus(), 50);
  };

  const handleQuickDate = (daysFromNow: number) => {
    const target = startOfDay(addDays(new Date(), daysFromNow));
    setYearInput(format(target, "yyyy"));
    dateRolling.reset(format(target, "MMdd"));
    setDateError(false);
    setDisplayMonth(target);
    const iso = buildIsoWithOffset(format(target, "yyyy"), format(target, "MMdd"), timeRolling.padded, currentOffset);
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
      // Default to next whole hour in the current offset
      const now = new Date();
      const localNow = utcToLocal(now, currentOffset);
      const next = new Date(localNow);
      next.setMinutes(0, 0, 0);
      next.setHours(localNow.getHours() + 1);
      setYearInput(format(next, "yyyy"));
      dateRolling.reset(format(next, "MMdd"));
      timeRolling.reset(format(next, "HHmm"));
      setDisplayMonth(next);
      setDateError(false);
      setTimeError(false);
      const iso = buildIsoWithOffset(format(next, "yyyy"), format(next, "MMdd"), format(next, "HHmm"), currentOffset);
      onChange(iso);
    }
    if (v) {
      setTimeout(() => dateRef.current?.focus(), 50);
    }
    if (!v) {
      if (!validateDate() || !validateTime()) return;
      commitAll();
    }
    setOpen(v);
  };

  const handleOffsetChange = (newOffset: number) => {
    setCurrentOffset(newOffset);
    // Re-commit with new offset if we have a value
    if (yearInput) {
      const iso = buildIsoWithOffset(yearInput, dateRolling.padded, timeRolling.padded, newOffset);
      onChange(iso);
    }
  };

  const offsetLabel = formatOffsetLabel(currentOffset);

  const displayText = parsedLocal
    ? `${format(parsedLocal, "yyyy/MM/dd")} ${format(parsedLocal, "HH:mm")}`
    : null;

  return (
    <>
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start text-left font-normal h-9",
            !displayText && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {displayText || placeholder}
          {displayText && (
            <span className="ml-2 text-muted-foreground text-xs">{offsetLabel}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <div className="p-3 space-y-3">
          {/* Year + MM/DD + HH:mm + UTC offset inputs */}
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
            <UtcOffsetSpinner value={currentOffset} onChange={handleOffsetChange} />
          </div>

          {/* Calendar */}
          <DateTimeCalendar
            selected={parsedLocal || undefined}
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
              const newDatePadded = dateError ? padded : dateRolling.padded;
              const newTimePadded = dateError ? timeRolling.padded : padded;
              const iso = buildIsoWithOffset(yearInput, newDatePadded, newTimePadded, currentOffset);
              onChange(iso);
            }}
          />
        </div>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
