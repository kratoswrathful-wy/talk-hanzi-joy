import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * 總表列選取：由外層 td/th 單一 onClick；此僅顯示，避免雙重 toggle。
 */
export function TableRowSelectCheckbox({
  checked,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      className={cn("mx-auto pointer-events-none", className)}
      aria-label={ariaLabel}
      tabIndex={-1}
    />
  );
}

/**
 * 方塊 + 文字整塊可點；Tooltip 請包在整個 LabeledCheckbox 外層。
 */
export function LabeledCheckbox({
  id,
  checked,
  onCheckedChange,
  disabled,
  children,
  className,
  labelClassName,
  labelWrap = false,
}: {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
  /** 長說明文字時允許換行 */
  labelWrap?: boolean;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <label
      className={cn(
        "inline-flex gap-1.5 cursor-pointer select-none",
        labelWrap ? "items-start" : "items-center",
        disabled && "cursor-not-allowed opacity-70",
        labelClassName
      )}
    >
      <Checkbox
        id={inputId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(!!v)}
        className={cn("shrink-0 mt-0.5", labelWrap && "mt-1", className)}
      />
      <span
        className={cn(
          "text-xs",
          !labelWrap && "whitespace-nowrap",
          labelWrap && "whitespace-normal leading-snug",
          disabled && "text-muted-foreground"
        )}
      >
        {children}
      </span>
    </label>
  );
}
