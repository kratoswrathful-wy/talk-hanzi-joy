狀態：規劃中

# Baseline Schema 缺失修復規劃（2026-07）

本文件**僅做分析與方案規劃**。不寫入資料庫、不修改任何 migration 檔案、不與 Phase 1（`feature/cat-ai-model-registry-phase1`）或 migration 版號修正（`fix/migration-history-realign`）混在同一分支。

背景與發現過程見 [`docs/MIGRATION_HISTORY_REPAIR_2026-07-04.md`](MIGRATION_HISTORY_REPAIR_2026-07-04.md) §問題三。

## 1. 問題摘要

正式資料庫（Supabase 專案 `wshsmerltcakffllgyul`）裡，一批「基礎表」從未透過有留下逐筆歷史紀錄的 migration 系統建立過：`supabase_migrations.schema_migrations` 這張系統表裡，完全找不到這些表的 `CREATE TABLE` 語句，即便對應的 git migration 檔案（例如 `20260305092158_c333bc05-....sql`）看起來確實寫了完整的建表語句。

已用唯讀查詢**逐一嚴謹確認**（非字串比對猜測）查無任何 migration 建立的表：

- `user_roles`
- `profiles`（推測同批，待第 2 節逐一確認方法覆核）
- `invitations`
- `cat_stage_assignments`

**影響**：任何工具若照 `schema_migrations` 系統表內容「從零重放」建立全新資料庫（例如 Supabase Branching、未來若要建置本機開發環境、或災難復原時的資料庫重建），都無法得到完整的 schema——上述表格會直接缺失，後續依賴它們的 migration（RLS 政策、索引等）會執行失敗。

**不影響**：正式環境現況本身完全正常，這些表格已經存在於正式資料庫，日常操作、既有功能不受任何影響。這純粹是「從零重建」這條路徑的限制。

## 2. 範圍待確認清單

第一輪用寬鬆字串比對（`schema_migrations.statements[1] like '%create table%<表名>%'`）掃出以下候選，**尚未**逐一用 §1 的嚴謹方式（全文 regex 搜尋整個歷史 + 交叉比對 git 檔案）覆核，可能有誤判（例如像 CAT AI 模組那樣，一個大檔案被拆成很多小段登記，建表語句剛好落在字串比對抓不到的片段裡）：

```
cat_ai_category_tags, cat_ai_project_settings, cat_ai_settings, cat_ai_style_examples,
cat_file_attachments, cat_file_workflow_stages, cat_guidelines, cat_module_logs,
cat_note_replies, cat_project_attachments, cat_segment_annotations,
cat_tbs, cat_tm_segments, cat_tms, cat_workflow_template_stages, cat_workspace_notes,
client_invoice_fees, invoice_fees, slack_oauth_states, user_slack_meta
```

**執行本修復前的必要前置步驟**：對上述候選清單逐一比照 §1 的方法覆核（全文搜尋 `schema_migrations` 全部歷史 + 比對 git 檔案），排除誤判，產出最終「真正缺失」的完整表格清單，再進入 §3 的修復方案。

## 3. 修復方案選項

### 方案 A：完整 schema 快照 migration（建議）

用 `pg_dump --schema-only`（或 Supabase 提供的等效工具／MCP `list_tables` + 手動組出 DDL）對**正式資料庫現況**做一次完整的 schema-only 匯出，只挑出「§2 確認為真正缺失」的物件（表、索引、約束、預設值、trigger），寫成一支新的、內容為 `create table if not exists ...` 的**冪等** migration，補進 migration 歷史最前面（或用一個明確早於所有現有 migration 的版號，例如 `20260305000000_baseline_schema_snapshot.sql`）。

