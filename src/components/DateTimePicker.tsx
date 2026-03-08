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

interface DateTimePickerProps {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
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

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
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
        value={display}
        readOnly
        onKeyDown={(e) => {
          e.preventDefault();
          if (e.key === "Enter") {
            tryConfirm();
            return;
          }
          if (e.key === "Backspace" || /^\d$/.test(e.key)) {
            setError(false);
            rolling.handleKey(e.key);
          }
        }}
        className={cn(
          "flex h-9 w-[70px] rounded-md border bg-background px-2 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-1 cursor-text caret-transparent",
          error ? "border-destructive focus-visible:ring-destructive" : "border-input focus-visible:ring-ring"
        )}
      />
      <Button size="sm" onClick={tryConfirm}>確認</Button>
    </div>
  );
}


  value,
  onChange,
  disabled = false,
  placeholder = "選擇日期與時間",
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const parsedDate = value ? new Date(value) : null;

  // Year is a regular text input
  const [yearInput, setYearInput] = useState(parsedDate ? format(parsedDate, "yyyy") : "");
  // MMDD rolling input
  const dateRolling = useRollingInput(4, parsedDate ? format(parsedDate, "MMdd") : "0101");
  // HHmm rolling input
  const timeRolling = useRollingInput(4, parsedDate ? format(parsedDate, "HHmm") : "0000");

  const [timeError, setTimeError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [displayMonth, setDisplayMonth] = useState<Date>(parsedDate || new Date());

  const dateDisplay = `${dateRolling.padded.slice(0, 2)}/${dateRolling.padded.slice(2, 4)}`;
  const timeDisplay = `${timeRolling.padded.slice(0, 2)}:${timeRolling.padded.slice(2, 4)}`;

  // Sync from outside
  useEffect(() => {
    if (value) {
      const d = new Date(value);
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
  }, [value]);

  const buildIso = (year: string, mmdd: string, hhmm: string): string | null => {
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
    const dt = new Date(y, mm - 1, dd, hh, mi, 0, 0);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
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
    setYearInput(format(selected, "yyyy"));
    dateRolling.reset(format(selected, "MMdd"));
    setDateError(false);
    // Commit immediately
    const iso = buildIso(format(selected, "yyyy"), format(selected, "MMdd"), timeRolling.padded);
    onChange(iso);
    setTimeout(() => timeRef.current?.focus(), 50);
  };

  const handleQuickDate = (daysFromNow: number) => {
    const target = startOfDay(addDays(new Date(), daysFromNow));
    setYearInput(format(target, "yyyy"));
    dateRolling.reset(format(target, "MMdd"));
    setDateError(false);
    setDisplayMonth(target);
    const iso = buildIso(format(target, "yyyy"), format(target, "MMdd"), timeRolling.padded);
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
      // Default to next whole hour
      const now = new Date();
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(now.getHours() + 1);
      setYearInput(format(next, "yyyy"));
      dateRolling.reset(format(next, "MMdd"));
      timeRolling.reset(format(next, "HHmm"));
      setDisplayMonth(next);
      setDateError(false);
      setTimeError(false);
      onChange(next.toISOString());
    }
    if (v) {
      // Always focus date input when opening
      setTimeout(() => dateRef.current?.focus(), 50);
    }
    if (!v) {
      if (!validateDate() || !validateTime()) return;
      commitAll();
    }
    setOpen(v);
  };

  const displayText = parsedDate
    ? `${format(parsedDate, "yyyy/MM/dd")} ${format(parsedDate, "HH:mm")}`
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
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <div className="p-3 space-y-3">
          {/* Year + MM/DD + HH:mm inputs */}
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
          </div>

          {/* Calendar */}
          <DateTimeCalendar
            selected={parsedDate || undefined}
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