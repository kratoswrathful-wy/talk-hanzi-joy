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

/** patch 若為陣列則整包取代；若為 { mergeById: true, items: [...] } 則合併 */
export function resolveArrayPatch<T extends { id: string }>(
  existing: T[],
  value: unknown,
): T[] | null {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as { mergeById?: boolean; items?: T[] };
    if (obj.mergeById && Array.isArray(obj.items)) {
      return mergeArrayById(existing, obj.items);
    }
    if (Array.isArray(obj.items)) return obj.items;
  }
  return null;
}
