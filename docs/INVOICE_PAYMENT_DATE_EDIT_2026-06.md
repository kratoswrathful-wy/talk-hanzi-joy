# 請款單付款日期格式與付款後編輯（2026-06）

**狀態**：已實作並驗收（2026-06-14）  
**Git**：`main` · `c6053b7` — `feat(invoices): 付款日期改純日期、PM 付款後可編輯與清除`  
**Migration**：`supabase/migrations/20260614120000_invoice_payment_date_edit.sql`（已 `supabase db push`）

---

## 1. 背景與動機

先前稿費請款單與客戶請款單的付款／收款時間有兩套紀錄方式：

| 類型 | 自動紀錄 | 手動紀錄 |
|------|----------|----------|
| 稿費請款 | `payments[].timestamp`（ISO 含時分秒）＋全額付清時的 `transfer_date` | 無 |
| 客戶請款 | 同上 | 獨立欄位 `actual_collection_date`（「實際收款時間」） |

實務上 PM 需要的是**登記日期**（年月日），不是精確到秒的時間戳；且付款／收款完成後，標題或日期填錯時無法修正，只能刪除整張請款單（已付款還需 Executive 密碼）。

本次變更目標：

1. 統一日期儲存為 `YYYY-MM-DD`（純日期字串）。
2. PM 以上在已付款／已收款後，可編輯標題（客戶請款另可編輯請款單編號）與每筆付款／收款日期。
3. 稿費請款新增「清除付款紀錄」，可還原為待付款並重新登記。
4. 客戶請款移除 `actual_collection_date`，只保留 `payments[].timestamp` 作為可修改的收款日期來源。

---

## 2. 產品決策紀錄

| 議題 | 決策 |
|------|------|
| 日期儲存格式 | **直接改為 `YYYY-MM-DD`**，非僅 UI 隱藏時分 |
| 舊資料時分秒 | **Migration 一次性截斷**（不可逆） |
| 清除付款確認 | **原生 `AlertDialog`**，不用 `window.confirm` |
| 列表完成日期 | 顯示**最後一筆**付款／收款的日期（`transfer_date`） |
| 可編輯角色 | **PM 以上**（`isAdmin` = `pm` 或 `executive`）；譯者已付款後維持唯讀 |
| 日期選擇器 UI | 類似案件交期的 **`DateOnlyInputPicker`**（可手打 MMDD + 日曆） |
| 清除付款紀錄 | **寫入 `edit_logs`**（欄位鍵「付款紀錄」） |
| 客戶 `actual_collection_date` 遷移 | 僅 **payments 一筆** 且與手動日期不符時，以手動日期覆蓋；多筆則保留原多筆自動日期 |
| 客戶 DB 欄位 | **`DROP COLUMN actual_collection_date`**（非僅隱藏 UI） |
| 列表欄位名稱 | `transferDate` 標籤由「匯款日期」改為 **「收款日期」** |

---

## 3. 變更前後對照

### 3.1 資料模型

```
變更前
├── invoices.payments[].timestamp     → "2026-03-15T09:23:11.000Z"
├── invoices.transfer_date            → timestamptz（全額付清當下）
├── client_invoices.payments[].timestamp → 同上
├── client_invoices.transfer_date     → 同上
└── client_invoices.actual_collection_date → date（手動填，與 payments 分離）

變更後
├── invoices.payments[].timestamp     → "2026-03-15"
├── invoices.transfer_date            → timestamptz 型別，值為最後完成日（列表用）
├── client_invoices.payments[].timestamp → "2026-03-15"（可手動改）
├── client_invoices.transfer_date     → 同上
└── actual_collection_date            → 已刪除
```

付款／收款明細仍存於主表 `payments` JSONB 陣列，**沒有**新增獨立 payment 資料表。

每筆 `PaymentRecord`／`ClientPaymentRecord` 結構不變，僅 `timestamp` 語意由 datetime 改為 date-only 字串。

### 3.2 介面行為

