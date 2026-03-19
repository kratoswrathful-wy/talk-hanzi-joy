# 開發者交接文件：1UP 翻譯管理系統遷移指南

> **目標**：將此專案從 Lovable Cloud 遷移到獨立的 Supabase 專案 + 自行託管的前端。
> **日期**：2026-03-19
> **預估工時**：2-4 小時（不含資料匯入）

---

## 目錄

1. [專案概覽](#1-專案概覽)
2. [技術棧](#2-技術棧)
3. [前置準備](#3-前置準備)
4. [步驟一：建立新 Supabase 專案](#4-步驟一建立新-supabase-專案)
5. [步驟二：建立資料庫 Schema](#5-步驟二建立資料庫-schema)
6. [步驟三：部署 Edge Functions](#6-步驟三部署-edge-functions)
7. [步驟四：設定 Secrets](#7-步驟四設定-secrets)
8. [步驟五：建立 Storage Buckets](#8-步驟五建立-storage-buckets)
9. [步驟六：資料遷移](#9-步驟六資料遷移)
10. [步驟七：重建使用者帳號](#10-步驟七重建使用者帳號)
11. [步驟八：前端設定與部署](#11-步驟八前端設定與部署)
12. [步驟九：驗證清單](#12-步驟九驗證清單)
13. [架構說明](#13-架構說明)
14. [常見問題](#14-常見問題)

---

## 1. 專案概覽

這是一個翻譯公司內部使用的專案管理系統，主要功能包括：

| 模組 | 說明 |
|------|------|
| **案件管理** | 追蹤案件、分派譯者、管理交期與狀態 |
| **費用管理** | 費用單紀錄，支援 Notion 同步 |
| **稿費請款** | 管理對譯者的付款 |
| **客戶請款** | 管理向客戶的收款 |
| **內部問題表** | 內部 QA 與問題追蹤 |
| **團隊成員** | 使用者管理、譯者備註 |
| **權限管理** | 欄位級別的權限控制 |
| **設定中心** | 客戶、任務類型、計費單位等全域設定 |

### 角色系統

| 角色 | 權限 |
|------|------|
| `executive` | 全部權限，含權限管理 |
| `pm` | 案件/費用/請款/成員管理，無權限管理 |
| `member` | 僅限檢視案件與費用，敏感財務資料隱藏 |

### 環境隔離

系統區分 `test` 和 `production` 兩個環境：
- 業務資料透過 `env` 欄位隔離
- 設定透過 key 前綴隔離（如 `test:select_options` vs `production:select_options`）
- 環境由前端 hostname 自動判定（localhost / lovableproject.com → test，其他 → production）

---

## 2. 技術棧

### 前端
- **框架**：React 18 + TypeScript
- **建置工具**：Vite 5
- **UI**：Tailwind CSS 3 + shadcn/ui + Radix UI
- **狀態管理**：Zustand-style 自製 Store + React Query
- **路由**：React Router v6
- **動畫**：Framer Motion
- **富文本**：BlockNote

### 後端（Supabase）
- **資料庫**：PostgreSQL（15 個表格 + RLS 政策）
- **認證**：Email + Password
- **Edge Functions**：4 個 Deno 函數
- **Storage**：3 個公開 Bucket
- **Realtime**：10 個表格啟用即時更新

---

## 3. 前置準備

### 所需帳號與工具

- [ ] [Supabase 帳號](https://supabase.com)（免費方案即可開始）
- [ ] [Node.js 18+](https://nodejs.org) 或 [Bun](https://bun.sh)
- [ ] Supabase CLI：`npm install -g supabase`
- [ ] Git

### 所需資訊（向業主取得）

- [ ] Notion API Token（用於 Notion 整合功能）
- [ ] 現有使用者清單（Email + 角色 + 顯示名稱）
- [ ] 現有 Storage 中的檔案（頭像、案件附件、圖示）

---

## 4. 步驟一：建立新 Supabase 專案

1. 登入 [supabase.com](https://supabase.com)
2. 點選 **New Project**
3. 選擇組織、設定專案名稱、資料庫密碼、Region（建議選 `Northeast Asia (Tokyo)` 或 `Southeast Asia (Singapore)`）
4. 等待專案建立完成（約 2 分鐘）
5. 記下以下資訊：
   - **Project URL**：`https://xxxxxxxx.supabase.co`
   - **Anon Key**：在 Settings → API → Project API keys → `anon` `public`
   - **Service Role Key**：在 Settings → API → Project API keys → `service_role`（⚠️ 保密）
   - **Project ID**：URL 中的 `xxxxxxxx` 部分

---

## 5. 步驟二：建立資料庫 Schema

### 方法 A：使用 CLI（推薦）

```bash
# 1. 取得專案原始碼（從 GitHub 或 Lovable 下載）
cd your-project-directory

# 2. 登入 Supabase CLI
supabase login

# 3. 連結新專案
supabase link --project-ref <你的新專案ID>

# 4. 推送全部 migration
supabase db push
```

這會按順序執行 `supabase/migrations/` 目錄下的 48 個 SQL 檔案。

### 方法 B：手動在 SQL Editor 執行

1. 在 Supabase Dashboard → **SQL Editor**
2. 開啟專案中的 `FULL_SCHEMA.sql` 檔案
3. 將全部內容複製貼上到 SQL Editor
4. 點選 **Run** 執行

> ⚠️ 如果執行失敗，請確認錯誤訊息。最常見的原因是表格已存在，可加上 `IF NOT EXISTS`。

### 驗證

執行完成後，在 **Table Editor** 中應該看到以下 15 個表格：

```
profiles, user_roles, invitations, permission_settings,
app_settings, member_translator_settings, fees, invoices,
invoice_fees, client_invoices, client_invoice_fees, cases,
internal_notes, icon_library
```

---

## 6. 步驟三：部署 Edge Functions

### 函數清單

| 函數名稱 | 檔案路徑 | 用途 | JWT 驗證 |
|---------|---------|------|---------|
| `create-user` | `supabase/functions/create-user/index.ts` | 管理員建立使用者 | 是 |
| `delete-user` | `supabase/functions/delete-user/index.ts` | 管理員刪除使用者 | 是 |
| `dev-switch-user` | `supabase/functions/dev-switch-user/index.ts` | 開發用角色切換（僅限 4 個測試信箱） | 是 |
| `fetch-notion-page` | `supabase/functions/fetch-notion-page/index.ts` | Notion 頁面資料擷取 | **否** |

### 部署指令

```bash
# 一次部署全部
supabase functions deploy

# 或個別部署
supabase functions deploy create-user
supabase functions deploy delete-user
supabase functions deploy dev-switch-user
supabase functions deploy fetch-notion-page
```

### 特殊設定

`fetch-notion-page` 需要關閉 JWT 驗證。確認 `supabase/config.toml` 包含：

```toml
[functions.fetch-notion-page]
verify_jwt = false
```

### 函數說明

#### create-user
- 使用 `SUPABASE_SERVICE_ROLE_KEY` 透過 Admin API 建立使用者
- 自動檢查/建立邀請記錄
- 設定 `email_confirm: true` 跳過 email 驗證
- 支援傳入 `display_name`

#### delete-user
- 驗證呼叫者是否為 `executive` 角色
- 防止自我刪除
- 依序刪除：user_roles → profiles → auth user

#### dev-switch-user
- 僅允許 4 個測試信箱：`test-exec@test.local`, `test-pm@test.local`, `test-t1@test.local`, `test-t2@test.local`
- 生成 magic link token 供前端用 `verifyOtp` 切換身分
- **正式環境可考慮移除此函數**

#### fetch-notion-page
- 接收 Notion page ID，回傳頁面所有屬性
- 支援 title、select、multi_select、people、date、number、rich_text、checkbox、status、relation 等類型
- Relation 屬性會自動解析關聯頁面的標題與 URL

---

## 7. 步驟四：設定 Secrets

```bash
# Notion API Token（必要，用於 fetch-notion-page 函數）
supabase secrets set NOTION_API_TOKEN=ntn_xxxxxxxxxx
```

以下 Secrets 由 Supabase 自動提供，不需手動設定：
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

---

## 8. 步驟五：建立 Storage Buckets

如果使用 `FULL_SCHEMA.sql`（方法 B），Bucket 已在 SQL 中建立。

如果使用 CLI（方法 A），Bucket 也已在 migration 中建立。

### 手動驗證

在 Supabase Dashboard → **Storage** 確認有以下 3 個 Bucket：

| Bucket | 用途 | 公開 |
|--------|------|------|
| `avatars` | 使用者頭像 | ✅ |
| `case-files` | 案件附件 | ✅ |
| `case-icons` | 案件圖示 | ✅ |

### 搬移檔案

需從舊專案手動下載所有 Storage 檔案，再上傳到新專案：

1. 在舊 Supabase Dashboard → Storage → 各 Bucket
2. 下載所有檔案
3. 上傳到新專案對應 Bucket，保持相同的路徑結構

> 頭像路徑格式：`avatars/{user_id}/{filename}`
> 案件檔案路徑格式：`case-files/{case_id}/{filename}`
> 圖示路徑格式：`case-icons/{filename}`

---

## 9. 步驟六：資料遷移

### 需遷移的表格（含業務資料）

| 表格 | 說明 | 優先級 |
|------|------|--------|
| `app_settings` | 全域設定（客戶清單、計費單位等） | 🔴 高 |
| `permission_settings` | 權限設定 | 🔴 高 |
| `member_translator_settings` | 譯者備註 | 🔴 高 |
| `fees` | 費用單 | 🔴 高 |
| `invoices` | 稿費請款單 | 🔴 高 |
| `invoice_fees` | 請款單-費用單關聯 | 🔴 高 |
| `client_invoices` | 客戶請款單 | 🔴 高 |
| `client_invoice_fees` | 客戶請款-費用單關聯 | 🔴 高 |
| `cases` | 案件 | 🔴 高 |
| `internal_notes` | 內部問題表 | 🟡 中 |
| `icon_library` | 圖示庫 | 🟢 低 |

### 匯出方式

#### 方法 A：pg_dump（推薦，需有資料庫連線字串）

```bash
# 匯出特定表格資料（不含 schema）
pg_dump --data-only --table=public.app_settings \
  --table=public.permission_settings \
  --table=public.member_translator_settings \
  --table=public.fees \
  --table=public.invoices \
  --table=public.invoice_fees \
  --table=public.client_invoices \
  --table=public.client_invoice_fees \
  --table=public.cases \
  --table=public.internal_notes \
  --table=public.icon_library \
  "postgresql://postgres:[password]@db.[old-project-ref].supabase.co:5432/postgres" \
  > data_export.sql

# 匯入到新專案
psql "postgresql://postgres:[password]@db.[new-project-ref].supabase.co:5432/postgres" \
  < data_export.sql
```

#### 方法 B：CSV 匯出匯入

1. 在舊 Supabase Dashboard → Table Editor → 各表格 → Export as CSV
2. 在新 Supabase Dashboard → Table Editor → Import from CSV

#### 注意事項

- `profiles` 和 `user_roles` **不需匯出**，這些會在建立使用者時自動建立
- 匯入時注意 Foreign Key 順序：先匯入 `fees`，再匯入 `invoices`，最後匯入 `invoice_fees`
- 只匯出 `env = 'production'` 的資料（如果只要正式環境資料）

```sql
-- 如果只要匯出正式環境資料，可在 pg_dump 後過濾
-- 或直接用 SQL 匯出
COPY (SELECT * FROM fees WHERE env = 'production') TO STDOUT WITH CSV HEADER;
```

---

## 10. 步驟七：重建使用者帳號

⚠️ **使用者密碼無法從舊專案匯出**，需要重新建立帳號。

### 方法 A：使用 create-user Edge Function

部署完 Edge Function 後，可透過 API 呼叫建立使用者：

```bash
curl -X POST 'https://你的新專案.supabase.co/functions/v1/create-user' \
  -H 'Authorization: Bearer <anon_key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "temporary_password_123",
    "role": "pm",
    "display_name": "使用者名稱"
  }'
```

### 方法 B：使用 Supabase Dashboard

1. 在 Authentication → Users → Add User
2. 勾選 `Auto Confirm User`
3. 手動在 `user_roles` 表插入對應角色

### 建立順序

1. 先建立 executive 帳號（第一個帳號）
2. 用 executive 帳號建立其他帳號

### 第一個帳號的特殊處理

由於系統用 `handle_new_user` 觸發器自動分配角色：
- 沒有邀請記錄的新使用者會被分配 `member` 角色
- 要建立 executive，需先在 `invitations` 表插入記錄：

```sql
INSERT INTO invitations (email, role) VALUES ('admin@example.com', 'executive');
```

然後再建立該使用者。

---

## 11. 步驟八：前端設定與部署

### 更新環境變數

建立 `.env` 檔案（或修改現有的）：

```env
VITE_SUPABASE_URL="https://你的新專案ID.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="你的新 anon key"
VITE_SUPABASE_PROJECT_ID="你的新 project ID"
```

### 移除 Lovable 專屬依賴（可選）

```bash
npm uninstall lovable-tagger
```

並在 `vite.config.ts` 中移除 `componentTagger`：

```ts
// 移除這行
import { componentTagger } from "lovable-tagger";

// plugins 陣列中也移除
plugins: [react()],
```

### 建置與部署

```bash
# 安裝依賴
npm install

# 本地測試
npm run dev

# 建置生產版本
npm run build
# 產出在 dist/ 目錄
```

### 部署選項

#### Vercel（推薦）

```bash
npm install -g vercel
vercel
# 按提示設定，環境變數在 Vercel Dashboard 中設定
```

#### Netlify

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
# 環境變數在 Netlify Dashboard → Site Settings → Environment Variables 中設定
```

#### 自行託管

將 `dist/` 目錄部署到任何支援靜態檔案的 Web Server（Nginx、Apache、S3+CloudFront 等）。

**重要**：需設定 SPA Fallback，將所有路由導向 `index.html`：

```nginx
# Nginx 設定範例
location / {
  try_files $uri $uri/ /index.html;
}
```

### Auth 設定

在新 Supabase Dashboard → Authentication → URL Configuration：

```
Site URL: https://你的正式網域.com
Redirect URLs: https://你的正式網域.com/reset-password
```

---

## 12. 步驟九：驗證清單

完成遷移後，請逐一驗證：

### 認證系統
- [ ] 可以正常登入
- [ ] 「保持登入」功能正常
- [ ] 密碼重設 email 可收到
- [ ] 登出後確實回到登入頁

### 角色權限
- [ ] Executive 可看到所有模組
- [ ] PM 可管理案件/費用/請款，但無權限管理
- [ ] Member 僅能看到有限欄位

### 案件管理
- [ ] 案件列表載入正常
- [ ] 新增/編輯/刪除案件正常
- [ ] 檔案上傳/下載正常

### 費用管理
- [ ] 費用單列表載入正常
- [ ] Notion 同步功能正常（需 NOTION_API_TOKEN 正確設定）
- [ ] 新增/編輯/定稿功能正常

### 請款系統
- [ ] 稿費請款單 CRUD 正常
- [ ] 客戶請款單 CRUD 正常
- [ ] 費用單關聯正常

### 即時更新
- [ ] 多人同時操作時資料即時同步

### 設定
- [ ] 客戶管理設定可讀取/修改
- [ ] 任務類型設定正常
- [ ] 計費單位設定正常

---

## 13. 架構說明

### 資料庫表格關係

```
auth.users
  ├── profiles (1:1, id = user_id)
  ├── user_roles (1:N, user_id)
  └── invitations (透過 email 關聯)

fees
  ├── invoice_fees (N:M 關聯)
  │   └── invoices
  └── client_invoice_fees (N:M 關聯)
      └── client_invoices

cases (獨立表格)
internal_notes (獨立表格)
icon_library (獨立表格)

app_settings (key-value 設定)
permission_settings (權限矩陣)
member_translator_settings (譯者個別設定)
```

### 前端路由結構

| 路由 | 頁面 | 權限 |
|------|------|------|
| `/` | 重導至 `/fees` | 需登入 |
| `/cases` | 案件列表 | 需登入 |
| `/cases/:id` | 案件詳情 | 需登入 |
| `/fees` | 費用單列表 | 需登入 |
| `/fees/new` | 新增費用單 | PM+ |
| `/fees/:id` | 費用單詳情 | 需登入 |
| `/invoices` | 稿費請款列表 | 需登入 |
| `/invoices/:id` | 請款詳情 | 需登入 |
| `/client-invoices` | 客戶請款列表 | PM+ |
| `/client-invoices/:id` | 客戶請款詳情 | PM+ |
| `/internal-notes` | 內部問題表 | 需登入 |
| `/tools` | 工具管理 | PM+ |
| `/settings` | 系統設定 | PM+ |
| `/members` | 團隊成員 | PM+ |
| `/permissions` | 權限管理 | Executive |
| `/profile` | 個人資料 | 需登入 |
| `/reset-password` | 重設密碼 | 公開 |

### Store 架構

系統使用自製的 Store 模式（類似 Zustand），位於 `src/stores/`：

| Store | 負責 |
|-------|------|
| `case-store` | 案件 CRUD + 即時同步 |
| `fee-store` | 費用單 CRUD + 樂觀更新 |
| `invoice-store` | 稿費請款 CRUD |
| `client-invoice-store` | 客戶請款 CRUD |
| `internal-notes-store` | 內部問題 CRUD |
| `select-options-store` | 下拉選項（客戶、任務類型等） |
| `default-pricing-store` | 預設計費設定 |
| `label-style-store` | 標籤樣式 |
| `tool-template-store` | 工具範本 |
| `page-template-store` | 頁面範本 |
| `common-links-store` | 共用連結 |
| `currency-store` | 幣別設定 |
| `icon-library-store` | 圖示庫 |

所有 Store 在 `settings-init.ts` 中統一初始化，並監聽 Realtime 變更自動重載。

---

## 14. 常見問題

### Q: 執行 SQL 時出現 "relation already exists"
A: 表格已存在。如果是全新專案，不應該出現。可以先 `DROP TABLE` 再重新執行。

### Q: Edge Function 部署失敗
A: 
1. 確認 `supabase` CLI 版本為最新：`supabase update`
2. 如有 `deno.lock` 檔案，嘗試刪除後重試
3. 確認 `supabase/config.toml` 格式正確

### Q: 使用者登入後看不到資料
A: 
1. 檢查 RLS 政策是否正確套用
2. 確認 `user_roles` 表中有該使用者的角色記錄
3. 確認資料的 `env` 欄位值正確（`production` 或 `test`）

### Q: Notion 同步失敗
A: 
1. 確認 `NOTION_API_TOKEN` Secret 已正確設定
2. 確認 Notion Integration 有存取目標 Page 的權限
3. 確認傳入的是 Page ID 而非 Database ID

### Q: 環境隔離如何運作？
A: 前端透過 `src/lib/environment.ts` 判斷 hostname：
- `localhost` / `lovableproject.com` / `*-preview--*` → `test`
- 其他（你的正式網域）→ `production`

部署到正式網域後，系統會自動使用 `production` 環境的資料。如需修改判斷邏輯，請編輯 `src/lib/environment.ts`。

### Q: 如何新增管理員？
A: 
1. 先在 `invitations` 表插入 `{ email: "xxx", role: "executive" }`
2. 再透過 `create-user` 函數建立帳號
3. 或直接在 `user_roles` 表插入 `{ user_id: "xxx", role: "executive" }`

---

## 附錄：檔案清單

### 需要的檔案
- `FULL_SCHEMA.sql` — 完整資料庫 Schema（一鍵執行）
- `MIGRATION_GUIDE.md` — 遷移指南（含分步驟 SQL）
- `supabase/functions/` — 4 個 Edge Function 原始碼
- `supabase/config.toml` — Edge Function 設定
- `src/` — 前端原始碼
- `package.json` — 依賴清單

### 可忽略的檔案
- `supabase/migrations/` — 如果使用 `FULL_SCHEMA.sql` 則不需要
- `.env` — 需要重新建立，不要使用舊的值
