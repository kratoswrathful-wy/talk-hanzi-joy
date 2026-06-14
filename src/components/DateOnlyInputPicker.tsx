import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { isSameDay, isSameMonth, getDaysInMonth } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dateOnlyToString,
  formatDateOnlyDisplay,
  parseDateOnly,
  todayDateString,
} from "@/lib/date-only";

export interface DateOnlyInputPickerProps {
  value?: string;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

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

function DateOnlyCalendar({
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
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
    />
  );
}

export default function DateOnlyInputPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "選擇日期",
  className,
}: DateOnlyInputPickerProps) {
  const [open, setOpen] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);

  const parts = parseDateOnly(value);
  const [yearInput, setYearInput] = useState(parts ? String(parts.year) : "");
  const dateRolling = useRollingInput(4, parts ? String(parts.month).padStart(2, "0") + String(parts.day).padStart(2, "0") : "0101");
  const [dateError, setDateError] = useState(false);

  const calendarDate = parts ? new Date(parts.year, parts.month - 1, parts.day) : undefined;
  const [displayMonth, setDisplayMonth] = useState<Date>(calendarDate || new Date());

  const dateDisplay = `${dateRolling.padded.slice(0, 2)}/${dateRolling.padded.slice(2, 4)}`;

  useEffect(() => {
    if (value) {
      const p = parseDateOnly(value);
      if (p) {
        setYearInput(String(p.year));
        dateRolling.reset(String(p.month).padStart(2, "0") + String(p.day).padStart(2, "0"));
        setDisplayMonth(new Date(p.year, p.month - 1, p.day));
      }
    } else {
      setYearInput("");
      dateRolling.reset("0101");
    }
    setDateError(false);
  }, [value]);

  const buildDateString = (year: string, mmdd: string): string | null => {
    const y = parseInt(year, 10);
    const mm = parseInt(mmdd.slice(0, 2), 10);
    const dd = parseInt(mmdd.slice(2, 4), 10);
    return dateOnlyToString(y, mm, dd);
  };

  const commitAll = () => {
    const ds = buildDateString(yearInput, dateRolling.padded);
    if (ds) onChange(ds);
  };

  const validateDate = (): boolean => {
    const mm = parseInt(dateRolling.padded.slice(0, 2), 10);
    const dd = parseInt(dateRolling.padded.slice(2, 4), 10);
    const y = parseInt(yearInput, 10) || new Date().getFullYear();
    if (mm < 1 || mm > 12 || dd < 1 || dd > getDaysInMonth(new Date(y, mm - 1))) {
      setDateError(true);
      return false;
    }
    setDateError(false);
    return true;
  };

  const handleCalendarSelect = (selected: Date | undefined) => {
    if (!selected) return;
    const sy = selected.getFullYear();
    const sm = selected.getMonth() + 1;
    const sd = selected.getDate();
    setYearInput(String(sy));
    const mmdd = String(sm).padStart(2, "0") + String(sd).padStart(2, "0");
    dateRolling.reset(mmdd);
    setDateError(false);
    const ds = dateOnlyToString(sy, sm, sd);
    if (ds) onChange(ds);
  };

  const handleClear = () => {
    setYearInput("");
    dateRolling.reset("0101");
    setDateError(false);
    onChange(undefined);
    setOpen(false);
  };

  const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === "Enter") {
      if (validateDate()) {
        commitAll();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Tab") {
      if (validateDate()) commitAll();
      return;
    }
    if (e.key === "Backspace" || /^\d$/.test(e.key)) {
      setDateError(false);
      dateRolling.handleKey(e.key);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (disabled) return;
    if (v && !value) {
      const today = todayDateString();
      const p = parseDateOnly(today);
      if (p) {
        setYearInput(String(p.year));
        dateRolling.reset(String(p.month).padStart(2, "0") + String(p.day).padStart(2, "0"));
        setDisplayMonth(new Date(p.year, p.month - 1, p.day));
        onChange(today);
      }
    }
    if (v) setTimeout(() => dateRef.current?.focus(), 50);
    if (!v) {
      if (!validateDate()) return;
      commitAll();
    }
    setOpen(v);
  };

  const displayText = value ? formatDateOnlyDisplay(value) : null;

  return (
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
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onBlur={() => { if (validateDate() && yearInput) commitAll(); }}
              placeholder="yyyy"
              className="flex h-9 w-[52px] rounded-md border border-input bg-background px-2 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              ref={dateRef}
              type="text"
              readOnly
              value={dateDisplay}
              onKeyDown={handleDateKeyDown}
              onBlur={() => { if (validateDate() && yearInput) commitAll(); }}
              className={cn(
                "flex h-9 w-[70px] rounded-md border bg-background px-2 py-1 text-sm text-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 cursor-text caret-transparent select-none",
                dateError ? "border-destructive focus-visible:ring-destructive" : "border-input focus-visible:ring-ring"
              )}
            />
          </div>
          <DateOnlyCalendar
            selected={calendarDate}
            onSelect={handleCalendarSelect}
            displayMonth={displayMonth}
            onMonthChange={setDisplayMonth}
          />
          {value && (
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={handleClear}>
              清除日期
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