- **優點**：一次補齊，後續 Branching／從零重建可以正常運作；不需要逐一考古每張表的真實建立時間點。
- **風險**：
  - 快照時間點是「現在」，若這些表在歷史上曾經有欄位被後續 migration 改過又改回來，快照只反映「現在的最終樣貌」，可能跟真正的歷史演進路徑不同——但因為目的只是「從零重建出跟現在正式環境一致的 schema」，這其實是可接受、甚至更正確的做法。
  - 需要非常小心排除「已經有其他 migration 負責建立」的物件，避免重複定義造成衝突（用 `if not exists` 可大幅降低風險，但 FK／trigger／預設值等仍需人工核對，不能只靠 `if not exists` 保平安）。
  - 這支新 migration 一旦寫入 git 並在某個環境套用，`schema_migrations` 歷史又會多一筆「這支 migration 到底該登記在什麼版號」的問題，需要謹慎選擇版號避免打亂既有順序（比照本次 `20260430205338→20260502120001` 的版號衝突檢查方法）。

### 方案 B：僅記錄已知限制，不修復

在文件中明確記錄「這個 Supabase 專案無法從純 migration 歷史從零重建」是已知限制，任何需要全新環境的工作（測試、災難復原）改用「從正式環境備份還原」而非「重放 migration」。

- **優點**：零風險，不動任何東西。
- **缺點**：Supabase Branching 這個功能對本專案永久失去「驗證用途」的實用性；未來若真的需要重建（例如正式環境嚴重故障），會沒有乾淨的 schema-only 重建路徑，只能依賴資料庫層級備份（如果有的話，需另外確認備援機制是否存在、頻率為何）。

### 方案 C：混合式——先做方案 B，方案 A 列為排入待辦但不設期限

短期先接受限制並記錄，中長期（有餘裕時）再做方案 A 的完整快照。這是目前**建議**的路徑，原因：

1. 不影響正式環境任何現有功能。
2. 給予足夠時間做好 §2 的覆核工作，避免倉促做快照 migration 反而引入新的重複定義風險。
3. 與目前工程資源分配（W 系列改善工項、CAT 功能開發）不衝突，不搶佔已排定的工項。

## 4. 建議執行步驟（僅在你核准進入實作階段後才開始）

1. 覆核 §2 候選清單，產出最終確認的「真正缺失表」清單（含每張表當時的完整欄位定義、索引、約束、RLS 政策、trigger）。
2. 對每張確認缺失的表，用 `list_tables`／`execute_sql` 唯讀查詢正式資料庫，取得目前完整的 DDL（欄位、型別、預設值、NOT NULL、FK、UNIQUE、CHECK）。
3. 組成一支新的、內容全部使用 `create table if not exists` 寫法的 migration 檔案，並同步補上這些表原本應該有的 RLS 政策（若原本就有 RLS，需要在快照中一併重建 `enable row level security` 與對應 policy，用 `drop policy if exists` + `create policy` 的冪等寫法，比照本次 `rls_initplan_fix` 的寫法）。
4. 決定該 migration 應登記的版號，用比照本次 `20260430205338` 檢查方式（找出所有依賴此快照涉及的表的下游 migration，確認新版號不會排在任何依賴它的 migration 之後、也不會排在它依賴的其他表之前）確認不衝突。
5. 用一次性 Supabase Branch 驗證：從零重放後，§2 清單裡的表全部存在、`supabase/tests/` 下的既有 RLS 測試全部通過、既有功能（CAT／LMS）沒有因為快照內容跟正式環境有出入而出現行為差異。
6. 驗證通過後，比照本次流程，先在文件中完整記錄，再等待你明確核准，才把該 migration 實際套用到正式資料庫的 `schema_migrations` 歷史（或視情況決定是否需要套用到正式庫本身——由於這些表在正式庫**已經存在**，這支 migration 對正式庫執行應該是全 no-op，`if not exists` 會讓它什麼都不做，真正的效果只發生在「從零重建」的場景）。

## 5. 明確排除於本次規劃之外的事項

- 不在本文件階段寫入任何資料庫（正式或分支）。
- 不修改任何現有 migration 檔案。
- 不與 Phase 1（CAT AI 模型 registry）分支混合。
- 不與 `fix/migration-history-realign`（版號修正）分支混合。
- 不設定執行期限；待你決定是否／何時進入 §4 實作階段。
