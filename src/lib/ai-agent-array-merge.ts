/** 陣列欄位依 id 合併（patch 列覆寫同 id，保留未提及列） */
export function mergeArrayById<T extends { id: string }>(
  existing: T[],
  patch: T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of existing) {
    if (row?.id) map.set(row.id, { ...row });
  }
  for (const row of patch) {
    const id = row?.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const prev = map.get(id);
    map.set(id, prev ? { ...prev, ...row, id } : { ...row, id });
  }
  return Array.from(map.values());
}

/**
 * patch 若為陣列則整包取代；若為 { mergeById: true, items: [...] } 則合併。
 * 回傳 unknown[]（而非 T[]）：value 來自外部（AI agent）輸入，元素形狀未經驗證，
 * 呼叫端本就需逐筆 typeof 檢查後才能安全取欄位，型別上誠實反映這點，避免呼叫端
 * 誤以為已是 T 而略過驗證。
 */
export function resolveArrayPatch<T extends { id: string }>(
  existing: T[],
  value: unknown,
): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as { mergeById?: boolean; items?: unknown[] };
    if (obj.mergeById && Array.isArray(obj.items)) {
      // mergeById 需要以既有列的 T 形狀合併；items 元素是否真的符合 T 由
      // mergeArrayById 內的 spread 與呼叫端後續逐欄驗證共同把關。
      return mergeArrayById(existing, obj.items as T[]);
    }
    if (Array.isArray(obj.items)) return obj.items;
  }
  return null;
}
