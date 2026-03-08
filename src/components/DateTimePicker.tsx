import { useState, useRef, useEffect } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface DateTimePickerProps {
  value: string | null; // ISO string or null
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
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
  const [timeInput, setTimeInput] = useState(date ? format(date, "HH:mm") : "");

  // Sync from outside
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setDateInput(format(d, "yyyy/MM/dd"));
      setTimeInput(format(d, "HH:mm"));
    } else {
      setDateInput("");
      setTimeInput("");
    }
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

  const handleCalendarSelect = (selected: Date | undefined) => {
    if (!selected) return;
    const ds = format(selected, "yyyy/MM/dd");
    setDateInput(ds);
    commitChange(ds, timeInput || "00:00");
    if (!timeInput) setTimeInput("00:00");
    // Auto-focus time input
    setTimeout(() => timeRef.current?.focus(), 50);
  };

  const handleQuickDate = (daysFromNow: number) => {
    const target = startOfDay(addDays(new Date(), daysFromNow));
    const ds = format(target, "yyyy/MM/dd");
    setDateInput(ds);
    commitChange(ds, timeInput || "00:00");
    if (!timeInput) setTimeInput("00:00");
    setTimeout(() => timeRef.current?.focus(), 50);
  };

  const handleClear = () => {
    setDateInput("");
    setTimeInput("");
    onChange(null);
    setOpen(false);
  };

  const handleDateInputBlur = () => {
    if (dateInput) commitChange(dateInput, timeInput);
  };

  const handleTimeInputBlur = () => {
    if (dateInput) commitChange(dateInput, timeInput);
  };

  const displayText = date
    ? `${format(date, "yyyy/MM/dd")} ${format(date, "HH:mm")}`
    : null;

  return (
    <Popover open={open} onOpenChange={(v) => { if (!disabled) setOpen(v); }}>
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
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              onBlur={handleTimeInputBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTimeInputBlur();
                  setOpen(false);
                }
              }}
              placeholder="HH:mm"
              className="flex h-8 w-[70px] rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
