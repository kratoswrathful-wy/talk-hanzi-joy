import { useState, useRef, useEffect, useCallback } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface DateTimePickerProps {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Rolling 4-digit time input.
 * Typing digits pushes from right to left, like a calculator display.
 * e.g. type "1" → 00:01, "12" → 00:12, "123" → 01:23, "1230" → 12:30
 */
function useRollingTimeInput(initial: string) {
  // Store raw digit buffer (up to 4 digits)
  const [digits, setDigits] = useState<string>("");

  const formatDigits = useCallback((d: string): string => {
    const padded = d.padStart(4, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
  }, []);

  const display = formatDigits(digits);

  const reset = useCallback((timeStr: string) => {
    // Parse "HH:mm" back to raw digits, stripping leading zeros for buffer
    const clean = timeStr.replace(":", "");
    // Keep full 4 digits
    setDigits(clean.padStart(4, "0"));
  }, []);

  const handleKey = useCallback((key: string): string | null => {
    if (key === "Backspace") {
      setDigits((prev) => {
        const next = prev.length > 1 ? prev.slice(0, -1) : "0";
        return next;
      });
      return null; // return updated display after state settles
    }
    if (!/^\d$/.test(key)) return null;
    setDigits((prev) => {
      // Append digit, keep max 4
      let next = prev + key;
      // Remove leading zeros beyond 4 chars
      if (next.length > 4) next = next.slice(next.length - 4);
      return next;
    });
    return null;
  }, []);

  const validate = useCallback((): { valid: boolean; hours: number; minutes: number } => {
    const padded = digits.padStart(4, "0");
    const h = parseInt(padded.slice(0, 2));
    const m = parseInt(padded.slice(2, 4));
    return { valid: h >= 0 && h <= 23 && m >= 0 && m <= 59, hours: h, minutes: m };
  }, [digits]);

  return { display, reset, handleKey, validate, formatDigits, digits };
}

export default function DateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "選擇日期與時間",
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const timeRef = useRef<HTMLInputElement>(null);

  const date = value ? new Date(value) : null;

  const [dateInput, setDateInput] = useState(date ? format(date, "yyyy/MM/dd") : "");
  const rolling = useRollingTimeInput(date ? format(date, "HH:mm") : "00:00");
  const [timeError, setTimeError] = useState(false);

  // Sync from outside
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setDateInput(format(d, "yyyy/MM/dd"));
      rolling.reset(format(d, "HH:mm"));
    } else {
      setDateInput("");
      rolling.reset("00:00");
    }
    setTimeError(false);
  }, [value]);

  const buildIso = (dateStr: string, timeStr: string): string | null => {
    if (!dateStr) return null;
    const match = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!match) return null;
    const y = parseInt(match[1]);
    const m = parseInt(match[2]) - 1;
    const d = parseInt(match[3]);
    const dt = new Date(y, m, d);
    if (isNaN(dt.getTime())) return null;

    const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeParts) {
      dt.setHours(parseInt(timeParts[1]), parseInt(timeParts[2]), 0, 0);
    }
    return dt.toISOString();
  };

  const commitChange = (dateStr: string, timeStr: string) => {
    const iso = buildIso(dateStr, timeStr);
    onChange(iso);
  };

  const validateAndCommitTime = (): boolean => {
    const { valid } = rolling.validate();
    if (!valid) {
      setTimeError(true);
      toast.error("時間格式不正確，小時須為 0-23，分鐘須為 0-59");
      return false;
    }
    setTimeError(false);
    if (dateInput) commitChange(dateInput, rolling.display);
    return true;
  };

  const handleCalendarSelect = (selected: Date | undefined) => {
    if (!selected) return;
    const ds = format(selected, "yyyy/MM/dd");
    setDateInput(ds);
    commitChange(ds, rolling.display || "00:00");
    setTimeout(() => {
      timeRef.current?.focus();
    }, 50);
  };

  const handleQuickDate = (daysFromNow: number) => {
    const target = startOfDay(addDays(new Date(), daysFromNow));
    const ds = format(target, "yyyy/MM/dd");
    setDateInput(ds);
    commitChange(ds, rolling.display || "00:00");
    setTimeout(() => {
      timeRef.current?.focus();
    }, 50);
  };

  const handleClear = () => {
    setDateInput("");
    rolling.reset("00:00");
    setTimeError(false);
    onChange(null);
    setOpen(false);
  };

  const handleDateInputBlur = () => {
    if (dateInput) commitChange(dateInput, rolling.display);
  };

  const handleTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === "Enter") {
      if (validateAndCommitTime()) {
        setOpen(false);
      }
      return;
    }
    if (e.key === "Tab") {
      validateAndCommitTime();
      return;
    }
    if (e.key === "Backspace" || /^\d$/.test(e.key)) {
      setTimeError(false);
      rolling.handleKey(e.key);
    }
  };

  const handleTimeBlur = () => {
    validateAndCommitTime();
  };

  const handleOpenChange = (v: boolean) => {
    if (disabled) return;
    if (!v) {
      // Closing - validate time
      const { valid } = rolling.validate();
      if (!valid) {
        setTimeError(true);
        toast.error("時間格式不正確，小時須為 0-23，分鐘須為 0-59");
        return; // prevent closing
      }
      setTimeError(false);
      if (dateInput) commitChange(dateInput, rolling.display);
    }
    setOpen(v);
  };

  const displayText = date
    ? `${format(date, "yyyy/MM/dd")} ${format(date, "HH:mm")}`
    : null;

  return (
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
          {/* Date + Time inputs */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              onBlur={handleDateInputBlur}
              placeholder="yyyy/mm/dd"
              className="flex h-8 w-[110px] rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              ref={timeRef}
              type="text"
              value={rolling.display}
              onKeyDown={handleTimeKeyDown}
              onBlur={handleTimeBlur}
              readOnly
              className={cn(
                "flex h-8 w-[70px] rounded-md border bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 cursor-text caret-transparent",
                timeError
                  ? "border-destructive focus-visible:ring-destructive"
                  : "border-input focus-visible:ring-ring"
              )}
            />
          </div>

          {/* Calendar */}
          <Calendar
            mode="single"
            selected={date || undefined}
            onSelect={handleCalendarSelect}
            className={cn("p-0 pointer-events-auto")}
            weekStartsOn={1}
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
  );
}