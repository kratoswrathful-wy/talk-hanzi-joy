/**
 * multiColorSelect 關閉（含 Escape）時是否應再送一次最後 commit。
 * 避免 Radix focus 還原／卸下編輯 UI 的時序導致父層仍渲染舊的「—」children。
 */
export function shouldResyncMultiCommitOnClose(
  lastMultiCommit: string[] | null
): boolean {
  return lastMultiCommit !== null;
}
