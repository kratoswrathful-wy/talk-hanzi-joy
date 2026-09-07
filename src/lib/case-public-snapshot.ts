export interface CaseSnapshotVersion {
  updatedAt: string;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * P0-A：較新的公開 view 快照必須完整取代舊快取。
 * 遮罩空值不可被「保留較豐富資料」邏輯還原；敏感資料另存 session vault。
 */
export function mergeCasePublicSnapshot<T extends CaseSnapshotVersion>(
  current: T | undefined,
  incoming: T,
): T {
  if (!current) return incoming;
  const currentTs = timestamp(current.updatedAt);
  const incomingTs = timestamp(incoming.updatedAt);
  return incomingTs > 0 && currentTs > 0 && incomingTs < currentTs
    ? current
    : incoming;
}
