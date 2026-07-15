狀態：已落地待驗收

# DEV 管線：正式庫 Migration 必走 `db push`

本文件與 [`AGENTS.md`](../AGENTS.md)「Supabase 與資料庫操作」、[`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) 互補；**以本檔為 migration 節奏的單一規格**。

對齊工程主計畫：[`MIGRATION_HISTORY_REALIGN_PLAN_2026-07.md`](MIGRATION_HISTORY_REALIGN_PLAN_2026-07.md)。

---

## 強制規則

1. **正式庫（production）結構變更一律走 `supabase db push`。**
   - 先在 repo 新增／修改 `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`。
   - 本機 `supabase link` 後：`supabase db push --dry-run` → `supabase db push`。
   - 同一 PR／同一工項內，**migration 檔必須與遠端歷史一併到達一致狀態**（架構規則「一工項一分支／DB 與版控不得脫鉤」）。

2. **MCP `apply_migration`／Dashboard SQL Editor 直套僅限緊急狀況。**
   - 定義：服務中斷、資料損壞、無法等待 CLI／PR 合併的生產修復。
   - **當場必須完成兩件事，缺一不可：**
     1. `supabase migration repair --status applied <version>`（或等價寫入 `schema_migrations`，**版號必須等於**步驟 2 的檔名時間戳）
     2. **在 repo 補上對應 migration 檔案**，檔名時間戳與 repair 版號**完全一致**，內容為已套用之 SQL（或冪等重寫）
   - **禁止**只 repair、或 repair 用時鐘版號／repo 用規劃版號各記各的。
   - **禁止**只補檔卻把遠端標成另一個 version。

3. **凍結窗口**：多人／多代理並行時，同一時段只允許一方對正式庫做 migration／repair（見架構規則 §10）。

4. **哨兵**：CI／排程執行 `scripts/check-migration-history.mjs`（見下）。漂移即回報並停止繼續堆新 migration，直到對齊。

---

## 反面案例（本次漂移成因）

| 情境 | 做錯了什麼 | 結果 |
|---|---|---|
| 工項一（WF sync 防降級）、工項二（meta_items）等 | 正式庫用 MCP 直套，再 `repair` 補規劃版號；遠端同時留下**實際套用時鐘**版號 | 同一邏輯雙重記錄；`db push` 全量被擋 |
| W5／W10 批次 | MCP／實際套用時間戳 vs repo `120000` 等規劃檔名並存；另有中間態 `w10_fees_translator_readonly` 僅存遠端 | B 類「DB 有、repo 無」 |
| 「只 repair 不補檔」 | 遠端有列、git 無對應 `.sql` | `migration list` 永久不一致；Branching／同事 `db push` 失敗 |

修正後约定：**repo 檔名是唯一事實來源**；歷史表必須與之對齊。Branching 的 statements 完整性另屬 baseline 工單。

---

## 本機／代理檢查清單

```bash
npx supabase link --project-ref wshsmerltcakffllgyul
npx supabase migration list --linked    # Local／Remote 應一一對齊
npx supabase db push --dry-run          # 應顯示 up to date（或僅列本次新檔）
node scripts/check-migration-history.mjs --live
```

---

## CI 哨兵（擋關建議）

| 檢查 | 擋關？ | 說明 |
|---|---|---|
| Fixture 模擬（含「只 repair 不補檔」） | **是**（納入 `npm run test`） | 不需 secrets；防止回歸邏輯被改壞 |
| Live：`--live` 對正式庫 | **先否（非擋關）＋每日 schedule** | 需 `SUPABASE_ACCESS_TOKEN`；缺密鑰或 login-role 瞬斷不應擋一般 PR。穩定兩週且 secrets 齊備後，可升為 required check（尤對 `supabase/migrations/**` 路徑） |

Workflow：`.github/workflows/migration-history.yml`