| 畫面 | 變更前 | 變更後 |
|------|--------|--------|
| 稿費詳情 · 標題 | 已付款 → 靜態文字 | PM 以上 → 仍可編輯 `Input` |
| 稿費詳情 · 付款紀錄 | 顯示「2026/03/15 09:23 (UTC+8)」 | 每筆顯示 `DateOnlyInputPicker`（僅日期） |
| 稿費詳情 · 操作 | 已付款無「付款」按鈕 | PM 以上多「清除付款紀錄」→ 回到待付款 |
| 客戶詳情 · 標題／編號 | 收款完畢 → 靜態 | PM 以上 → 仍可編輯 |
| 客戶詳情 · 日期區 | 「預計收款時間」＋「實際收款時間」兩欄 | 僅「預計收款時間」；收款日期改在付款紀錄區 |
| 客戶詳情 · 收款紀錄 | 顯示含時分時間戳 | 每筆 `DateOnlyInputPicker` |
| 客戶列表 | 「實際收款時間」＋「匯款日期」 | 移除前者；後者改名「收款日期」 |

### 3.3 未變更的規則

- **稿費（`fees`）欄位鎖定**：費用一旦加入請款單即鎖定部分欄位，與請款單是否已付款無關；清除付款紀錄**不會**解鎖費用。
- **刪除已付款請款單**：仍須 Executive + 密碼二次驗證。
- **備註留言**：已付款／已收款後仍可新增（原行為保留）。
- **`expected_collection_date`**：客戶請款「預計收款時間」仍為獨立手動欄位，與收款紀錄分開。

---

## 4. 資料庫 Migration

檔案：`supabase/migrations/20260614120000_invoice_payment_date_edit.sql`

執行順序與理由：

1. **截斷 `invoices.payments[].timestamp`** — `left(..., 10)` 取 `YYYY-MM-DD`
2. **截斷 `invoices.transfer_date`** — cast 為 `date::timestamptz`（欄位型別保留）
3. **截斷 `client_invoices.payments[].timestamp`**
4. **遷移 `actual_collection_date`** — 條件：`actual_collection_date IS NOT NULL` 且 `jsonb_array_length(payments) = 1` 且兩者日期不同 → 以手動日期覆蓋 `payments[0].timestamp`
5. **截斷 `client_invoices.transfer_date`**
6. **`DROP COLUMN actual_collection_date`**

> 多筆收款紀錄的請款單：不套用步驟 4，以原有多筆 `payments[].timestamp`（截斷後）為準。

---

## 5. 程式觸點

| 區域 | 檔案 | 說明 |
|------|------|------|
| 共用日期元件 | `src/components/DateOnlyInputPicker.tsx` | 年份輸入 + MMDD rolling + 日曆 popover；輸出 `YYYY-MM-DD` |
| 日期工具 | `src/lib/date-only.ts` | `todayDateString`、`parseDateOnly`、`dateOnlyToString`、`formatDateOnlyDisplay` |
| 稿費詳情 | `src/pages/InvoiceDetailPage.tsx` | 付款、清除、日期編輯、標題解鎖 |
| 客戶詳情 | `src/pages/ClientInvoiceDetailPage.tsx` | 收款、日期編輯、標題／編號解鎖；移除本地 `DateOnlyPicker` |
| 客戶列表欄 | `src/pages/ClientInvoicesPage.tsx` | 移除「實際收款時間」欄定義 |
| 列表篩選欄位 | `src/hooks/use-client-invoice-table-views.ts` | `clientInvoiceFieldMetas` 同步調整 |
| Store | `src/stores/client-invoice-store.ts` | 移除 `actualCollectionDate` 讀寫 |
| 型別 | `src/data/client-invoice-types.ts`、`src/integrations/supabase/types.ts` | 移除 `actual_collection_date` |

### 5.1 新登記付款／收款

```ts
const today = todayDateString(); // 使用者時區今日 YYYY-MM-DD
// payments[].timestamp = today
// 全額付清／收款完畢時 transferDate = today
```

`todayDateString` 實作：`new Date().toLocaleDateString("sv-SE", { timeZone: getUserTimezone() })`。

### 5.2 手動改日期（`handlePaymentDateChange`）

