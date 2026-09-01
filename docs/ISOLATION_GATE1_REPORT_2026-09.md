狀態：已落地待驗收（本機 checkpoint）；**整體仍 not deployable**

# 第一關隔離驗收報告（2026-09-01）

分支：`feat/isolation-replay-20260901`（worktree `C:\Homemade Apps\1UP-TMS-isolation-20260901`）  
正式庫 `wshsmerltcakffllgyul`：**未修改**（刪除臨時專案後僅剩此專案）。

---

## 1. 臨時專案生命週期（歷史）

| 次序 | 專案 ref | 結果 | 處置 |
|---|---|---|---|
| **1** | `qxqhixmzhzudakxvlfbv` | 159/160；COMMENT 語法錯 | 已刪除 |
| **2** | `hkumqnbuxsvscnmwlnpj` | 160/160 重放；補丁後驗收 | 已刪除 |

**重要**：生命週期 2 後追加的 201–205 補丁**已整併**；**不得再宣稱 165 支為最終鏈**。現行候選：**162 支**。

---

## 2. 本 checkpoint 變更（第三次 Micro 前）

| 項目 | 內容 |
|---|---|
| `admin_create_case` | 固定 allowlist + 明列 INSERT；拒絕 unknown/forbidden；`internal_error` 不洩漏 SQLERRM |
| Migration 整併 | 刪 202–205；保留 201 + 新增 202 privileged hardening |
| 測試 | `p0_admin_create_case_check.sql`、`p0_definer_view_contract_check.sql` |
| 競態 | `scripts/dual-client-collab-race.mjs`（第三次 Micro 執行） |
| WARN 分類 | [`PRIVILEGED_FUNCTIONS_WARN_CLASSIFICATION_2026-09.md`](PRIVILEGED_FUNCTIONS_WARN_CLASSIFICATION_2026-09.md) |

---

## 3. 最終 migration 鏈

| 項目 | 值 |
|---|---|
| 總數 | **162** |
| 最高版號 | `20260901120200_p0c_privileged_function_hardening.sql` |
| 從零重放 | **待第三次 Micro** |

---

## 4. SQL ACL 測試

| 測試檔 | 本機 | 第三次 Micro |
|---|---|---|
| `p0_admin_create_case_check.sql` | 已備 | 必跑 |
| `p0_definer_view_contract_check.sql` | 已備 | 必跑 |
| 其餘 P0-A/B/C | 生命週期 2 已跑 | 必重跑 |

---

## 5. Advisors

| 等級 | 數量 | 備註 |
|---|---:|---|
| ERROR | **2** | `cases_visible`、`fees_visible` → **P0-V 接受受控例外** |
| WARN | **~60** | 見 WARN 分類文件；20200 已處 P0 revoke/search_path |
| INFO | **2** | Slack Edge-only |

**helper EXECUTE 修正**：`authenticated` **有** barrier helper EXECUTE、**無** `private` schema USAGE（非「僅內部 EXECUTE」）。

---

## 6. 本機閘門（checkpoint）

| 關卡 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `npm run test` | 475 通過 |
| `npm run lint` | 0 error |
| `npm run check:encoding` | 通過 |
| `npm run check:forbidden-casts` | 通過 |
| `npm run build` | 通過 |

---

## 7. 部署判定

**not deployable**

1. 162 支 **未**在單次從零重放中驗證（第三次 Micro **已核准、尚未建立**）。  
2. GitHub 第二關 **未執行**（全綠後僅提交計畫）。  
3. 正式庫 **未套用** P0 鏈。

### 剩餘 P0

| ID | 項目 |
|---|---|
| P0-R | 162 支 migration 從零乾淨重放（第三次 Micro） |
| P0-T | 真正雙 client 競態 |
| P0-V | definer view 契約測試通過後標「接受受控例外」 |

---

## 8. 相關 worktree

| worktree | 分支 | 備註 |
|---|---|---|
| `1UP-TMS-isolation-20260901` | `feat/isolation-replay-20260901` | **權威整合線** |
| `1UP-TMS-p0b-20260830` | `feat/p0b-security-20260830` | 未提交檔**勿動** |

**未 push、未開 PR、未部署。**
