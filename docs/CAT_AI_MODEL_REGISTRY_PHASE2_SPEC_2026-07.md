狀態：已落地待 merge（PR 待開）；production 第一次 sync 需另行核准

# CAT AI Model Registry Phase 2 — Sync Endpoint 規格（2026-07）

本文件記錄 Phase 2 **Vercel serverless 模型同步 endpoint** 的實作規格、授權、寫入策略與驗收條件。背景與 Phase 1 見 [`CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md`](CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md)、[`CAT_AI_MODEL_REGISTRY_PHASE1_PROD_APPLY_2026-07-04.md`](CAT_AI_MODEL_REGISTRY_PHASE1_PROD_APPLY_2026-07-04.md)。

## 1. 範圍

### 本次包含

- `POST /api/cat-ai-model-sync`（Vercel serverless）
- executive-only 授權（JWT → `user_roles`）
- OpenAI `GET /v1/models` 同步至 registry 表（非破壞性寫入）
- 純函式 + vitest + mock API 行為測試
- 本機 dev proxy（`vite.config.ts`）
- `.env.example` server-only env 註解

### 本次不包含

- CAT UI、模型選單、BYOK 收斂（Phase 4）
- 管理 UI、sync 按鈕（Phase 3）
- migration、RLS 變更、`supabase db push`
- **production 第一次 sync**（需部署後另案核准）
- Phase 5 job log

## 2. Endpoint

| 項目 | 值 |
|---|---|
| 路徑 | `/api/cat-ai-model-sync` |
| Method | `POST` only |
| 授權 | `Authorization: Bearer <Supabase JWT>` |
| Body | `{ "providerKey": "openai" }`（可省略，預設 `openai`） |

### 成功回應（200）

```json
{
  "ok": true,
  "runId": "uuid",
  "providerKey": "openai",
  "discoveredCount": 0,
  "filteredCount": 0,
  "upsertedProviderModels": 0,
  "newOptionsCreated": 0,
  "markedUnavailable": 0,
  "startedAt": "ISO8601",
  "finishedAt": "ISO8601"
}
```

### 錯誤回應

格式：`{ "error": "<code>", "message": "..." }`（`message` 可選）

| HTTP | error | 情境 |
|---|---|---|
| 401 | `unauthorized` | 缺 Bearer、JWT 無效／過期 |
| 403 | `forbidden` | 已登入但非 executive（含 member、pm） |
| 405 | `method_not_allowed` | 非 POST |
| 400 | `invalid_json` | body 解析失敗 |
| 400 | `unsupported_provider_key` | 非 `openai` |
| 503 | `server_missing_openai_key` | 缺 `OPENAI_API_KEY` |
| 503 | `server_missing_supabase_config` | 缺 Supabase server env |
| 502 | `openai_fetch_failed` | OpenAI 網路或 5xx |
| 502 | `openai_invalid_response` | 回應格式非預期 |
| 503 | `openai_invalid_key` | OpenAI key 無效（**不用 401**，401 保留給 JWT） |
| 504 | `openai_timeout` | 逾時 25s |
| 500 | `db_write_failed` | Supabase 寫入失敗 |

## 3. 授權

流程（`api/lib/require-executive.js`）：

1. 讀 `Authorization: Bearer <jwt>`
2. `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
3. `auth.getUser(jwt)` 驗證 JWT
4. 查 `user_roles`，`.some(role === 'executive')`
5. 非 executive → 403

限制：

- **不信任** `_tmsRole`、body 內 `role`／`userId`
- **不用** `is_admin()`（pm 不可 sync）
- service role key **僅** serverless 端；不回傳、不寫 log

## 4. 環境變數

| 變數 | 用途 |
|---|---|
| `OPENAI_API_KEY` | 呼叫 OpenAI `/v1/models` |
| `SUPABASE_URL` | Supabase client（可 fallback `VITE_SUPABASE_URL`） |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT 驗證 + bypass RLS 寫入 |

**禁止**：`VITE_*` 前綴的 service role；`SUPABASE_ANON_KEY` 新名稱。

## 5. OpenAI 同步策略

- `GET https://api.openai.com/v1/models`，timeout 25s
- 驗證 `response.data` 為 array
- 不保存完整 raw error 到 client；`ai_model_sync_runs.raw` 僅存精簡摘要

### 篩選（寬鬆記錄、嚴格開放）

**`ai_provider_models` 可記錄**（通過全部）：

- `gpt-*`、`o[0-9]*`（o1/o3/o4）、`chatgpt-*`
- 排除：`embedding`、`whisper`、`tts`、`dall-e`、`image`、`audio`、`realtime`、`moderation`、`transcribe`、`davinci`、`ft:`

**preview / experimental / exp**：

- 可記錄於 `ai_provider_models`
- **不**自動建 `cat_ai_model_options`

**`cat_ai_model_options`**：

- 僅對穩定候選 **insert** 新列
- 新列：`enabled=false`、`is_default=false`、`sort_order=999`
- **已存在列 skip**（含 `gpt-4.1-mini` seed）
- sync **不得**改 `enabled`、`is_default`、既有文案

**OpenAI 本次未回傳、DB 既有 model**：

- `is_currently_available=false`
- 不 delete；不改 options

## 6. DB 寫入

| 表 | 動作 |
|---|---|
| `ai_provider_models` | upsert 本次見到的；missing 標 unavailable |
| `cat_ai_model_options` | 僅 insert 新草稿（ignoreDuplicates） |
| `ai_model_sync_runs` | insert running → update success/failed |
| `ai_model_providers` | 不寫（Phase 1 seed 已存在） |

無 DB transaction；sequential write；失敗標 `sync_runs.failed`。

## 7. 程式路徑

| 檔案 | 用途 |
|---|---|
| `api/cat-ai-model-sync.js` | Vercel handler |
| `api/lib/require-executive.js` | JWT + executive 查核 |
| `api/lib/model-sync-rules.js` | 篩選 + sync plan + 錯誤碼（canonical 純 JS） |
| `src/lib/cat-ai-model-sync/*.ts` | 型別化 re-export（供 Phase 3） |
| `vite.config.ts` | dev proxy `/api/cat-ai-model-sync` |

## 8. 測試

- `src/lib/cat-ai-model-sync/*.test.ts` — 篩選、sync plan、錯誤碼
- `api/lib/require-executive.test.js` — 授權 mock
- `api/cat-ai-model-sync.test.js` — endpoint 行為 mock（不打真 OpenAI／DB）

## 9. 產品決策：AI 管理為系統預設值（Phase 3/4 備註）

「AI 管理」中的模型設定只代表**系統層級**的預設值與可用清單，**不是**使用者永久個人偏好。

後續 AI 批次翻譯介面（Phase 3/4 實作，本 Phase 不做 UI）：

1. 每次開啟 AI 批次翻譯：讀 `enabled=true` 清單；預設選 `is_default=true` 模型
2. 使用者可在**本次**批次前臨時改選模型
3. 臨時選擇**只套用本次**：不寫回 `cat_ai_model_options`、不改 `is_default`、不存 profile／localStorage
4. 下次開啟仍回到系統預設
5. 實際執行模型若需稽核，寫 AI job log snapshot（Phase 5），不作偏好保存

## 10. production 第一次 sync

- merge 本 PR **≠** 已執行 production sync
- 部署後需 executive 手動 `POST` + Bearer JWT
- 需另案核准；本 commit 不執行

## 11. 驗收（merge 前）

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] dist 無 `SERVICE_ROLE`／`SUPABASE_SERVICE_ROLE_KEY`
- [ ] 未改 `cat-tool/app.js`、`cat-cloud-rpc.ts`、migration
