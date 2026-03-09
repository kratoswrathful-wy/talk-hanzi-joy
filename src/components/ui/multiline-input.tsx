import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface MultilineInputProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /**
   * Minimum height in rows (default: 1)
   */
  minRows?: number;
  /**
   * Maximum height in rows (default: 10)
   */
  maxRows?: number;
  /**
   * Borderless mode - only show border on focus
   */
  borderless?: boolean;
}

const MultilineInput = React.forwardRef<HTMLTextAreaElement, MultilineInputProps>(
  ({ className, minRows = 1, maxRows = 10, borderless = false, value, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize function
    const autoResize = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      
      // Calculate the line height
      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = parseInt(computedStyle.lineHeight) || 20;
      const paddingTop = parseInt(computedStyle.paddingTop) || 0;
      const paddingBottom = parseInt(computedStyle.paddingBottom) || 0;
      const borderTop = parseInt(computedStyle.borderTopWidth) || 0;
      const borderBottom = parseInt(computedStyle.borderBottomWidth) || 0;
      
      // Calculate min and max heights
      const minHeight = (lineHeight * minRows) + paddingTop + paddingBottom + borderTop + borderBottom;
      const maxHeight = maxRows
        ? (lineHeight * maxRows) + paddingTop + paddingBottom + borderTop + borderBottom
        : Infinity;
      
      // Set the height based on content, but within min/max bounds
      const newHeight = maxHeight === Infinity
        ? Math.max(textarea.scrollHeight, minHeight)
        : Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }, [minRows, maxRows]);

    // Auto-resize on value change
    useEffect(() => {
      autoResize();
    }, [value, autoResize]);

    // Auto-resize on mount and window resize
    useEffect(() => {
      const handleResize = () => {
        setTimeout(autoResize, 0);
      };
      
      window.addEventListener('resize', handleResize);
      handleResize();
      
      return () => window.removeEventListener('resize', handleResize);
    }, [autoResize]);

    // Handle keyboard events
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Skip during IME composition (e.g. Zhuyin, Pinyin input)
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      
      // Allow shift+enter for new lines
      if (e.key === 'Enter' && e.shiftKey) {
        return;
      }
      
      // Call parent onKeyDown if provided
      props.onKeyDown?.(e);
    };

    // Merge refs
    const mergedRef = React.useCallback((node: HTMLTextAreaElement | null) => {
      (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }, [ref]);

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
        value={value}
        onKeyDown={handleKeyDown}
        onInput={autoResize}
        style={{
          overflow: 'hidden',
        }}
        {...props}
      />
    );
  }
);

MultilineInput.displayName = "MultilineInput";

export { MultilineInput };