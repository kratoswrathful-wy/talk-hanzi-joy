# 業務資料搬移指南（舊 Supabase → 新專案）

本文件依 **本 repo 的 `supabase/migrations/`** 整理出 **15 個 `public` 表格**、外鍵依賴與建議匯入順序，供從舊 Lovable / 舊 Supabase 專案搬資料到新專案（例如 `dnsnvlzwkhoudgjvkigo`）時使用。

> 更廣義的「專案遷移」（CLI、Edge Functions、Storage、使用者重建）請一併參考專案根目錄的  
> [`DEVELOPER_HANDOFF.md`](../DEVELOPER_HANDOFF.md) 與 [`MIGRATION_GUIDE.md`](../MIGRATION_GUIDE.md)。

---

## 1. 表格清單（15 張）

| 表格 | 說明 |
|------|------|
| `profiles` | 使用者檔案（`id` = `auth.users.id`） |
| `user_roles` | 使用者角色 |
| `invitations` | 邀請（可選 `invited_by` → `auth.users`） |
| `permission_settings` | 權限矩陣（可選 `updated_by` → `auth.users`） |
| `app_settings` | key-value 設定（`updated_by` → `auth.users`） |
| `member_translator_settings` | 譯者備註等 |
| `fees` | 費用單（`created_by` / `finalized_by` → `auth.users`，可為 NULL） |
| `invoices` | 稿費請款單 |
| `invoice_fees` | 請款單 ↔ 費用單（**同時依賴** `invoices` 與 `fees`） |
| `client_invoices` | 客戶請款單 |
| `client_invoice_fees` | 客戶請款 ↔ 費用單（**同時依賴** `client_invoices` 與 `fees`） |
| `cases` | 案件 |
| `internal_notes` | 內部問題表 |
| `icon_library` | 圖示庫 |

> `fees`、`invoices`、`invoice_fees`、`client_invoices`、`client_invoice_fees`、`cases`、`internal_notes`、`icon_library`、`permission_settings` 等表含 **`env`**（`test` / `production`）或設定用 **環境前綴 key**；匯出時請勿隨意改值，以免正式／測試資料錯置。

---

## 2. 外鍵依賴（摘要）

```
auth.users
  ├── profiles.id
  ├── user_roles.user_id
  ├── invitations.invited_by
  ├── fees.created_by, fees.finalized_by
  ├── permission_settings.updated_by
  └── app_settings.updated_by

fees.id
  ├── invoice_fees.fee_id
  └── client_invoice_fees.fee_id

invoices.id
  └── invoice_fees.invoice_id

client_invoices.id
  └── client_invoice_fees.client_invoice_id
```

`cases`、`internal_notes`、`member_translator_settings` 在 schema 上 **不依賴** 其他業務表的主鍵（僅可能含 `created_by` 等指向 `auth.users` 的 UUID，且多數可為空或由應用層處理）。

---

## 3. 建議匯入順序（必須遵守外鍵者）

### 階段 A：認證與使用者相關（密碼無法從舊專案匯出）

1. **`auth.users`**  
   在**新專案**用 Dashboard、`create-user` Edge Function 或 Admin API **重建帳號**（見 `DEVELOPER_HANDOFF.md` 步驟七）。
2. **`profiles`**  
   在舊專案匯出後匯入新專案時，**`id` 必須與新專案 `auth.users` 的 UUID 一致**。若無法一一對應，需先完成帳號對照表再匯入或手動修正。
3. **`user_roles`**  
   依賴 `auth.users`，在 `profiles` 之後或與之一致即可。
4. **`invitations`**  
   可與邀請流程一併匯入；`invited_by` 若指向不存在的使用者，請改為 `NULL` 或先建立對應使用者。

### 階段 B：設定類（無表間外鍵，但可能引用 `auth.users`）

5. **`member_translator_settings`**
6. **`permission_settings`**
7. **`app_settings`**  
   若 `updated_by` 在新專案無對應使用者，可先改為 `NULL` 再匯入（避免 FK 錯誤，若你們 schema 允許）。

