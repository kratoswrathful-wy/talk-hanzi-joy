import { useCallback, useRef, useEffect } from "react";

export interface UndoEntry {
  feeId: string;
  field: string;
  oldValue: string | boolean;
  newValue: string | boolean;
  /** For nested fields like clientInfo.client */
  nested?: string;
}

interface UndoRedoOptions {
  onApply: (entry: UndoEntry, isUndo: boolean) => void;
}

export function useUndoRedo({ onApply }: UndoRedoOptions) {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  const push = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    redoStack.current = []; // clear redo on new action
  }, []);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    onApply(entry, true);
  }, [onApply]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    onApply(entry, false);
  }, [onApply]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return { push, undo, redo };
}
