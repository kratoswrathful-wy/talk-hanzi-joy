import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onChange, onCompositionStart, onCompositionEnd, ...props }, ref) => {
    const composingRef = React.useRef(false);
    const pendingEventRef = React.useRef<React.ChangeEvent<HTMLInputElement> | null>(null);

    const handleCompositionStart = (e: React.CompositionEvent<HTMLInputElement>) => {
      composingRef.current = true;
      onCompositionStart?.(e);
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
      composingRef.current = false;
      onCompositionEnd?.(e);
      // Fire the pending change after composition ends
      if (pendingEventRef.current) {
        onChange?.(pendingEventRef.current);
        pendingEventRef.current = null;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (composingRef.current) {
        // During IME composition, store event but still update the DOM value
        pendingEventRef.current = e;
        // Still call onChange to keep controlled input in sync visually
        onChange?.(e);
        return;
      }
      onChange?.(e);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onFocus={(e) => {
          e.target.select();
          onFocus?.(e);
        }}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
