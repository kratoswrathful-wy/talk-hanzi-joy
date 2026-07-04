/**
 * CAT AI Model Registry Phase 2：sync endpoint 錯誤代碼 → HTTP status 對照表。
 *
 * 型別化 re-export——**唯一權威實作**在 [`api/lib/model-sync-rules.js`](../../../api/lib/model-sync-rules.js)，
 * 理由見 [`filter-openai-models.ts`](./filter-openai-models.ts) 檔頭說明。
 *
 * 注意（依決策）：OpenAI key 無效不可回傳 401——401 只保留給 Supabase JWT 未登入／無效。
 */

import { SYNC_ERROR_STATUS, statusForSyncError as statusForSyncErrorImpl } from "../../../api/lib/model-sync-rules.js";

export type SyncErrorCode = keyof typeof SYNC_ERROR_STATUS;

export { SYNC_ERROR_STATUS };

export function statusForSyncError(code: SyncErrorCode): number {
  return statusForSyncErrorImpl(code) as number;
}
