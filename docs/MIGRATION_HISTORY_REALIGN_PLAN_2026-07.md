狀態：已完成（2026-07-15）

# Supabase migration 歷史對齊——執行計畫（審核用）

- **日期**：2026-07-15
- **工單來源**：`工單_migration歷史對齊_2026-07-15.md`（擁有者交辦）
- **正式庫 project id**：`wshsmerltcakffllgyul`
- **目標**：讓 `supabase db push` 恢復一鍵可用（不必再以 MCP `apply_migration`＋`migration repair` 繞路）
- **性質**：**只動** `supabase_migrations.schema_migrations` 的版號紀錄，以及（若審核裁定需要）repo 內 placeholder 檔；**全程不改**實際資料表結構、函式、RLS 內容、業務資料
- **執行狀態（2026-07-15）**：§10 預設方案已執行完畢；終驗 T1–T4＋修正後 T5 通過。對齊後快照見 [`MIGRATION_HISTORY_REALIGN_SNAPSHOT_POST_2026-07-15.md`](MIGRATION_HISTORY_REALIGN_SNAPSHOT_POST_2026-07-15.md)。防再發見 [`DEV_PIPELINE.md`](DEV_PIPELINE.md)。
- **對齊前快照**：[`MIGRATION_HISTORY_REALIGN_SNAPSHOT_PRE_2026-07-15.md`](MIGRATION_HISTORY_REALIGN_SNAPSHOT_PRE_2026-07-15.md)
- **範圍外（交叉引用，本工單不處理）**：
  - Branching／從零重放／baseline 缺檔：[`BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md`](BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md)
  - 2026-07-04 曾將 DB 版號 `20260430205338` 改登記為 `20260502120001`：[`MIGRATION_HISTORY_REPAIR_2026-07-04.md`](MIGRATION_HISTORY_REPAIR_2026-07-04.md)（與本計畫 B-1／C-1 相關；執行時採「revert B1＋applied C1」）

---

## 0. 審核決策與執行紀錄（2026-07-15）

**§10 勾選（已核准）**：採納預設；B1 改案不採；D-opt 不做；凍結後連續執行；授權動手。

**T5 修正**：無害試推 migration **留在 repo 與歷史表**（勿再 repair reverted）。

**實際操作摘要**：

1. 合併計畫 PR #44（`51ee3480`）。
2. 凍結檢查：多 worktree 無並行 migration；遠端清單與 PRE 快照一致。
3. 歷史對齊（單一事務）：A1–A6 `UPDATE version`（保留 statements）；A7–A10／B1–B3 `DELETE`；C1 `INSERT` placeholder。
4. T1：`supabase migration list` Local＝Remote；腳本 `--live` 通過。
5. T2：`db push --dry-run` → up to date。
6. T3：catalog／fees_visible 指紋不變。
7. T5：新增並 `db push` `20260715120000_migration_history_realign_noop.sql`（已留存）。
8. 第二階段：`docs/DEV_PIPELINE.md`、`AGENTS.md`、CI workflow＋fixture 模擬（「只 repair 不補檔」exit 1）。
---

## 1. 原則（與工單一致）

1. **以 repo `supabase/migrations/*.sql` 檔名版號為唯一事實來源**；把遠端歷史表修到與檔案清單一一對應。
2. 只用 `supabase migration repair --status applied|reverted`（或等效），**不執行** migration SQL 本體。
3. 若某 DB 獨有列的 SQL **完全不被**任何 repo 檔涵蓋，才補 placeholder／內容檔（本輪 B 類評估後**不需補檔**，見 §4）。
4. **凍結窗口**：動手時段確認無其他分支／代理正在 `db push` 或 `apply_migration`；連續兩次 `git status`／分支檢查確認 working tree 無他方操作（架構規則 §10）。
5. 過程任一步不確定 → 停手回報，不猜。

---

## 2. 盤點方法（已執行，唯讀）

