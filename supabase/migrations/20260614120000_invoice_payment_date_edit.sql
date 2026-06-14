-- 請款單付款／收款日期統一為 YYYY-MM-DD；移除 client_invoices.actual_collection_date

-- 稿費：截斷 payments[].timestamp
UPDATE invoices
SET payments = (
  SELECT jsonb_agg(jsonb_set(p, '{timestamp}', to_jsonb(left(p->>'timestamp', 10))))
  FROM jsonb_array_elements(payments) p
)
WHERE payments IS NOT NULL AND jsonb_array_length(payments) > 0;

-- 稿費：截斷 transfer_date（保留 timestamptz 型別，值為當日 00:00 UTC）
UPDATE invoices
SET transfer_date = (left(transfer_date::text, 10))::date::timestamptz
WHERE transfer_date IS NOT NULL;

-- 客戶：截斷 payments[].timestamp
UPDATE client_invoices
SET payments = (
  SELECT jsonb_agg(jsonb_set(p, '{timestamp}', to_jsonb(left(p->>'timestamp', 10))))
  FROM jsonb_array_elements(payments) p
)
WHERE payments IS NOT NULL AND jsonb_array_length(payments) > 0;

-- 客戶：遷移 actual_collection_date → 唯一一筆 payment 的 timestamp（手動日期優先）
UPDATE client_invoices
SET payments = jsonb_set(payments, '{0,timestamp}', to_jsonb(actual_collection_date::text))
WHERE actual_collection_date IS NOT NULL
  AND jsonb_array_length(payments) = 1
  AND payments->0->>'timestamp' != actual_collection_date::text;

-- 客戶：截斷 transfer_date
UPDATE client_invoices
SET transfer_date = (left(transfer_date::text, 10))::date::timestamptz
WHERE transfer_date IS NOT NULL;

-- 客戶：刪除已廢棄欄位
ALTER TABLE client_invoices DROP COLUMN IF EXISTS actual_collection_date;
