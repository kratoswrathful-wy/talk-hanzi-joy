# 請款單付款日期格式與付款後編輯（2026-06）

## 摘要

統一稿費請款單與客戶請款單的付款／收款日期為 `YYYY-MM-DD`；PM 以上可在已付款／已收款後編輯標題（客戶請款另可編輯請款單編號）、手動調整每筆紀錄日期、清除稿費付款紀錄。客戶請款移除 `actual_collection_date` 欄位，列表「匯款日期」改名為「收款日期」。

## 資料庫

- Migration：`supabase/migrations/20260614120000_invoice_payment_date_edit.sql`
- `invoices.payments[].timestamp`、`client_invoices.payments[].timestamp`：截斷為日期字串
- `transfer_date`：值截為日期（欄位型別仍為 timestamptz）
- `client_invoices.actual_collection_date`：單筆收款且與自動日期不符時以手動日期覆蓋後 DROP COLUMN

## 程式觸點

| 區域 | 檔案 |
|------|------|
| 共用日期元件 | `src/components/DateOnlyInputPicker.tsx` |
| 日期工具 | `src/lib/date-only.ts` |
| 稿費詳情 | `src/pages/InvoiceDetailPage.tsx` |
| 客戶詳情 | `src/pages/ClientInvoiceDetailPage.tsx` |
| 客戶列表 | `src/pages/ClientInvoicesPage.tsx` |
| 列表欄位定義 | `src/hooks/use-client-invoice-table-views.ts` |
| Store／型別 | `src/stores/client-invoice-store.ts`、`src/data/client-invoice-types.ts` |

## 行為規格

### 稿費請款單（`invoices`）

- 付款當下：`payments[].timestamp` 與 `transfer_date` 皆寫入使用者時區今日 `YYYY-MM-DD`
- 已付款後 PM 以上：可編輯標題、每筆付款日期（`DateOnlyInputPicker`）、清除全部付款（`AlertDialog` 確認，寫入 `edit_logs`）
- 修改最後一筆付款日期時，同步更新 `transfer_date`（列表「付款時間」欄）

### 客戶請款單（`client_invoices`）

- 收款當下：同稿費，寫入純日期
- 已收款後 PM 以上：可編輯標題、請款單編號、每筆收款日期
- 移除「實際收款時間」UI 與 DB 欄位；列表僅保留「收款日期」（原 `transferDate`）
- 修改最後一筆收款日期且狀態為「收款完畢」時，同步 `transfer_date`

## 驗收（白話）

1. 開一張稿費請款單 → 全額付款 → 付款紀錄只顯示日期（無時分）→ PM 可改標題與日期 → 「清除付款紀錄」後狀態回到待付款、可再付款
2. 開一張客戶請款單 → 收款完畢 → 無「實際收款時間」欄 → PM 可改標題、編號、每筆收款日期
3. 客戶請款列表：無「實際收款時間」欄；「收款日期」顯示最後收款日
4. 舊資料 migration 後：單筆收款且曾填手動日期的，自動日期應與手動日期一致

## 權限

- 「PM 以上」= `isAdmin`（`pm` 或 `executive`）
- 譯者（非管理員）已付款後標題與付款區塊維持唯讀
