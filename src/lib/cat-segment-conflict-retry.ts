/**
 * CAT 句段衝突後是否可用「新 revision + 原譯文」自動重試。
 * 他人已寫入不同譯文時禁止自動重試，避免未經確認覆寫。
 */
export function decideCatSegmentConflictRetry(input: {
  attemptedText: string;
  dbTargetText: string;
}): "retry-same-text" | "abort-divergent" {
  if (input.attemptedText === input.dbTargetText) return "retry-same-text";
  return "abort-divergent";
}
