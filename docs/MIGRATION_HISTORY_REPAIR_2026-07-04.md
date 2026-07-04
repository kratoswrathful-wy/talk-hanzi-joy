狀態：已落地待驗收

# Migration 歷史 Metadata 修復記錄（2026-07-04）

## 背景

在對 `feature/cat-ai-model-registry-phase1`（CAT AI 模型 registry Phase 1）做「能否用 Supabase Branching 從零重建乾淨資料庫」驗證時，發現正式資料庫的 migration 歷史系統表（`supabase_migrations.schema_migrations`）存在既有問題，導致從零重放會中途失敗。這份文件記錄本次已完成的一筆修正，以及後續發現、尚未處理的更大範圍問題。

**本次修正與 Phase 1 migration 內容本身無關**——Phase 1 的 `20260704180000_cat_ai_model_registry.sql` 是全部 migration 裡時間戳最新的一支，兩次 Branching 失敗時都還沒被重放到就已經先失敗。

## 問題一：版號登記錯誤（已修正）

### 問題原因

`supabase_migrations.schema_migrations` 這張系統表記錄「哪個版號的 migration 存了什麼 SQL」。Supabase Branching 建立新分支時，**是照這張系統表的版號順序重放，不是照 git repo 裡的 migration 檔名**。

版號 `20260430205338`（登記名稱 `rls_initplan_fix`）裡實際存的 SQL，是一次全面性的 RLS 政策重寫（把 `auth.uid()` 包成 `(SELECT auth.uid())` 以優化效能），其中包含對 `cat_ai_issue_groups` 這張表的政策操作。但 `cat_ai_issue_groups` 這張表要到版號 `20260502120000` 才被建立——**比 `20260430205338` 晚**。

比對後確認：這筆記錄的內容跟另一筆版號 `20260502140000`（同樣叫 `rls_initplan_fix`）幾乎一模一樣。合理判斷是：這次 RLS 修正原本是在 `cat_ai_issue_groups` 已存在之後才實際執行的，但後來因為某種歷史對齊操作（例如 `supabase migration repair`），被追溯登記成了一個更早、不正確的版號。

正式環境因為表早已存在，執行起來完全沒事；但「從零重建」時，系統會照登記版號順序重放，執行到這筆版號過早的紀錄時，因為 `cat_ai_issue_groups` 還不存在而失敗：

```
relation "public.cat_ai_issue_groups" does not exist
```

### 原版號 → 新版號

| 項目 | 值 |
|---|---|
| 原 version | `20260430205338` |
| 新 version | `20260502120001` |
| name（不變） | `rls_initplan_fix` |

### 為什麼改成 `20260502120001`

- 對該筆 SQL 全文做唯讀掃描，抓出全部 36 張被引用的表，逐一查證其建立版號，確認 `cat_ai_issue_groups`（`20260502120000`）是這 36 張表裡最晚建立的一張。
- `20260502120001` 恰好落在 `cat_ai_issue_groups`（`120000`）與下一筆 `perf_indexes`（`130000`）之間的空隙，不撞號。
- 確認 `20260430205338` 到 `20260502120000` 這段期間沒有任何 `DROP TABLE`／改名操作，不會有表格被砍掉又重建的風險。
- 確認 `perf_indexes`（`130000`）、`internal_notes_consultation_slack_records`（`130500`）都不碰 policy、也不碰 `cat_ai_issue_groups`，跟本次修正的內容沒有交集。
- 確認稍後的 `20260502140000`（內容幾乎相同的正確版 `rls_initplan_fix`）即使再跑一次同樣的政策，也不會失敗——因為每條政策都是「先 `DROP POLICY IF EXISTS` 再 `CREATE POLICY`」的冪等寫法，重跑一次只是把同一批政策再刪再建，結尾狀態不變。

### 實際執行 SQL（已在交易內執行並確認 affected row = 1）