| 步驟 | 做法 |
|---|---|
| 遠端清單 | MCP `list_migrations`／`execute_sql` 查 `schema_migrations` |
| 本地清單 | `supabase/migrations/*.sql` 檔名時間戳（`main` @ `959b77e4`） |
| 內容比對 | 對 B／A 爭議列拉 `statements` 全文或長度＋開頭；與現況 `fees_visible`／政策對照 |
| 集合差 | DB−repo、repo−DB、雙邊皆有但語意重複 |

**工單 A 類 W5 次版號更正**：工單寫 repo `120100`／`120200`；**實際檔名**為 `20260703120100`／`20260703120200`（見下表）。本計畫以實際檔名為準。

---

## 3. 完整對照摘要

| 類 | 說明 | 筆數（本輪） |
|---|---|---:|
| **吻合** | version 兩邊都有，且非本輪爭議 | 其餘大多數 |
| **A** | 同一邏輯變更、DB 用實際套用時鐘、repo 用規劃時鐘（或雙重登記） | 見 §3.1 |
| **B** | DB 有、repo 無對應檔 | 3（§4） |
| **C** | repo 有、DB 無 | 1（§5） |
| **D** | 同名／歷史重複但版號兩邊都在 | 1 組（§6） |

### 3.1 A 類建議處置（保留 repo 版號＝applied；DB 時鐘／分拆＝reverted）

| # | DB version（建議 reverted） | DB name | Repo version（建議 applied／保留） | Repo 檔 | 依據 |
|---|---|---|---|---|---|
| A1 | `20260703121703` | w5_fk_indexes | `20260703120000` | `…_w5_fk_indexes.sql` | 同名同階段；MCP／實際套用時鐘 vs 規劃檔名 |
| A2 | `20260703121719` | w5_rls_initplan_stragglers | `20260703120100` | `…_w5_rls_initplan_stragglers.sql` | 同上（**非**工單誤寫的 `120100`） |
| A3 | `20260703121737` | w5_merge_permissive_billing_policies | `20260703120200` | `…_w5_merge_permissive_billing_policies.sql` | 同上（**非** `120200`） |
| A4 | `20260703154440` | w10_translator_row_read_tighten | `20260703140000` | `…_w10_translator_row_read_tighten.sql` | 同上 |
| A5 | `20260703175926` | w10_fees_visible_mask_view | `20260704010000` | `…_w10_fees_visible_mask_view.sql` | 同上 |
| A6 | `20260704030404` | w10_fees_write_admin_only_and_view | `20260704020000` | `…_w10_fees_write_admin_only_and_view.sql` | 時鐘版；最終語意以 repo 檔為準。另見 B3 同名第三筆 |
| A7 | `20260714024357` | cat_wf_assignment_sync_no_downgrade_v2 | （併入）`20260714120000` | `…_cat_wf_assignment_sync_no_downgrade.sql` | MCP 只套了 upsert 函式（sql_len≈4567）；完整 repo 檔已 applied（≈14270）涵蓋 upsert＋sync＋backfill |
| A8 | `20260714024418` | cat_wf_assignment_sync_no_downgrade_v2_sync | （併入）`20260714120000` | 同上 | MCP 第二段只套 sync 函式（≈8701）；與 A7 一起由單一 repo 檔覆蓋 |
| A9 | `20260714071002` | cat_meta_items_display_map | `20260714130000` | `…_cat_meta_items_display_map.sql` | 同名雙登記；repo 版已 applied（sql_len 785 vs 833，僅註解差異級） |
| A10 | `20260714071532` | cat_segments_patch_meta_items | `20260714140000` | `…_cat_segments_patch_meta_items.sql` | 同上（3660 vs 3832） |

**A 類已存在、應保留 applied（勿 reverted）**：`20260714120000`、`20260714130000`、`20260714140000`（先前 repair 補入，與 repo 檔名一致）。

**A 類執行時需 `repair --status applied` 的 repo 版號**（目前 DB 無）：`20260703120000`、`20260703120100`、`20260703120200`、`20260703140000`、`20260704010000`、`20260704020000`。

