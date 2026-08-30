# P0-A 救援重建紀錄（recovery / 2026-08-30）
狀態：partially verified / not deployable（本機 checkpoint；不可部署）

## 驗證定性（強制，2026-08-30 修正）

| 聲明 | 說明 |
|---|---|
| **僅完成** | 對**既有舊 Preview**（`p0a-security-20260827`／已刪除）上**既有 P0-A 物件**的**部分行為驗證** |
| **未完成** | 本 repo 五支 `20260830122*` recovery migration **尚未**在乾淨環境從零套用 |
| SQL ACL 三支通過 | **不證明** recovery migration 可重建出相同物件 |
| `e4377e59` types | 來自舊 Preview，僅 **provisional**；正式型別必須在**目前 P0-A＋P0-B migration 乾淨重放後**重新產生 |
| Advisors | 同樣來自舊 Preview，**不得**當成 recovery migration 的驗證結果 |
| `cases_visible` `security_definer_view` ERROR | **未決安全例外**，**不得**標示為已接受／已核准 |
| 整體狀態 | **`partially verified / not deployable`** |
| Playwright | Preview 已刪；原則核准但**暫不執行** |

## 基準

| 項目 | 值 |
|---|---|
| 分支 | `recovery/p0a-20260830` |
| worktree | `C:\Homemade Apps\1UP-TMS-p0a-20260828` |
| 基準 commit | **`724eb886`**（`origin/main`／已部署 PR #80 Auth merge） |
| 本文件 checkpoint 時 HEAD | **`7b5eaa2e`**（其後另有定性修正 commit） |
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
- `docs/P0A_PREVIEW_BRANCH_VERIFY_REPORT_2026-08.md`（定性見該檔；**partially verified**）

## Recovery commits（本機）

1. `f069c9f7` — R1-A independent modules
2. `e0c5a114` — R1-B case store／pages
3. `3895c5cb` — R1-C preflight／gitignore
4. `4841730b` — R1-D migration drafts
5. `24b966cc` — R1-E ACL 測試草稿／stub／recovery DEVLOG＋品質閘門本機通過項
6. `1e3d94b4` — DEVLOG 補 hash
7. `e4377e59` — provisional types（舊 Preview）＋verify report
8. `7b5eaa2e` — 註記 Preview 已刪

## 本機品質閘門（程式層，2026-08-30）

| 閘門 | 結果 |
|---|---|
| typecheck | 通過 |
| Vitest（R1-A＋PR#80 Auth／Bridge） | 46 passed |
| preflight mock（node:test） | 2 passed |
| lint | 通過（0 errors；既有 warnings） |
| encoding | 通過 |
| forbidden-casts | 通過 |
| build | 通過 |
| Recovery `20260830122*` 乾淨重放 | **未執行** |
| SQL ACL 對 recovery migration | **未證明**（僅對舊 Preview 物件） |
| Advisors（recovery／乾淨環境） | **未執行** |
| Playwright | **暫不執行**（Preview 已刪） |

## 部署邊界（強制）

**P0-A 不可單獨部署**，且目前僅 **partially verified**。必須與 **P0-B** 合併，並在**全新隔離環境**完成：migration 乾淨重放、SQL ACL、advisors／definer 威脅模型、types 重生、Preview Playwright、舊寫入面關閉——才可能成為部署候選。Baseline schema repair **不得**混入此部署包。