```sql
begin;

create table if not exists supabase_migrations._backup_20260430205338 as
select * from supabase_migrations.schema_migrations
where version = '20260430205338';

do $$
declare
  affected int;
begin
  update supabase_migrations.schema_migrations
  set version = '20260502120001'
  where version = '20260430205338'
    and name = 'rls_initplan_fix';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'ABORT: expected exactly 1 row affected, got %', affected;
  end if;
end $$;

commit;
```

### Rollback SQL

```sql
update supabase_migrations.schema_migrations
set version = '20260430205338'
where version = '20260502120001';
```

（也可以從 `supabase_migrations._backup_20260430205338` 這張備份表整列還原，效果相同；備份表目前仍保留在正式資料庫，尚未清除。）

### 執行後驗證結果

- 備份表 `supabase_migrations._backup_20260430205338`：建立成功，內容為原始一筆（`version=20260430205338, name=rls_initplan_fix`）。
- `20260430205338`：唯讀查詢確認**已不存在**（0 筆）。
- `20260502120001`：唯讀查詢確認**已存在**（1 筆，`name=rls_initplan_fix`）。

## 問題二：Branching 第一次重放結果（此問題已解）

修正上述版號後，重新建立一次性 Supabase Branch（`phase1-verify-2`）驗證，**確認不再卡在 `cat_ai_issue_groups` 這個點**——但重放過程在更後面的地方遇到了另一個、性質不同的問題（見下方「問題三」），該次分支已於驗證後刪除，停止計費。

## 問題三：baseline schema 缺失（尚未處理，需要獨立規劃）

### 現象

第二次 Branching 重放時，在執行版號 `20260610140000`（`sync_cat_workflow_assignments`，內容為 `CREATE UNIQUE INDEX ... ON public.cat_stage_assignments`）時失敗：

```
relation "public.cat_stage_assignments" does not exist
```

### 已確認的根因

用唯讀查詢對整個 `supabase_migrations.schema_migrations` 系統表全文搜尋，確認**沒有任何一筆記錄包含 `CREATE TABLE ... cat_stage_assignments`**。同樣的搜尋方式也確認了 `CREATE TABLE public.user_roles`、`CREATE TABLE public.profiles`、`CREATE TABLE public.invitations` 這幾句**在整個系統表歷史裡完全不存在任何一筆**。

進一步比對揭露真正的根因是**第三種狀況**（詳見下方「三選一釐清」）：git repo 裡最早的 migration 檔案（`20260305092158_c333bc05-afc1-4728-96d7-a26aae40c810.sql`，165 行，內含 `profiles`／`user_roles`／`invitations` 三張表完整定義、函式與 trigger）**與正式資料庫系統表裡登記在同一版號的內容完全對不上**：系統表裡這個版號實際只存了 90 個字元，只有檔案最開頭那一句 `CREATE TYPE app_role`。

### 三選一釐清（依你的要求逐一驗證，附證據）

1. **git repo migration 檔案真的沒有 `CREATE TABLE user_roles`？** → 否，**有**。檔案 `20260305092158_c333bc05-afc1-4728-96d7-a26aae40c810.sql` 第 18 行就是 `CREATE TABLE public.user_roles (`，內容完整。
2. **正式 DB 的 `schema_migrations` stored SQL 沒有？** → **是**。對同一版號 `20260305092158`，系統表裡存的內容只有 90 個字元（`CREATE TYPE app_role` 那一句），其餘 profiles／user_roles／invitations／函式／trigger 完全不在裡面。往後緊接著的幾個版號（`092216`／`092235`／`094453`／`095441`／`105333`）存的也是完全不同的其他內容（`handle_updated_at` 函式、`avatars` 儲存桶、`permission_settings` 表、`member_translator_settings` 表、`fees` 表），同樣**不含** `user_roles`／`profiles`／`invitations` 的 `CREATE TABLE`。對整個系統表（全部 130 筆）做全文搜尋，確認這三句 `CREATE TABLE` **完全不存在於任何一筆紀錄**。
3. **Branching 重放內容與 git repo 不一致？** → **是，而且是前一點的直接後果**。因為 Branching 是照系統表內容重放（不是照 git 檔案），系統表裡從頭到尾都沒有這三張表的建立語句，所以從零重放出來的資料庫必然沒有這幾張表；`cat_stage_assignments`（以及後續可能還有更多）的失敗只是這個根本問題第一次真正曝光出來的其中一個症狀。

