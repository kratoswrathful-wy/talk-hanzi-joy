/**
 * 變更紀錄：即時寫入，同一欄位在 burst 內若於 EDIT_LOG_BURST_MS 內回到錨點值，則撤銷該段紀錄。
 */
export const EDIT_LOG_BURST_MS = 5 * 60 * 1000;

export type FieldBurstState = {
  /** 本輪編輯開始時的「基準值」（回到此值則整段撤銷） */
  anchor: string;
  burstStartedAt: number;
  /** 本 burst 內已寫入 DB 的 log id（撤銷時移除） */
  logIds: string[];
};

export type BurstMap = Record<string, FieldBurstState>;

function serialize(v: string | number | boolean | undefined | null): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

/** 撤銷過期 burst（未回到錨點者視為已定型，下一筆另起新 burst） */
export function expireBursts(burstMap: BurstMap, now: number, burstMs: number = EDIT_LOG_BURST_MS): BurstMap {
  const next = { ...burstMap };
  for (const key of Object.keys(next)) {
    const b = next[key];
    if (now - b.burstStartedAt > burstMs) delete next[key];
  }
  return next;
}

export type SimplePersistedLog = {
  id: string;
  changedBy: string;
  description: string;
  timestamp: string;
  /** 用於撤銷比對；舊資料可無 */
  fieldKey?: string;
};

/**
 * 處理單一欄位變更：回傳新日誌列表與 burst 狀態（呼叫端需 setState + 寫入 store）。
 */
export function applyEditLogFieldChange(opts: {
  fieldKey: string;
  oldValue: string | number | boolean | undefined | null;
  newValue: string | number | boolean | undefined | null;
  now: number;
  author: string;
  formatTimestamp: (d: Date) => string;
  fieldLabel: string;
  existingLogs: SimplePersistedLog[];
  burstMap: BurstMap;
  burstMs?: number;
}): { nextLogs: SimplePersistedLog[]; nextBurstMap: BurstMap; newLogCount: number } {
  const burstMs = opts.burstMs ?? EDIT_LOG_BURST_MS;
  const oldS = serialize(opts.oldValue);
  const newS = serialize(opts.newValue);
  if (oldS === newS) {
    return { nextLogs: opts.existingLogs, nextBurstMap: opts.burstMap, newLogCount: 0 };
  }

  let burstMap = expireBursts(opts.burstMap, opts.now, burstMs);
  let logs = [...opts.existingLogs];

  const burst = burstMap[opts.fieldKey];
  if (burst && opts.now - burst.burstStartedAt <= burstMs && newS === burst.anchor) {
    const remove = new Set(burst.logIds);
    logs = logs.filter((l) => !remove.has(l.id));
    const { [opts.fieldKey]: _, ...rest } = burstMap;
    burstMap = rest;
    return { nextLogs: logs, nextBurstMap: burstMap, newLogCount: -burst.logIds.length };
  }

  let b = burstMap[opts.fieldKey];
  if (!b || opts.now - b.burstStartedAt > burstMs) {
    b = { anchor: oldS, burstStartedAt: opts.now, logIds: [] };
  }

  const id = `log-${opts.now}-${Math.random().toString(36).slice(2, 10)}`;
  const entry: SimplePersistedLog = {
    id,
    changedBy: opts.author,
    description: `${opts.fieldLabel} ${oldS} → ${newS}`,
    timestamp: opts.formatTimestamp(new Date(opts.now)),
    fieldKey: opts.fieldKey,
  };
  logs = [...logs, entry];
  b = { ...b, logIds: [...b.logIds, id] };
  burstMap = { ...burstMap, [opts.fieldKey]: b };

  return { nextLogs: logs, nextBurstMap: burstMap, newLogCount: 1 };
}