---

## 4. B 類——逐筆處置與依據（審核焦點）

工單要求：每筆必須先比對 SQL 與 DB 實際狀態，再決定 **`repair reverted`** 或 **補檔**。

### B1 — `20260502120001`／`rls_initplan_fix`

| 項目 | 內容 |
|---|---|
| **Repo** | **無**此版號檔。有同名最終檔 `20260502140000_rls_initplan_fix.sql`；另有 placeholder `20260430205338_remote_history_placeholder.sql`（`SELECT 1`） |
| **DB SQL** | ≈18103 字元；大批 `DROP/CREATE POLICY` 把 `auth.uid()` 改成 `(SELECT auth.uid())` |
| **與 repo 關係** | 與 `20260502140000`（DB 內亦已登記，≈21385，含表頭註解）為**同一邏輯變更的較早／較短陳述**。2026-07-04 曾把原誤登在 `20260430205338` 的列**改版號**為本列（見歷史修復文件），目的是讓 Branching 重放順序落在 `cat_ai_issue_groups`（`120000`）之後 |
| **現況 schema** | 正式庫 RLS 已是 initplan 形態；冪等重跑不應成為本工單目標 |
| **建議處置** | **`migration repair --status reverted`（不補檔）** |
| **依據** | (1) 語意已由 repo＋DB 的 `20260502140000` 涵蓋；(2) 補一個 `20001` 檔會在 repo 再留一筆無正式規劃來源的中間態；(3) C-1 會把 placeholder `205338` 標回 applied，使「repo 有檔 ↔ DB 有版」恢復；Branching 順序問題屬 [`BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md`](BASELINE_SCHEMA_REPAIR_PLAN_2026-07.md)／歷史修復文件範圍，**不在本工單用「保留 20001 當正確順序載體」解決** |
| **審核需特別確認** | 若驗收方仍希望 **保留** `20001` 作為 Branching 用的「有完整 statements 的那一筆」，則改為：**保留 applied、改補 repo 檔**（內容自 DB `statements` 匯出）——與「以規劃檔名為準」原則衝突，須書面裁定 |

### B2 — `20260704024703`／`w10_fees_translator_readonly`

| 項目 | 內容 |
|---|---|
| **Repo** | **無**此檔名／版號 |
| **DB SQL** | 重建 `fees_visible`（非管理員 `client_info` 含 `'rateConfirmed', false` 等遮罩）＋ `fees_insert/update/delete` 改為 `is_admin`＋`current_env()` |
| **後續覆蓋** | 同日稍後有 `030404`／`032559` 與 repo `20260704020000`（最終稿：寫入僅 admin＋view 遮罩 `rateConfirmed`） |
| **現況 schema（唯讀驗證）** | `fees_visible` 定義仍遮罩 `rateConfirmed`（查詢 `masks_rate_confirmed_false = true`）；政策語意與 `020000` 檔一致 |
| **建議處置** | **`repair reverted`（不補檔）** |
| **依據** | 中間態 MCP／臨時套用；最終行為已由 **A6→repo `020000`** 表達。補檔只會製造死檔，且 `db push` 對齊不需要此版號 |

### B3 — `20260704032559`／`w10_fees_write_admin_only_and_view`

| 項目 | 內容 |
|---|---|
| **Repo** | **無**此版號；同名最終檔為 `20260704020000_…` |
| **DB SQL** | ≈2065 字元：重建三條 fees 寫入政策＋`fees_visible`（含 `rateConfirmed` 遮罩）——與 A6 的 `030404`（≈2426）同主題重複 |
| **與 `030404`／`020000`** | 三者目標狀態等價（idempotent DROP/CREATE）；現況 view／政策已是該終態 |
| **建議處置** | **`repair reverted`（不補檔）** |
| **依據** | 純粹「同名第三個時鐘戳」；對齊後只保留 repo `20260704020000`（經 A6：revert `030404` + applied `020000`）。若只 revert `32559` 而留下 `030404` 不改成 `020000`，`db push` 仍會因缺少 `020000`／多余時鐘而不乾淨 |