### 判斷

這代表**這個 Supabase 專案最初的一批基礎表**（`profiles`、`user_roles`、`invitations`、`cat_stage_assignments` 及本文件「範圍待確認」清單中列出的其他表）**從未透過有留下逐筆歷史紀錄的 migration 系統建立過**。目前找到的 git migration 檔案（例如 `20260305092158_....sql`）很可能是後來透過工具（例如 `supabase db pull`）從「當時資料庫現況」回推重建出來的檔案，只是剛好命名／編號跟系統表裡真正的套用紀錄對不上；系統表裡這些基礎表對應版號實際存的內容，看起來是被拆成了很多小片段個別登記，但唯獨最基礎的那幾張表的建立語句，兩邊都沒有完整对應到。

**這不是逐筆修正版號可以解決的問題**：光靠現有 migration（不論版號怎麼調整），永遠無法從零重建出一份完整的乾淨資料庫，因為根本沒有任何一筆歷史紀錄存過這些基礎表的建立語句。

### 範圍待確認清單（第一輪字串比對，尚未逐筆像上面三張表一樣嚴謹驗證）

以下為 `public` schema 裡「用寬鬆字串比對，找不到任何 migration 提及」的表，僅供後續規劃參考，**尚未逐一confirm**，可能仍有誤判（措辭不同但實際有紀錄）：

```
cat_ai_category_tags, cat_ai_project_settings, cat_ai_settings, cat_ai_style_examples,
cat_file_attachments, cat_file_workflow_stages, cat_guidelines, cat_module_logs,
cat_note_replies, cat_project_attachments, cat_segment_annotations, cat_stage_assignments,
cat_tbs, cat_tm_segments, cat_tms, cat_workflow_template_stages, cat_workspace_notes,
client_invoice_fees, invitations, invoice_fees, slack_oauth_states, user_roles, user_slack_meta
```

（`user_roles`／`invitations` 已如上逐一驗證確認為真；其餘尚待個別確認，其中部分可能跟 `cat_ai_*` 一樣，是「一個大檔案被拆成多筆小紀錄，建表語句剛好落在字串比對抓不到的片段裡」的假警報。）

## 後續處理建議

1. **不在本次一併處理**：修「baseline schema 缺失」需要產出一份完整的 schema 快照 migration（例如對正式資料庫做一次 `pg_dump --schema-only` 等效操作，把目前「查無來源 migration」的物件定義完整補進一支新的、獨立的 migration），工程量與風險都明顯超出本次「單筆版號修正」的範圍，需要另開獨立文件規劃、獨立分支執行，**不得**與 Phase 1 分支或 lint 清零工項混在一起。
2. **git repo 對齊**：即使正式 DB 的 metadata 已經修好，`git` 裡的 migration 檔案（本次修正的 `20260430205338` 那筆檔案，以及先前已知的 `w5`／`w10` 系列本機檔名版號與遠端不一致問題）仍然沒有對齊。這會持續讓 `supabase db push` 出現「本機／遠端版本對不上」的提示。這部分同樣建議另開獨立分支處理，不混入 Phase 1。
3. **在 baseline schema 快照補齊之前**：任何工項若要用 Supabase Branching 驗證「從零重建」，都可能撞到本文件列出的（或尚未發現的）同類缺口，屬於已知限制，不代表被驗證工項本身有問題。

## Branching 驗證結果總結

| 驗證輪次 | 結果 | 卡住原因 |
|---|---|---|
| 第一次（`phase1-verify`） | 失敗 | 版號 `20260430205338` 登記過早（問題一，已修正） |
| 第二次（`phase1-verify-2`，修正後重跑） | 失敗 | `cat_stage_assignments` 等 baseline 表查無建立 migration（問題三，尚未處理） |

兩次驗證分支皆已於確認結果後立即刪除，僅產生極短時間的 Branching 計費（每小時 US$0.01344 費率，兩次合計均在數分鐘內完成）。
