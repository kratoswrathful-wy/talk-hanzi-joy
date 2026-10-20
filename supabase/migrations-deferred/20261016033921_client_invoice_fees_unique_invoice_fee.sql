-- 同一張客戶請款單不得對同一費用重複關聯。
-- 若庫上已有重複列，建立唯一索引會失敗；正式庫須先另核清理方案後再套。
-- 本檔冪等：索引已存在則略過。

CREATE UNIQUE INDEX IF NOT EXISTS client_invoice_fees_client_invoice_id_fee_id_uidx
  ON public.client_invoice_fees (client_invoice_id, fee_id);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_fees_invoice_id_fee_id_uidx
  ON public.invoice_fees (invoice_id, fee_id);

COMMENT ON INDEX public.client_invoice_fees_client_invoice_id_fee_id_uidx IS
  '同一請款單同一費用只能有一筆關聯；防漏讀後重試重複寫入。';

COMMENT ON INDEX public.invoice_fees_invoice_id_fee_id_uidx IS
  '同一稿費請款單同一費用只能有一筆關聯；防漏讀後重試重複寫入。';