---

## 5. C 類

### C1 — `20260430205338_remote_history_placeholder.sql`

| 項目 | 內容 |
|---|---|
| **Repo** | 有；內容為註解＋`SELECT 1`（歷史對齊用，非真實 DDL） |
| **DB** | **無**此 version（2026-07-04 已改登成 `20001`，見上） |
| **建議處置** | **`migration repair --status applied`** |
| **依據** | 以 repo 為準補齊版號。Repair **不會**把 placeholder 的 `SELECT 1` 寫入 statements；Branching 重放若讀 statements 仍可能缺這一步的「真 DDL」——那是 baseline／Branching 工項，**本工單只保證 CLI `migration list`／`db push` 版號集合一致** |
| **副作用** | 與「保留 B1＝20001 做 Branching」互斥；本計畫預設 **revert B1＋applied C1** |

---

## 6. D 類 — `cat_file_assignments_self_insert`

| 側 | version | 名稱／內容 |
|---|---|---|
| DB | `20260429234626` | name=`cat_file_assignments_self_insert`；statements≈229（真政策 DDL） |
| Repo | `20260429234626` | 檔名=`*_remote_history_placeholder.sql`；內容=`SELECT 1` |
| DB | `20260430074500` | 同名；statements≈667（較完整註解＋政策） |
| Repo | `20260430074500` | 真檔 `*_cat_file_assignments_self_insert.sql` |

| 項目 | 內容 |
|---|---|
| **對 `db push` 版號集合** | 兩邊**都已有**這兩個 version → **非 list 缺口** |
| **建議處置（預設）** | **本輪不動**（不 repair、不删檔） |
| **依據** | 工單「消除重複列」若強制只留一筆：需同步改 repo（刪 placeholder）並 revert DB `29234626`。預設為**最小風險**：`push` 不依賴消重；內容／name 不一致記為**已知差異**（Branching 重放 `29234626` 時 DB statements 是真 DDL、repo 檔是 `SELECT 1`——屬 baseline 工項） |
| **可選方案 D-opt（需審核勾選）** | revert `20260429234626` ＋ delete repo placeholder 檔，只留 `74500`。優點：少一筆幽靈 placeholder；缺點：改动 repo 檔案集合，且歷史「第一次套用」列消失 |

---

## 7. 建議執行順序（審核通過後才動手）

### 7.0 凍結檢查（強制）

1. Slack／協作確認：無其他工項正在套 migration。
2. 本機：`supabase migration list` 與對照表再次 diff。
3. 連續兩次 `git status --porcelain`／`git branch --show-current`（間隔數秒）一致。
4. 再做一次 schema dump 基線（對齊前），路徑建議：`docs/MIGRATION_HISTORY_REALIGN_SCHEMA_DUMP_PRE_<日期>.sql`（或 pg_dump 等效；**勿**含業務資料大表全文若過大——至少 DDL）。

### 7.1 Repair 指令草案（版號集合；實際以審核勾選為準）

**先 reverted（僅刪歷史列，不還原 DDL）：**

```text
# A 類 DB 時鐘／分拆
20260703121703
20260703121719
20260703121737
20260703154440
20260703175926
20260704030404
20260714024357
20260714024418
20260714071002
20260714071532

# B 類
20260502120001
20260704024703
20260704032559
```

**再 applied（對齊 repo 檔名）：**

```text
# A 類規劃版號（DB 目前缺）
20260703120000
20260703120100
20260703120200
20260703140000
20260704010000
20260704020000

# C 類
20260430205338

# 下列已 applied，勿再動：
# 20260714120000 / 20260714130000 / 20260714140000
# 20260429234626 / 20260430074500（D 預設）
# 20260502140000
```

CLI 示例（審核後由執行代理跑；**現在不要跑**）：

