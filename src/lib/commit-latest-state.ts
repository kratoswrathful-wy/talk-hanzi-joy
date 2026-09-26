/**
 * 先用呼叫端持有的最新操作狀態算出下一筆，再交給 setState。
 * 計算與持久化都在 updater 外；不得同步偷讀 React updater 副作用。
 */
export type LatestBox<T> = { current: T };

export function wrapLatestSetter<T>(
  latest: LatestBox<T>,
  setState: (next: NoInfer<T>) => void,
): (action: T | ((prev: T) => T)) => T {
  return (action) => {
    const next = typeof action === "function" ? (action as (prev: T) => T)(latest.current) : action;
    latest.current = next;
    setState(next);
    return next;
  };
}

export function computeThenSet<T>(
  latest: LatestBox<T>,
  setState: (next: NoInfer<T>) => void,
  compute: (prev: NoInfer<T>) => NoInfer<T>,
): T {
  const next = compute(latest.current);
  latest.current = next;
  setState(next);
  return next;
}
