/**
 * Global undo/redo store — supports any module, batch operations, and delete recovery.
 *
 * Each "action" can contain multiple individual changes that are undone/redone atomically.
 */

type AnyRecord = Record<string, any>;

export interface UndoChange {
  /** Module identifier: "cases" | "fees" | "invoices" | "clientInvoices" | "internalNotes" */
  module: string;
  /** The record ID affected */
  recordId: string;
  /** "update" | "delete" | "create" */
  type: "update" | "delete" | "create";
  /** For updates: field → { old, new } */
  fieldChanges?: Record<string, { oldValue: any; newValue: any }>;
  /** For deletes: full snapshot of deleted record */
  deletedSnapshot?: AnyRecord;
  /** For creates: the ID to remove on undo */
  createdId?: string;
}

export interface UndoAction {
  id: string;
  label: string;       // human readable, e.g. "更新 3 個案件的狀態"
  changes: UndoChange[];
  timestamp: number;
}

type ApplyFn = (change: UndoChange, direction: "undo" | "redo") => void;

const MAX_STACK = 50;

class UndoStore {
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private applyHandlers = new Map<string, ApplyFn>();

  /** Register a module's apply handler */
  registerModule(module: string, handler: ApplyFn) {
    this.applyHandlers.set(module, handler);
  }

  /** Push a new action (clears redo stack) */
  push(action: Omit<UndoAction, "id" | "timestamp">) {
    this.undoStack.push({
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
    if (this.undoStack.length > MAX_STACK) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Convenience: push a single field update */
  pushUpdate(module: string, recordId: string, field: string, oldValue: any, newValue: any, label?: string) {
    this.push({
      label: label || `更新欄位`,
      changes: [{
        module,
        recordId,
        type: "update",
        fieldChanges: { [field]: { oldValue, newValue } },
      }],
    });
  }

  /** Convenience: push a batch of same-field updates */
  pushBatchUpdate(module: string, entries: { recordId: string; oldValue: any }[], field: string, newValue: any, label?: string) {
    this.push({
      label: label || `批次更新 ${entries.length} 個項目`,
      changes: entries.map((e) => ({
        module,
        recordId: e.recordId,
        type: "update" as const,
        fieldChanges: { [field]: { oldValue: e.oldValue, newValue } },
      })),
    });
  }

  /** Convenience: push delete(s) */
  pushDelete(module: string, snapshots: AnyRecord[], label?: string) {
    this.push({
      label: label || `刪除 ${snapshots.length} 個項目`,
      changes: snapshots.map((s) => ({
        module,
        recordId: s.id,
        type: "delete" as const,
        deletedSnapshot: s,
      })),
    });
  }

  /** Convenience: push create */
  pushCreate(module: string, recordId: string, label?: string) {
    this.push({
      label: label || `新增項目`,
      changes: [{ module, recordId, type: "create", createdId: recordId }],
    });
  }

  undo(): UndoAction | null {
    const action = this.undoStack.pop();
    if (!action) return null;
    this.redoStack.push(action);
    // Apply in reverse order
    for (let i = action.changes.length - 1; i >= 0; i--) {
      const change = action.changes[i];
      const handler = this.applyHandlers.get(change.module);
      if (handler) handler(change, "undo");
    }
    return action;
  }

  redo(): UndoAction | null {
    const action = this.redoStack.pop();
    if (!action) return null;
    this.undoStack.push(action);
    for (const change of action.changes) {
      const handler = this.applyHandlers.get(change.module);
      if (handler) handler(change, "redo");
    }
    return action;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

export const undoStore = new UndoStore();

// Global keyboard listener
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    // Don't intercept if user is typing in an input/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undoStore.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      undoStore.redo();
    }
  });
}
