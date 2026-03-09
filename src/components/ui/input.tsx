import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onChange, ...props }, ref) => {
    const composingRef = React.useRef(false);

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
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          // Fire onChange after composition ends so the final value is committed
          const nativeEvent = new Event('input', { bubbles: true });
          e.currentTarget.dispatchEvent(nativeEvent);
        }}
        onChange={(e) => {
          if (!composingRef.current) {
            onChange?.(e);
          }
        }}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
