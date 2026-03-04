import { useState, useCallback, useRef } from "react";

export function useRowSelection(itemIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey && lastClickedRef.current) {
        // Range select
        const startIdx = itemIds.indexOf(lastClickedRef.current);
        const endIdx = itemIds.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (let i = lo; i <= hi; i++) {
              next.add(itemIds[i]);
            }
            return next;
          });
        }
      } else if (e.altKey) {
        // Toggle individual
        toggle(id);
      } else {
        // Normal click: toggle individual
        toggle(id);
      }
      lastClickedRef.current = id;
    },
    [itemIds, toggle]
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(itemIds));
  }, [itemIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = itemIds.length > 0 && itemIds.every((id) => selectedIds.has(id));
  const isSomeSelected = itemIds.some((id) => selectedIds.has(id));

  return {
    selectedIds,
    handleClick,
    selectAll,
    deselectAll,
    isAllSelected,
    isSomeSelected,
    selectedCount: selectedIds.size,
  };
}
