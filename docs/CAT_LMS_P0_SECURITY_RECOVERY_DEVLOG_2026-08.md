# P0-A 救援重建紀錄（recovery / 2026-08-30）
狀態：實作中（本機 checkpoint；unverified；not deployable）

## 基準

| 項目 | 值 |
|---|---|
| 分支 | `recovery/p0a-20260830` |
| worktree | `C:\Homemade Apps\1UP-TMS-p0a-20260828` |
| 基準 commit | **`724eb886`**（`origin/main`／已部署 PR #80 Auth merge） |
| 禁止 | push／PR／部署／任何正式 DB 操作 |

## 遺失事件

2026-08-30：`1UP-TMS-p0a-20260828` 上未提交的 8/28 P0-A 草稿因 Cursor Discard（`reset: moving to HEAD`）全丟。Cursor checkpoint／Local History／資源回收筒無法還原。精確檔名 `202608280905*` migration 與當日 preflight 僅能從對話 transcript 重建。

## 舊稿來源（唯讀）

| 來源 | 用途 | 限制 |
|---|---|---|
| `C:\Homemade Apps\1UP-TMS-p0a`（`feat/p0a-security`） | R1-A 獨立模組參考；頁面／store **區塊**參考 | **永久唯讀**；不得修改／commit／stash／reset／clean／切分支 |
| 同樹 `20260827*` migrations | **不可採用 A2**（會 `INSERT case_participants`） | 僅對照差異 |
| 對話 transcript `68f03dd6-…` | 還原 8/28 preflight／五支 migration 正文 | 非正式 git 物件 |

舊文件 `docs/CAT_LMS_P0_SECURITY_DEVLOG_2026-08.md` 僅作敘事參考；本檔以 `724eb886` 為準。

## 逐檔重建摘要

見：

- `docs/P0A_RECOVERY_R1A_SOURCE_MATRIX_2026-08.md`
- `docs/P0A_RECOVERY_R1B_SOURCE_MATRIX_2026-08.md`
- `docs/P0A_RECOVERY_R1D_MIGRATION_AUDIT_2026-08.md`

## Recovery commits（本機）

1. `f069c9f7` — R1-A independent modules
2. `e0c5a114` — R1-B case store／pages
3. `3895c5cb` — R1-C preflight／gitignore
4. `4841730b` — R1-D migration drafts
5. `24b966cc` — R1-E ACL 測試草稿／stub／recovery DEVLOG＋品質閘門本機通過項

## 本機品質閘門（2026-08-30）

| 閘門 | 結果 |
|---|---|
| typecheck | 通過 |
| Vitest（R1-A＋PR#80 Auth／Bridge） | 46 passed |
| preflight mock（node:test） | 2 passed |
| lint | 通過（0 errors；既有 warnings） |
| encoding | 通過 |
| forbidden-casts | 通過 |
| build | 通過 |
| SQL ACL／advisors／Playwright DB | **未驗證**（無隔離庫） |

## 尚未 DB 驗證

- 五支 migration **未** `db push`／未套用任何庫
- `supabase/tests/p0_case_*_acl_check.sql`：**未執行**（需隔離庫）
- Advisors：**未執行**
- Playwright `smoke-cases-translator-update-rpc`：預設 skip；需隔離庫 + `PLAYWRIGHT_P0A_CASE_RPC_SMOKE=1`
- `src/integrations/supabase/types.ts`：未整檔重生；僅 `p0a-rpc-types.stub.ts` 暫時標記

## 部署邊界（強制）

**P0-A 不可單獨部署。** 必須與 **P0-B**（收緊／撤除過渡 `apply_case_update` 一般路徑等）合併為同一部署候選後，才可考慮正式庫與正式站。本分支所有 commit 訊息均含 `unverified`／`not deployable`。
