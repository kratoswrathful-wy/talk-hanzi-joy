import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface MultilineInputProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  minRows?: number;
  maxRows?: number;
  borderless?: boolean;
}

const MultilineInput = React.forwardRef<HTMLTextAreaElement, MultilineInputProps>(
  ({ className, minRows = 1, maxRows, borderless = false, value, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const autoResize = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = 'auto';
      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = parseInt(computedStyle.lineHeight) || 20;
      const paddingTop = parseInt(computedStyle.paddingTop) || 0;
      const paddingBottom = parseInt(computedStyle.paddingBottom) || 0;
      const borderTop = parseInt(computedStyle.borderTopWidth) || 0;
      const borderBottom = parseInt(computedStyle.borderBottomWidth) || 0;
      const minHeight = (lineHeight * minRows) + paddingTop + paddingBottom + borderTop + borderBottom;
      const maxHeight = maxRows
        ? (lineHeight * maxRows) + paddingTop + paddingBottom + borderTop + borderBottom
        : Infinity;
      const newHeight = maxHeight === Infinity
        ? Math.max(textarea.scrollHeight, minHeight)
        : Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }, [minRows, maxRows]);

    useEffect(() => {
      autoResize();
    }, [value, autoResize]);

    useEffect(() => {
      const handleResize = () => setTimeout(autoResize, 0);
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    }, [autoResize]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && e.shiftKey) return;
      props.onKeyDown?.(e);
    };

    const mergedRef = React.useCallback((node: HTMLTextAreaElement | null) => {
      (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }, [ref]);

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      e.target.select();
      props.onFocus?.(e);
    };

    return (
      <textarea
        ref={mergedRef}
        className={cn(
          "flex w-full rounded-md bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none leading-normal",
          borderless
            ? "border border-transparent hover:border-input focus:border-input"
            : "border border-input",
          className,
        )}
        {...props}
        value={value}
        onKeyDown={handleKeyDown}
        onInput={autoResize}
        onFocus={handleFocus}
        style={{ overflow: 'hidden' }}
      />
    );
  }
);

MultilineInput.displayName = "MultilineInput";

export { MultilineInput };
