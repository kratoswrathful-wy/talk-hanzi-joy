# P0-A Preview Branch 隔離驗證報告（2026-08-30）
狀態：**partially verified / not deployable**

**明確聲明（2026-08-30 定性修正）：**

- 本次僅完成「**既有舊 Preview 物件**的**部分行為驗證**」。
- Repo 內五支 **`20260830122*`** recovery migration **尚未**在乾淨環境從零套用。
- 三支 SQL ACL **PASS 不證明** recovery migration 可重建相同物件。
- `e4377e59` 的 `types.ts` 來自舊 `p0a-security-20260827`，僅 **provisional**；正式型別須在 P0-A＋P0-B migration 乾淨重放後重生。
- Advisors 結果同樣來自舊 Preview。
- `cases_visible`／`fees_visible` 的 `security_definer_view` **ERROR 仍為未決安全例外**，**不得**標示為已接受。
- P0-A 整體：**partially verified / not deployable**。P0-A 通過 ≠ 漏洞已修復；舊寫入面須 P0-B。
- Preview Playwright：原則核准，因 Preview 已刪除 → **暫不執行**。
- 未 push／未開 PR／未部署。

## 1. Branch 建立／切換／刪除時間軸

| 時間（UTC） | 事件 |
|---|---|
| 2026-08-30T14:26:52Z | 建立 `p0a-verify-20260830` → ref `tercfkwvwxtlsbczwbue`，`with_data=false` |
| 同日 | 診斷：migration 重放卡在 `20260610140000`（缺 `cat_stage_assignments`；已知問題見 `docs/MIGRATION_HISTORY_REPAIR_2026-07-04.md`） |
| 同日 | reset 後仍卡在 max `20260610120000`（103／149） |
| 同日 | **刪除** `p0a-verify-20260830`（避免對不完整 schema 硬跑） |
| 改用 | 既有 `p0a-security-20260827` → ref **`zbjuymveersziptdmtfu`**（schema 對齊 production 149／`20260825120952`，`with_data=false`，僅殘餘合成 `[AI驗收]` 列） |
| 驗證後 | **已刪除** `p0a-security-20260827`；`list_branches` 僅剩 main；舊 endpoint 回 410／DNS 失效 |

Production ref（禁止目標）：`wshsmerltcakffllgyul`

## 2. 服務版本（當時 preview `zbjuymveersziptdmtfu`；已刪）

| 元件 | 版本／狀態 |
|---|---|
| PostgreSQL | 17.6 |
| Branch status | FUNCTIONS_DEPLOYED／ACTIVE_HEALTHY（當時） |
| Include production data | **false** |

## 3. Migration 結果

| 項目 | 結果 |
|---|---|
| 新 branch 套用五支 R1 `20260830122*` | **未完成**（baseline 重放失敗，已刪除） |
| 改用 preview **既有** P0-A 物件 | 僅能驗證當時庫上物件行為；**≠** recovery 檔可重建 |
| Production migration／schema | **未變更**（唯讀確認：無 `case_participants`、無 `accept_public_inquiry_case`、無 `cases.revision`） |

## 4. SQL ACL 測試（舊 preview 物件 only）

清理：`[AI驗收]` cases 3→0；participants 2→0；audit 4→0。

| 測試 | 結果 | 詮釋 |
|---|---|---|
| `p0_case_mutation_acl_check.sql` | PASS（舊物件） | **不證明** `20260830122*` 重放結果 |
| `p0_case_field_acl_check.sql` | PASS（舊物件） | 同上 |
| `p0_case_credentials_acl_check.sql` | PASS（舊物件） | 同上 |
| Extra A2 | PASS（舊物件） | 同上 |

## 5. Advisors（舊 Preview；provisional）

- Security：**66**（ERROR 2／WARN 62／INFO 2）
  - ERROR：`cases_visible`、`fees_visible` → `security_definer_view`
  - **未決**：不得標「已接受」；須威脅模型＋旁路測試後，清零或**逐項正式核准例外**
- Performance：**172**
- 來源僅舊 Preview；**非** recovery migration 乾淨環境結果

## 6. TypeScript types

- `e4377e59` 自舊 Preview 寫入 `types.ts` → **provisional only**
- 已移除 stub；**正式型別必須在 P0-A＋P0-B 乾淨重放後重生**

## 7. 本機品質閘門（程式層）

| 閘門 | 結果 |
|---|---|
| typecheck／Vitest／lint／encoding／casts／build | 通過（程式層） |
| Recovery migration 乾淨重放 | **未執行** |

## 8. Playwright P0-A smoke

**暫不執行**（Preview 已刪；原則已核准，待新隔離環境）。

## 9. 費用估算

| 項目 | 值 |
|---|---|
| 費率 | $0.01344／branch／小時 |
| `p0a-verify-20260830` | 約 0.5–1 小時 → ≈ $0.01 |
| `p0a-security-20260827` | 自 2026-08-28 至刪除前；**已刪除** |

## 10. 未解決項目

1. 全新 Preview 無法重放（baseline gap）→ **獨立工項**，不得混入 P0-A／P0-B。
2. Recovery `20260830122*` 乾淨重放＋對該結果重跑 SQL／advisors／types／Playwright。
3. `cases_visible` definer **未決**。
4. P0-B 關閉舊寫入面後，才可能進入部署候選檢核。
