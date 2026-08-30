# P0-A Preview Branch 隔離驗證報告（2026-08-30）
狀態：已落地待驗收（本機；unverified for production deploy；not deployable）

**明確聲明：P0-A 測試通過 ≠ 整個漏洞已修復；舊寫入面仍須 P0-B 關閉。未 push／未開 PR／未部署。**

## 1. Branch 建立／切換／刪除時間軸

| 時間（UTC） | 事件 |
|---|---|
| 2026-08-30T14:26:52Z | 建立 `p0a-verify-20260830` → ref `tercfkwvwxtlsbczwbue`，`with_data=false` |
| 同日 | 診斷：migration 重放卡在 `20260610140000`（缺 `cat_stage_assignments`；已知問題見 `docs/MIGRATION_HISTORY_REPAIR_2026-07-04.md`） |
| 同日 | reset 後仍卡在 max `20260610120000`（103／149） |
| 同日 | **刪除** `p0a-verify-20260830`（避免對不完整 schema 硬跑） |
| 改用 | 既有 `p0a-security-20260827` → ref **`zbjuymveersziptdmtfu`**（schema 對齊 production 149／`20260825120952`，`with_data=false`，僅殘餘合成 `[AI驗收]` 列） |
| 驗證後 | 刪除 `p0a-security-20260827`（見文末） |

Production ref（禁止目標）：`wshsmerltcakffllgyul`

## 2. 服務版本（preview `zbjuymveersziptdmtfu`）

| 元件 | 版本／狀態 |
|---|---|
| PostgreSQL | 17.6 |
| Branch status | FUNCTIONS_DEPLOYED／ACTIVE_HEALTHY |
| Include production data | **false** |
| Auth／PostgREST | 與 branch 服務一併 healthy（未另記精確 build 字串） |

## 3. Migration 結果

| 項目 | 結果 |
|---|---|
| 新 branch 套用五支 R1 `20260830122*` | **未完成**（baseline 重放失敗，已刪除） |
| 改用 preview 既有 P0-A 物件 | 已存在（RPC／tables／revision）；與 R1 契約以 SQL ACL 驗證 |
| Production migration／schema | **未變更**（唯讀確認：無 `case_participants`、無 `accept_public_inquiry_case`、無 `cases.revision`） |

## 4. SQL ACL 測試（preview only）

清理：`[AI驗收]` cases 3→0；participants 2→0；audit 4→0。

| 測試 | 結果 |
|---|---|
| `p0_case_mutation_acl_check.sql` | **PASS** |
| `p0_case_field_acl_check.sql` | **PASS** |
| `p0_case_credentials_acl_check.sql` | **PASS** |
| Extra A2（unresolved 不產生 participant） | **PASS** |

## 5. Advisors（preview）

- Security：**66**（ERROR 2／WARN 62／INFO 2）
  - ERROR：`cases_visible`、`fees_visible` 標 `security_definer_view` — **刻意設計**（遮罩＋撤銷基表 SELECT；`security_invoker=false`），不得忽略但非「意外洩漏」誤報可直接關掉。
  - WARN：多個 SECURITY DEFINER 對 authenticated／anon 的 EXECUTE 提示；P0 RPC 對 authenticated 為預期，函式內仍驗證 `auth.uid()`／env／participant。
- Performance：**172**（多為 multiple_permissive_policies 等既有項）

## 6. TypeScript types

- 自 preview 產生並寫入 `src/integrations/supabase/types.ts`
- 已移除 `p0a-rpc-types.stub.ts`
- 含 `accept_public_inquiry_case`／`get_case_credentials`／`update_case_permitted_fields` 等
- diff：相對 `724eb886` 為 preview schema＋P0-A 函式／`cases.revision` 等（完整 diff 見本機 git；**勿提交含秘密**）

## 7. 本機品質閘門（types 更新後）

| 閘門 | 結果 |
|---|---|
| typecheck | 通過 |
| Vitest（R1-A＋PR#80 Auth／Bridge） | 46 passed |
| lint | 0 errors（既有 warnings） |
| encoding | 通過 |
| forbidden-casts | 通過 |
| build | 通過 |

## 8. Playwright P0-A smoke

**未執行。** 原因：
1. Branch credentials 載入本機 shell 被安全閘阻擋；依指示不得寫入 `.env`／文件／log。
2. 正式站／預設 Playwright 指向 production Auth／API；在未核准臨時憑證注入前，無法安全斷言 preview `auth.uid`／ref。

標示：**未驗證**（不得宣稱通過）。

## 9. 費用估算

| 項目 | 值 |
|---|---|
| 費率 | $0.01344／branch／小時 |
| `p0a-verify-20260830` | 約 0.5–1 小時 → ≈ $0.01 |
| `p0a-security-20260827` | 自 2026-08-28 起至刪除時持續計費（既有殘留）；本次驗證使用後應刪除以停止加價 |
| 本次新增預估 | 以短生命週期新 branch 計 **<$0.05**；若舊 branch 長期未刪，累計另計 |

## 10. 未解決／失敗項目

1. **全新 Preview Branch 無法重放到 production schema**（卡在 `20260610140000`）— 專案級 migration history 缺口。
2. Playwright preview smoke **未跑**。
3. Advisors ERROR on definer views — 需產品／安全覆核是否接受現況並在文件標註。
4. P0-B 尚未開始；**不得**因本報告宣稱漏洞關閉。
