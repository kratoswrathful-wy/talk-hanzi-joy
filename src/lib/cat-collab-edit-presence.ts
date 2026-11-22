/**
 * 同一人持續編同一句時，保留最初的開始時間。
 * 後續按鍵若改寫時間，先編輯的人會被當成後到，焦點被移走後對方的譯文會直接蓋上。
 */
export function mergeCollabEditPresence<T extends { segmentId: string | null; at: string }>(
  previous: T | undefined,
  incoming: T,
): T {
  if (!previous?.at) return incoming;
  if (String(previous.segmentId ?? "") !== String(incoming.segmentId ?? "")) return incoming;
  const previousMs = Date.parse(previous.at);
  const incomingMs = Date.parse(incoming.at);
  if (Number.isFinite(previousMs) && Number.isFinite(incomingMs) && incomingMs < previousMs) {
    return incoming;
  }
  return { ...incoming, at: previous.at };
}
