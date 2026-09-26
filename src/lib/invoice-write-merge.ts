/** 請款寫入成功後保留當前本地列，只帶入後端時間戳，避免晚回的 SELECT 沖掉其他欄。 */
export function keepLocalInvoiceAfterAck<T extends { updatedAt?: string }>(
  current: T | undefined,
  fromDb: T,
): T {
  if (!current) return fromDb;
  return { ...current, updatedAt: fromDb.updatedAt ?? current.updatedAt };
}

/** 這筆寫入失敗時，只把「仍等於本筆寫入值」的欄位退回，不覆蓋後到的新輸入。 */
export function revertUnchangedJobFields<T extends object>(
  current: T,
  previous: T,
  updates: Partial<T> & Record<string, unknown>,
): T {
  const next = { ...current };
  for (const [key, written] of Object.entries(updates)) {
    if (written === undefined) continue;
    if (Object.is((current as Record<string, unknown>)[key], written)) {
      (next as Record<string, unknown>)[key] = (previous as Record<string, unknown>)[key];
    }
  }
  return next;
}

export function shouldFlushBufferedValue(local: string, persisted: string): boolean {
  return local !== persisted;
}
