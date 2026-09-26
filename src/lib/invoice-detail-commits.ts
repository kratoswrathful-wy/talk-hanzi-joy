import { computeThenSet, type LatestBox } from "./commit-latest-state";
import { applyEditLogFieldChange, type BurstMap, type SimplePersistedLog } from "./edit-log-coalesce";
import { shouldFlushBufferedValue } from "./invoice-write-merge";

export function appendInvoiceEditLog(opts: {
  latest: LatestBox<SimplePersistedLog[]>;
  setLogs: (next: SimplePersistedLog[]) => void;
  burstMap: { current: BurstMap };
  started: boolean;
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  author: string;
  formatTimestamp: (d: Date) => string;
}): SimplePersistedLog[] | null {
  if (!opts.started || opts.oldValue === opts.newValue) return null;
  return computeThenSet(opts.latest, opts.setLogs, (prev) => {
    const { nextLogs, nextBurstMap } = applyEditLogFieldChange({
      fieldKey: opts.field,
      oldValue: opts.oldValue,
      newValue: opts.newValue,
      now: Date.now(),
      author: opts.author,
      formatTimestamp: opts.formatTimestamp,
      fieldLabel: opts.fieldLabel,
      existingLogs: prev,
      burstMap: opts.burstMap.current,
    });
    opts.burstMap.current = nextBurstMap;
    return nextLogs;
  });
}

export function invoiceUpdatesWithOptionalLogs<T extends Record<string, unknown>>(
  fieldUpdates: T,
  logs: SimplePersistedLog[] | null,
): T & { edit_logs?: SimplePersistedLog[] } {
  if (!logs) return fieldUpdates;
  return { ...fieldUpdates, edit_logs: logs };
}

export function collectBufferedInvoiceFlushes(input: {
  title?: { local: string; persisted: string };
  note?: { local: string; persisted: string };
  invoiceNumber?: { local: string; persisted: string };
}): Array<{ field: "title" | "note" | "invoiceNumber"; local: string; persisted: string }> {
  const out: Array<{ field: "title" | "note" | "invoiceNumber"; local: string; persisted: string }> = [];
  if (input.title && shouldFlushBufferedValue(input.title.local, input.title.persisted)) {
    out.push({ field: "title", local: input.title.local, persisted: input.title.persisted });
  }
  if (input.note && shouldFlushBufferedValue(input.note.local, input.note.persisted)) {
    out.push({ field: "note", local: input.note.local, persisted: input.note.persisted });
  }
  if (input.invoiceNumber && shouldFlushBufferedValue(input.invoiceNumber.local, input.invoiceNumber.persisted)) {
    out.push({ field: "invoiceNumber", local: input.invoiceNumber.local, persisted: input.invoiceNumber.persisted });
  }
  return out;
}