### 階段 C：案件與費用（可與階段 B 並行，但 **請款關聯表** 須最後）

8. **`cases`**
9. **`fees`**  
   建議在 `invoices` / `invoice_fees` **之前**，因為關聯表依賴 `fees.id`。

### 階段 D：稿費請款鏈（順序固定）

10. **`invoices`**
11. **`invoice_fees`**（需已存在對應的 `invoices` 與 `fees` 列）

### 階段 E：客戶請款鏈（順序固定）

12. **`client_invoices`**
13. **`client_invoice_fees`**（需已存在對應的 `client_invoices` 與 `fees` 列）

### 階段 F：其餘業務表

14. **`internal_notes`**
15. **`icon_library`**（若 `url` / `storage_path` 指向 Storage，需搭配 Storage 搬運，見 `DEVELOPER_HANDOFF.md` 步驟五／八）

**一句話記憶：**  
`fees` → `invoices` → `invoice_fees`；`fees` + `client_invoices` → `client_invoice_fees`。

---

## 4. 匯出／匯入方式

### 方法 A：Dashboard CSV（適合資料量中等）

1. 舊專案：**Table Editor** → 選表 → Export CSV（保留欄位名與 `id`）。
2. 新專案：依 **第 3 節順序** Import；匯入時勾選對應欄位，**保留主鍵 UUID**。
3. 若 RLS 阻擋大量匯入：暫時以 **service_role** 在 **SQL Editor** 執行 `INSERT`／`COPY`，或請 DBA 短暫調整政策（僅限維護窗口）。

### 方法 B：`pg_dump` / `psql`（適合大量資料與可重現腳本）

參考 `DEVELOPER_HANDOFF.md` 第 9 節範例；表格列表請使用本文件 **第 1 節**，順序依 **第 3 節**。

```bash
# 僅範例：實際連線字串請從 Supabase Dashboard → Project Settings → Database 取得
pg_dump --data-only \
  --table=public.profiles \
  --table=public.user_roles \
  # ... 其餘表格依第 3 節順序分批或單檔 \
  "postgresql://postgres:[PASSWORD]@db.[OLD_REF].supabase.co:5432/postgres" \
  > export_data.sql

psql "postgresql://postgres:[PASSWORD]@db.[NEW_REF].supabase.co:5432/postgres" \
  < export_data.sql
```

**注意：** 僅匯入 `auth.users` 的資料 dump **通常不可行**（密碼雜湊與安全政策）；使用者請在新專案重建後再匯入 `profiles` / `user_roles`。

---

## 5. 篩選 `env`（只要正式或只要測試）

若舊庫同時有 `test` / `production`，匯出時可加條件，例如：

```sql
-- 範例：僅正式環境費用單
COPY (SELECT * FROM public.fees WHERE env = 'production') TO STDOUT WITH CSV HEADER;
```

`app_settings` 的 key 可能為 `test:select_options` / `production:select_options` 等形式，請依前端 [`src/lib/environment.ts`](../src/lib/environment.ts) 的邏輯決定要搬哪些 key。

---

## 6. 匯入後驗證（建議）

- 各表 **列數** 與舊專案一致（或與篩選條件一致）。
- 隨機抽樣 **`invoice_fees`**、`**client_invoice_fees**` 的 `fee_id`、`invoice_id`、`client_invoice_id` 在新庫皆可 `JOIN` 到母表。
- **`fees.created_by` / `finalized_by`**：若為 NULL 或指向不存在使用者，屬預期可接受（舊資料常見）。
- 登入新前端，確認案件／費用／請款列表與明細無 404 或空白關聯。

---

## 7. Storage 檔案批次下載（舊專案 → 本機）

Supabase 專案裡通常只有 **一個 PostgreSQL 資料庫**；**「15」指的是資料表數量**，不是 15 個資料庫。  
若你從 Lovable 匯出 **14 份表資料**，請對照本文件 **第 1 節** 的 15 張表，看是否少匯了一張（例如空表、或當時未匯出的表）。

