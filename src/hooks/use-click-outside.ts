import { useEffect, useRef } from "react";

export function useClickOutsideCancel(active: boolean, onCancel: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (ref.current?.contains(target)) return;
      // Don't cancel if clicking inside a Radix portal (popover, dialog, tooltip, etc.)
      if (target.closest?.("[data-radix-popper-content-wrapper], [role='dialog'], [role='alertdialog'], [data-radix-dialog-overlay]")) return;
      onCancelRef.current();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active]);

  return ref;
}
