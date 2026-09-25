/**
 * 先用最新本地狀態算出下一筆，再交給 setState。
 * updater 只做計算，不得在裡面通知 store 或寫後端。
 */
export function computeThenSet<T>(
  setState: (updater: (prev: T) => T) => void,
  compute: (prev: T) => T,
): T {
  let next: T | undefined;
  setState((prev) => {
    next = compute(prev);
    return next;
  });
  if (next === undefined) {
    throw new Error("setState updater did not run");
  }
  return next;
}
