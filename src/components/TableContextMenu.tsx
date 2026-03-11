/**
 * Right-click context menu for table rows.
 * Shows at the cursor position with relevant actions.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  hidden?: boolean;
  disabled?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  rowId: string;
}

interface Props {
  /** Build menu items given the row ID that was right-clicked */
  buildItems: (rowId: string) => ContextMenuItem[];
}

export function useTableContextMenu(
  selectedIds: Set<string>,
  setSelectedIds: (ids: Set<string>) => void,
) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, rowId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // If the row is not selected, select only this row
    if (!selectedIds.has(rowId)) {
      setSelectedIds(new Set([rowId]));
    }

    setMenu({ x: e.clientX, y: e.clientY, rowId });
  }, [selectedIds, setSelectedIds]);

  const closeMenu = useCallback(() => setMenu(null), []);

  return { menu, handleContextMenu, closeMenu };
}

export function TableContextMenuOverlay({
  menu,
  items,
  onClose,
}: {
  menu: { x: number; y: number; rowId: string } | null;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = () => onClose();
    // Delay so the current event doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("click", handler);
      document.addEventListener("contextmenu", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
      document.removeEventListener("contextmenu", handler);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const visibleItems = items.filter((i) => !i.hidden);
  if (visibleItems.length === 0) return null;

  // Adjust position to avoid going off-screen
  const menuWidth = 180;
  const menuHeight = visibleItems.length * 36 + 8;
  const x = menu.x + menuWidth > window.innerWidth ? menu.x - menuWidth : menu.x;
  const y = menu.y + menuHeight > window.innerHeight ? menu.y - menuHeight : menu.y;

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: "auto" }}>
      <div
        ref={ref}
        className="absolute rounded-md border border-border bg-popover shadow-md py-1 min-w-[160px]"
        style={{ left: x, top: y }}
      >
        {visibleItems.map((item) => (
          <button
            key={item.key}
            disabled={item.disabled}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left",
              item.disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
