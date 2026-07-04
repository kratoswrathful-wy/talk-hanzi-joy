狀態：已驗收

# CAT AI Model Registry Phase 1 — Production DB Apply 執行紀錄（2026-07-04）

本文件記錄 CAT AI Model Registry（模型清單治理）Phase 1 資料庫變更**實際套用到 production** 的完整過程、驗證結果與 rollback 方式。規劃背景見 [`docs/CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md`](CAT_AI_MODEL_REGISTRY_PLAN_2026-07.md)。

## 1. 背景

- Phase 1 的 schema／RLS／seed／types／文件已透過 PR（`feature/cat-ai-model-registry-phase1`）合併進 `main`（commit `0737bf2`）。
- **merge 進 `main` 本身不會自動套用 production DB migration**：repo 的 CI（`.github/workflows/ci.yml`）與 `vercel.json`、`package.json` 皆未包含 `supabase db push` 或等效的自動套用指令。
- production DB 的實際套用是**另行取得專案擁有者明確核准後**才執行，且分成「preflight（唯讀）→ 正式 apply → schema_migrations metadata 對齊」三個階段，每一步都個別取得核准。
- 本次全程**未使用 `supabase db push`**。
- 本次**未開始 Phase 2～4**（同步 endpoint、管理 UI、前台模型選單／BYOK 收斂）。

## 2. 套用目標

| 項目 | 內容 |
|---|---|
| migration 檔案 | [`supabase/migrations/20260704180000_cat_ai_model_registry.sql`](../supabase/migrations/20260704180000_cat_ai_model_registry.sql) |
| migration name | `cat_ai_model_registry` |
| 預期 version | `20260704180000`（對應本機 git 檔名時間戳） |
| 內容範圍 | 新增 4 張表（`ai_model_providers`／`ai_provider_models`／`cat_ai_model_options`／`ai_model_sync_runs`）、對應索引、RLS policy、`gpt-4.1-mini` 預設模型 seed |

## 3. 實際執行方式

**套用工具**：Supabase MCP 官方 `apply_migration`（DDL 專用工具），**非 `supabase db push`**。理由詳見 preflight 階段的評估：production 既有 `supabase_migrations.schema_migrations` 歷史已知存在檔名與登記版號不一致的情形（例如 `w5_fk_indexes`、`w10_fees_write_admin_only_and_view` 等；見 [`docs/BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md`](BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md)），若用 `db push` 讓 CLI 自行判斷整個差異集合，風險不可控；改用 `apply_migration` 只精準套用這一支 migration 的 SQL 內容，範圍可控。

**執行時序**：

1. 先完成完整 preflight（唯讀查詢）：確認 migration 尚未套用、四張表尚未存在、`app_role` enum／`has_role()`／`user_roles`／`authenticated` role／`gen_random_uuid()` 等依賴物件皆存在、migration 本身冪等安全（`if not exists`／`on conflict`／`drop policy if exists`）。
2. 取得專案擁有者明確核准後，呼叫 `apply_migration`（`name = cat_ai_model_registry`），套用整支 migration SQL。
3. `apply_migration` 執行成功，但**自動登記的 version 是工具執行當下的 UTC 時間戳 `20260704213748`**，而非本機檔名對應的 `20260704180000`（`apply_migration` 不接受自訂 version 參數）。
4. 依此差異回報專案擁有者，取得「對齊版號」的明確核准後，執行 `schema_migrations` metadata 修正（見第 5 節），最終登記為 `version = 20260704180000`／`name = cat_ai_model_registry`。

## 4. 驗證結果

套用後立即以唯讀 SQL 驗證，全部通過：

| 驗證項 | 結果 |
|---|---|
| `public.ai_model_providers` | ✅ 存在 |
| `public.ai_provider_models` | ✅ 存在 |
| `public.cat_ai_model_options` | ✅ 存在 |
| `public.ai_model_sync_runs` | ✅ 存在 |
| RLS policy 數量 | ✅ 8 條（`ai_model_providers` ×2、`ai_provider_models` ×1、`cat_ai_model_options` ×5、`ai_model_sync_runs` ×1），名稱與動作皆與 migration 內容一致 |
| `gpt-4.1-mini` seed | ✅ 存在（`provider_key='openai'`／`model_id='gpt-4.1-mini'`） |
| `enabled` | ✅ `true` |
| `is_default` | ✅ `true` |
| 全表 `is_default=true` 筆數 | ✅ 恰好 1 筆 |
| Supabase security advisor | ✅ 對這四張新表未列出任何警示 |
| error / warning | ✅ 無（除第 5 節記錄的一次 metadata 對齊技術性重試外，套用本身零錯誤） |

## 5. schema_migrations metadata 對齊

