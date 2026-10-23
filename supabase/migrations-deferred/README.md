# 延期待核：請款單費用唯一索引

本資料夾**不會**被 Supabase 遷移工具掃描。放在這裡的檔案不得在下一次發布時自動移回 `supabase/migrations/` 待套集合。

## `20261016033921_client_invoice_fees_unique_invoice_fee.sql`

- **原因：** 同一張請款單同一筆費用只能有一列關聯。正式庫目前仍有重複列，尚未核准清理，故本批發布不套用。
- **原始路徑：** `supabase/migrations/20261016033921_client_invoice_fees_unique_invoice_fee.sql`
- **來源提交：** `6927286878b5911ab8a0f416eb5313f8f7cfdfd1`（2026-10-16）
- **原文 SHA256：** `4028A6F39240BF0DE7A5A85BEC1DD44D1D50D4068501C988F6D0EF116ED0101A`
- **施工分支仍保留原路徑：** `fix/task-002-bing-cat-sync-20261018` 與歷史提交未刪檔、未改成空操作、未標記已套。

日後若要正式套用：須另案先盤點、備份並核准清理重複列，再以正式有效遷移處理。禁止用 repair 或直接 SQL 假造跳過結果。

## `20261021160000_task002_shared_review_complete.sql`

- **原因：** 會把正式 `public.complete_case_review_row` 的 Gate 2 維護包裝整段換成無檢查的 public 實作，且版本衝突用 `40001`。0241 已擋；0245 改走保留包裝的 `20261024103000`。
- **隔離已套：** 遠端版號 `20261022050938`（內容等於本檔）。不 repair 成未套、不重跑本檔。
- **正式：** 從未套用。未來發布只套 `20261024103000`（及另外三筆本包檔），**禁止**先套本檔再補包裝。
- **原始路徑：** `supabase/migrations/20261021160000_task002_shared_review_complete.sql`
- **後繼：** `supabase/migrations/20261024103000_task002_review_complete_keep_wrapper.sql`