```bash
supabase migration repair --status reverted <version>
supabase migration repair --status applied <version>
```

### 7.2 終驗

| # | 條件 |
|---|---|
| T1 | `supabase migration list`：Local 與 Remote version **完全一致** |
| T2 | `supabase db push --dry-run`：**無**待套用、無報錯 |
| T3 | 對齊前後 schema dump **diff 為空**（實際 schema 零變動） |
| T4 | 對齊後 `schema_migrations` 全量再存 docs（SNAPSHOT_POST） |
| T5 | 新增一支**無害** migration，走真實 `db push` 一次；**檔與歷史列保留**（勿再 reverted） |

---

## 8. 驗收標準（對齊工單）

1. `db push --dry-run` 乾淨。
2. `migration list` repo／remote 一致。
3. 正式庫實際 schema 零變動。
4. 對齊前後快照與本對照表皆在 docs。
5. 下一次真 migration 能直接 `db push`，不需先 repair。

---

## 9. 風險與回退

| 風險 | 緩解 |
|---|---|
| 誤把「從未等同套用」的 repo 檔標 applied | B 類已逐筆對現況；A 類皆為已知已套用之時鐘對映 |
| Repair 後 Branching 仍失敗 | 預期可能；屬 baseline 工項，本工單不承諾 Branching 綠燈 |
| 與 2026-07-04 的 `20001` 改版意圖衝突 | §4 B1／§5 C1 已標明互斥選項，須審核二選一 |
| 操作中途他人 push migration | §7.0 凍結窗口 |

**回退**：對任一 version 再 `repair` 反轉 status；必要時自 `_backup_20260430205338`／本計畫 PRE 快照人工還原列（優先用 CLI repair，避免手改表）。

---

## 10. 請驗收方確認的決策勾選

審核紀錄 2026-07-15：

- [x] **採納預設** ✓：A 全表（時鐘 reverted＋規劃 applied）＋ B1/B2/B3 全 reverted（不補檔）＋ C1 applied＋ D 不動
- [x] **B1 改案** ✗：不採（Branching statements 完整性歸 baseline）
- [x] **D-opt** ✗：不做（維持最小風險）
- [x] **凍結窗口時段** ✓：執行代理確認無他方動 migration 後連續做完
- [x] **授權動手** ✓：已核准並執行

---

## 11. 交付物

| 檔案 | 用途 |
|---|---|
| 本檔 | 執行計畫＋B 類依據＋執行紀錄 |
| [`MIGRATION_HISTORY_REALIGN_SNAPSHOT_PRE_2026-07-15.md`](MIGRATION_HISTORY_REALIGN_SNAPSHOT_PRE_2026-07-15.md) | 對齊前歷史表快照 |
| [`MIGRATION_HISTORY_REALIGN_SNAPSHOT_POST_2026-07-15.md`](MIGRATION_HISTORY_REALIGN_SNAPSHOT_POST_2026-07-15.md) | 對齊後快照＋終驗 |
| [`DEV_PIPELINE.md`](DEV_PIPELINE.md) | 防再發規則（第二階段） |
| `supabase/migrations/20260715120000_migration_history_realign_noop.sql` | T5 no-op（保留） |

---

## 12. 執行結果（2026-07-15）

- 正式庫 `schema_migrations` 對齊後 **135** 列，與 repo `supabase/migrations/*.sql` 一一對應；`db push` 正門恢復。
- **T1–T5 全過**（T5 依審核修正：`20260715120000_migration_history_realign_noop` **留檔不清理**）。
- 對齊後快照：[`MIGRATION_HISTORY_REALIGN_SNAPSHOT_POST_2026-07-15.md`](MIGRATION_HISTORY_REALIGN_SNAPSHOT_POST_2026-07-15.md)。
- CI live 哨兵首跑（token 就緒後 `workflow_dispatch`）：https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29387057114（`Finished supabase link.`＋`migration history synced`）。
- 計畫文件 PR [#44](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/44)；實作＋防再發 PR [#45](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/45)。