### 用本 repo 的腳本（建議，Windows 可用）

1. 到 **舊專案**（Lovable / 舊 Supabase）Dashboard → **Settings → API**  
   - 複製 **Project URL**  
   - 複製 **service_role** key（僅本機使用，勿提交到 Git）

2. 在專案根目錄開 **PowerShell**：

```powershell
cd "C:\Homemade Apps\1UP TMS"

$env:SOURCE_SUPABASE_URL="https://<舊專案-ref>.supabase.co"
$env:SOURCE_SUPABASE_SERVICE_ROLE_KEY="<舊專案的 service_role>"

npm run download-storage
```

3. 檔案會下載到 **`storage-backup/avatars/`**、**`storage-backup/case-files/`**、**`storage-backup/case-icons/`**（路徑結構與 bucket 內一致）。

4. 再到 **新專案** Dashboard → **Storage**，依相同 bucket 名稱上傳（維持路徑一致，連結才不會斷）。

**可選環境變數：**

| 變數 | 說明 |
|------|------|
| `OUT_DIR` | 輸出根目錄，預設為專案下的 `storage-backup` |
| `BUCKETS` | 預設 `avatars,case-files,case-icons`，可改為只下載其中幾個 |

### 若你拿到的是 `download-storage.sh`（Bash）

在 **Git Bash** 或 **WSL** 裡：

```bash
chmod +x download-storage.sh
./download-storage.sh
```

本 repo 目前改以 **`npm run download-storage`**（Node）為主，不必另外裝 Bash。

---

## 7.1 附錄：用程式建立使用者並**指定 UUID**（搬遷用）

Dashboard 無法自訂 User ID，但 **Auth Admin API** 可在建立使用者時帶入 **`id`**（必須為合法 UUID）。本專案的 **`create-user`** Edge Function 已支援可選欄位 **`id`**：

部署後以 **已登入使用者** 的 JWT（`Authorization: Bearer <access_token>`）呼叫，JSON 範例：

```json
{
  "email": "user@example.com",
  "password": "temporary-password-123",
  "role": "member",
  "display_name": "顯示名稱",
  "id": "af66ab20-a702-479f-a966-ad7bc434f114"
}
```

- **不帶 `id`**：行為與以往相同，由 Supabase 自動指派 UUID。  
- **帶 `id`**：盡量與舊專案 `profiles.id` / `auth.users` 一致，再匯入 `profiles` / `user_roles`。

`curl` 範例（將 URL、anon key、access token 換成你的專案）：

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/create-user" \
  -H "Authorization: Bearer <使用者的 access_token>" \
  -H "apikey: <anon public key>" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"password\":\"TempPass123\",\"role\":\"member\",\"display_name\":\"Name\",\"id\":\"af66ab20-a702-479f-a966-ad7bc434f114\"}"
```

> 若 `id` 已存在或已被使用，API 會回錯誤，請勿重複建立。

---

## 8. 與其他文件的對照

| 主題 | 文件 |
|------|------|
| CLI 連結專案、`db push`、Edge Functions | [`DEVELOPER_HANDOFF.md`](../DEVELOPER_HANDOFF.md)、[`MIGRATION_GUIDE.md`](../MIGRATION_GUIDE.md) |
| Storage 三個 bucket 檔案搬運 | [`DEVELOPER_HANDOFF.md`](../DEVELOPER_HANDOFF.md) 步驟五／八 |
| 使用者重建、`create-user`、`invitations` 第一個 executive | [`DEVELOPER_HANDOFF.md`](../DEVELOPER_HANDOFF.md) 步驟七 |

---

## 9. Schema 來源

本文件之表格與外鍵順序係根據 **`supabase/migrations/`** 內之 `CREATE TABLE` / `ALTER TABLE ... REFERENCES` 彙整；若你們之後新增 migration，請同步更新本節與第 1～3 節。
