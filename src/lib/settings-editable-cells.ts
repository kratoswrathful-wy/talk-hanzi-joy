import type { KeyboardEvent } from "react";

/** Find the next editable cell in DOM order and click it（設定頁報價格／級距用） */
export function focusNextEditableCell(container: Element | null, reverse = false) {
  const allCells = Array.from(document.querySelectorAll<HTMLElement>("[data-editable-cell]"));
  if (allCells.length === 0) return;

  const currentIndex = allCells.findIndex((cell) => container?.contains(cell) || cell === container);

  const nextIndex = reverse
    ? (currentIndex - 1 + allCells.length) % allCells.length
    : (currentIndex + 1) % allCells.length;

  allCells[nextIndex]?.click();
}

export function handleTabKeyDown(e: KeyboardEvent<HTMLInputElement>, onSave: () => void) {
  if (e.key === "Tab") {
    e.preventDefault();
    const container = (e.target as HTMLElement).closest("[data-cell-container]");
    const reverse = e.shiftKey;
    onSave();
    requestAnimationFrame(() => {
      focusNextEditableCell(container, reverse);
    });
  }
}