稿費與客戶請款邏輯相同：

1. 更新 `payments[idx].timestamp`
2. 若為**最後一筆**且狀態為已付清（`paid`／`collected`）→ 同步 `transferDate`
3. `trackChange` 寫入變更紀錄（鍵：`付款時間` 或 `收款時間`）

### 5.3 清除付款紀錄（僅稿費）

條件：`isAdmin && isPaid && payments.length > 0`

- UI：`AlertDialog` 標題「確定清除付款紀錄？」
- 執行：`status → pending`、`payments → []`、`transferDate → ""`（DB 存 null）
- `trackChange("付款紀錄", "已付款（共 N 筆）", "已清除")`

### 5.4 變更紀錄（`edit_logs`）新增欄位鍵

| 頁面 | 欄位鍵 | 觸發時機 |
|------|--------|----------|
| 稿費 | `付款時間` | 手動改某筆付款日期 |
| 稿費 | `付款紀錄` | 清除全部付款 |
| 客戶 | `收款時間` | 手動改某筆收款日期 |

仍須 `editLogStartedAt` 已設定才會寫入（與原請款單變更紀錄規則相同）。

---

## 6. 權限

| 角色 | 稿費已付款後 | 客戶已收款後 |
|------|--------------|--------------|
| `member`（譯者等非管理員） | 標題唯讀；付款日期選擇器 `disabled` | 不適用客戶請款詳情管理區 |
| `pm`／`executive`（`isAdmin`） | 可改標題、付款日期、清除付款 | 可改標題、請款單編號、收款日期 |

程式判斷：

- 稿費標題：`isPaid && !isAdmin` → 靜態 `<h1>`，否則 `Input`
- 客戶標題／編號：`isCollected && !isAdmin` → 靜態，否則可編輯
- 日期選擇器：`disabled={!isAdmin}`

---

## 7. 驗收紀錄（2026-06-14）

產品擁有者確認驗收成功。驗收步驟：

### 稿費請款單

- [x] 全額／部份付款後，付款紀錄只顯示日期（無時分）
- [x] PM 帳號：已付款後仍可編輯標題
- [x] PM 帳號：每筆付款日期可透過日期選擇器修改（可手打）
- [x] 修改最後一筆付款日期後，列表「付款時間」欄同步
- [x] 「清除付款紀錄」出現確認對話框（非瀏覽器 alert）
- [x] 清除後狀態為「待付款」、可再次點「付款」
- [x] 清除操作出現在變更紀錄

### 客戶請款單

- [x] 收款完畢後，詳情頁無「實際收款時間」欄
- [x] PM 帳號：已收款後可編輯標題與請款單編號
- [x] 每筆收款日期可手動修改
- [x] 列表無「實際收款時間」欄；「收款日期」標籤正確
- [x] 舊資料：單筆收款且曾填手動日期的，遷移後日期與手動一致

---

## 8. 維運注意

1. **已存篩選視圖**：若使用者曾用「實際收款時間」做客戶請款列表篩選，升級後該條件會靜默失效（不報錯），需手動更新視圖。
2. **`transfer_date` 型別**：DB 仍為 `timestamptz`，應用層讀寫以日期字串為主；列表顯示經 `formatDateTz`，純日期值不會帶時分。
3. **清除付款不可自動還原**：僅能透過 `edit_logs` 查閱「誰在何時清除」，無一鍵復原。
4. **CAT 無關**：本次未修改 `cat-tool/`；`npm run build` 的 `prebuild` 會照常 sync CAT，與本功能無關。

---

## 9. 相關路徑索引

- 稿費請款列表：`/invoices` · `src/pages/InvoicesPage.tsx`
- 稿費請款詳情：`/invoices/:id` · `src/pages/InvoiceDetailPage.tsx`
- 客戶請款列表：`/client-invoices` · `src/pages/ClientInvoicesPage.tsx`
- 客戶請款詳情：`/client-invoices/:id` · `src/pages/ClientInvoiceDetailPage.tsx`
- 費用總表路徑對照：[`docs/CODEMAP.md`](./CODEMAP.md) §費用管理