| 項目 | 內容 |
|---|---|
| `apply_migration` 自動產生的原始 version | `20260704213748` |
| 對齊後 version | `20260704180000` |
| name | `cat_ai_model_registry`（對齊前後不變） |
| 備份表 | `supabase_migrations._backup_20260704213748_cat_ai_model_registry`（`CREATE TABLE ... AS SELECT ...` 建立，內容為對齊前該筆 `schema_migrations` row 的完整快照） |
| 備份表現況 | **保留，未刪除**，供日後稽核查證 |

**對齊執行方式**：在單一 transaction 內，用 `DO $$ ... $$` 區塊執行 `UPDATE`，並以 `GET DIAGNOSTICS ROW_COUNT` 確認影響筆數恰為 1 才 `COMMIT`，否則整個 transaction 失敗回滾：

```sql
begin;

do $$
declare
  affected int;
begin
  update supabase_migrations.schema_migrations
  set version = '20260704180000'
  where version = '20260704213748'
    and name = 'cat_ai_model_registry'
    and not exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20260704180000'
    );

  get diagnostics affected = row_count;

  if affected <> 1 then
    raise exception 'affected row count is % (expected 1), aborting', affected;
  end if;
end $$;

commit;
```

**過程小插曲（記錄以供後續參考）**：第一次嘗試時，`UPDATE` 語句寫在 `DO` 區塊**外面**、`GET DIAGNOSTICS` 寫在區塊**裡面**，導致區塊讀不到外部語句的影響筆數（恆為 0），觸發安全閥值而整個 transaction 正確回滾、無任何資料異動。修正為把 `UPDATE` 移入同一個 `DO` 區塊內後，`GET DIAGNOSTICS` 正確取得 `affected = 1`，交易成功 `COMMIT`。此插曲純屬 SQL 寫法問題，未造成任何非預期的資料庫狀態變更（唯讀驗證已確認每一步的資料庫實際狀態）。

## 6. Rollback / Recovery 說明

**分成兩種情境，不可混淆**：

### A. 只回復 metadata 對齊（把登記版號改回 `apply_migration` 原始自動產生的版號，不影響任何實際資料表）

```sql
update supabase_migrations.schema_migrations
set version = '20260704213748'
where version = '20260704180000'
  and name = 'cat_ai_model_registry';
```

適用情境：若日後發現 `20260704180000` 這個版號需要挪作他用，或需要暫時恢復成 `apply_migration` 原始登記狀態；此操作**不影響**四張表、RLS policy 或 seed 資料。

### B. 完整移除 Phase 1 migration（含四張表與其資料）

**需另行明確核准，不得自行執行**。原則 SQL：

```sql
drop table if exists public.ai_model_sync_runs cascade;
drop table if exists public.cat_ai_model_options cascade;
drop table if exists public.ai_provider_models cascade;
drop table if exists public.ai_model_providers cascade;
delete from supabase_migrations.schema_migrations where version = '20260704180000';
```

適用情境：若 Phase 1 的資料庫設計需要整體撤回或重做；因四張表目前僅有 1 筆 seed 資料、尚未被任何程式（Phase 2～4 尚未開始）讀寫，此操作影響範圍可控，但仍屬破壞性操作，執行前須再次確認無其他相依物件。

## 7. 明確註記：本次未做事項

- 未執行 `supabase db push`。
- 未建立 Supabase Branching。
- 未修改任何程式碼（`src/`、`cat-tool/`、`api/` 等皆未變動）。
- 未修改 `cat-tool/app.js`。
- 未碰 CAT 編輯器 UI。
- 未碰 BYOK（使用者自帶 OpenAI key）相關邏輯。
- 未切換前台模型選單。
- 未開始 Phase 2（`api/sync-openai-models.js` 模型同步 endpoint）。
- 未開始 Phase 3（registry 管理 UI）。
- 未開始 Phase 4（registry 前台切換／BYOK 收斂）。
- 未處理 baseline schema repair（見 [`docs/BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md`](BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md)，為獨立待規劃工項）。

## 8. 最終狀態

- **CAT AI Model Registry Phase 1 已完成**：schema／RLS／seed 已合併進 `main` 並實際套用到 production DB，`schema_migrations` 登記版號已與本機 migration 檔名對齊（`20260704180000`）。
- production DB 現況：四張新表存在、RLS 生效、`gpt-4.1-mini` 為唯一預設模型（`enabled=true`／`is_default=true`），但**尚未被任何現行程式讀寫**（Phase 2～4 尚未開始），對現行 CAT 翻譯流程無感、無風險。
- **Phase 2～4（模型同步、管理 UI、前台切換／BYOK 收斂）待後續另行規劃與核准**，不在本文件範圍內。
