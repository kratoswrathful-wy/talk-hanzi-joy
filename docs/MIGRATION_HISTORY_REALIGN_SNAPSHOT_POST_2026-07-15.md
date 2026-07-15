狀態：已完成（2026-07-15）

# Migration 歷史對齊——對齊後快照（唯讀）

- **日期**：2026-07-15（臺灣）
- **專案**：`wshsmerltcakffllgyul`
- **對應計畫**：[`MIGRATION_HISTORY_REALIGN_PLAN_2026-07.md`](MIGRATION_HISTORY_REALIGN_PLAN_2026-07.md)
- **執行方式**：歷史表以 MCP `execute_sql` 事務完成（等價 `migration repair`：A 類 `UPDATE version`、B/C 為 DELETE／INSERT）；T5 以真實 `supabase db push` 套用 no-op
- **T5**：`20260715120000_migration_history_realign_noop`——**保留**於 repo 與歷史表（不 cleanup）

## Schema 指紋（對齊前後相同＝實際 schema 零變動）

| 指標 | 對齊前 | 對齊後（含 T5 no-op） |
|---|---|---|
| `catalog_fingerprint` | `22f2c05b0f608fdb2608d8ce108116e6` | `22f2c05b0f608fdb2608d8ce108116e6` |
| `public_fn_count` | 30 | 30 |
| `fees_visible_md5` | `afc38445ff0cd5b7bb889338f6af1626` | `afc38445ff0cd5b7bb889338f6af1626` |

## 終驗

| 項 | 結果 |
|---|---|
| T1 `migration list` Local＝Remote | 通過（CLI＋腳本 `--live`） |
| T2 `db push --dry-run` | 通過（`Remote database is up to date`） |
| T3 schema 指紋 | 通過（上表） |
| T4 本快照 | 本檔 |
| T5 真實 `db push` no-op 且留檔 | 通過；版號 `20260715120000` |

## 歷史表列數

- 對齊前：144（見 PRE 快照）
- 對齊後（含 T5）：135（與 repo `supabase/migrations/*.sql` 數量一致）

## 已知差異（不影響 db push；D 不動）

- `20260429234626`：DB `statements` 為真政策 DDL，repo 檔為 placeholder `SELECT 1`（內容／名稱不一致；Branching 屬 baseline 工單）

## 遠端 version 清單（對齊後）

```
20260305092158 …（早於 20260429 與 PRE 相同，略）
20260429234626
20260430074500
20260430120000
20260430205338   ← C1 applied
20260501140000
…（無 20260502120001）
20260502140000
…
20260703120000   ← 原 121703
20260703120100   ← 原 121719
20260703120200   ← 原 121737
20260703140000   ← 原 154440
20260704010000   ← 原 175926
20260704020000   ← 原 030404（無 024703／032559）
20260704180000
20260714120000
20260714130000
20260714140000
20260715120000   ← T5 noop
```
