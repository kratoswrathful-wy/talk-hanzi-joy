狀態：P0-D 最終隔離 **未全綠停止**（2026-09-03 final2）；等待 Codex 決定下一步（不得再建第七次 Micro）

# 第一關／P0-D 隔離驗收報告（更新 2026-09-03 final2）

分支：`feat/isolation-replay-20260901` @ **`99ef5b0b`**  
正式庫 `wshsmerltcakffllgyul`：**未修改**。  
PR #81：維持 Draft／DO NOT MERGE。

---

## 1. 第五次 Micro（歷史；不含 P0-D）

| 項目 | 值 |
|---|---|
| ref | `enexnghinsnyzmezxphk`（已刪） |
| migration | **164/164**（加入 P0-D **以前**） |
| SQL | **10/10** |
| 雙 client 競態 | PASS |
| Data API | PASS |
| types | PASS |
| 說明 | 結果**不包含** `20260902054823` P0-D |

**不得**將第五次結果寫成「0/10 SQL、0 race」。

---

## 2. P0-D 第一次最終隔離 Micro（已刪；`4de7a195`）

| 項目 | 值 |
|---|---|
| 名稱 | `p0d-isolation-final-20260903` |
| ref | `ixdpldfbgetcrgxkmgjd`（已刪） |
| Git SHA | **`4de7a195`** |
| migration | **165／165** PASS |
| Advisors | 僅既有 2 ERROR（`cases_visible`／`fees_visible`） |
| P0 SQL | **8／11 FAIL**（測試裝配：authenticated 下讀 `cases`、T3 姓名-only、UNIQUE(env)） |
| 後續套件 | 未執行 |

詳見上一版敘事；已依核准修正三支 SQL 測試後進入 final2。

---

## 3. P0-D 最終隔離 Micro final2（本次；已刪除）

| 項目 | 值 |
|---|---|
| 名稱 | `p0d-isolation-final2-20260903` |
| ref | `knbnftjrsshfhfyqxlgo` |
| 建立 | 2026-09-03T13:00:13Z |
| 刪除 | 2026-09-03T13:17:14+08:00 對應 ≈13:17Z |
| Git SHA | **`99ef5b0b`**（`test(p0d): align three SQL suites with authenticated RPC role pattern`） |
| 預期／實際 migration | **165／165** 從零重放成功（含 P0-D） |
| Preview Branch | **未建立** |
| production | **未接觸** |
| 專案清單收尾 | 僅剩 `wshsmerltcakffllgyul` |
| 費用估算 | 存活 ≈17 分鐘；Micro Compute ≈ US$0.01 量級（硬頂 US$1 內） |
| CI（必要） | Migration sentinel success；CI typecheck／test／lint／encoding／forbidden-casts **success** @ `99ef5b0b` |

### 3.1 已通過

| 步驟 | 結果 |
|---|---|
| 165/165 migration replay | **PASS**（含 `20260902054823`） |
| Advisors security ERROR | **僅 2**：`security_definer_view` ×2（`cases_visible`、`fees_visible` 既有核准例外）；無新 ERROR |
| `p0_pm_assign_participants_check.sql` | **PASS**（先前 authenticated 讀 `cases` 裝配已修） |
| `p0_case_field_acl_check.sql` | **PASS**（UNIQUE(env) 交易內暫降索引裝配已修） |
| 其餘 8 支既有通過項 | **PASS**（見下表） |

### 3.2 未通過（阻擋）— P0 SQL **10／11**

| 檔名 | 結果 | 根因分類 |
|---|---|---|
| `p0_admin_create_case_check.sql` | **FAIL** | **測試裝配錯誤**（非產品／migration 真錯誤） |
| 其餘 10 支 | **PASS** | — |

**失敗細節（唯讀診斷；未在 Micro 上修 DB 後重跑）**

| 欄位 | 值 |
|---|---|
| 測試檔 | `supabase/tests/p0_admin_create_case_check.sql` |
| 斷言列 | ≈287–288（T5） |
| 實際執行角色 | 測試以 postgres／管理身分直接呼叫 `public.admin_create_case`（本段非 JWT＋`authenticated` 路徑）；錯誤碼來自 P0-D 驗證 helper |
| SQLSTATE | `P0001`（`raise exception`） |
| CLI | `LegacyDbQueryUnexpectedStatusError`／HTTP 400 |
| 預期錯誤字串 | `unknown_create_key`（P0-C 舊名，見 `20260901120000`） |
| 實際 RPC 回傳 | `{"ok": false, "error": "unknown_payload_key"}` |
| 產品契約來源 | `20260902054823_p0d_pm_assign_participants_sync.sql`：`private.p0_admin_create_validate_payload` 回傳 **`unknown_payload_key`**／**`forbidden_payload_key`** |
| 同檔尚未跑到但明顯過期的斷言 | T6a／T6b 仍期望 `forbidden_create_key`（P0-D 已改為 `forbidden_payload_key`） |
| 先前已修且本輪確認通過 | T3 可信 UUID 復原、T3b 姓名-only 負向 |

通過的 10 支：

1. `p0_pm_assign_participants_check.sql`
2. `p0_apply_case_update_admin_only_check.sql`
3. `p0_case_credentials_acl_check.sql`
4. `p0_case_field_acl_check.sql`
5. `p0_case_mutation_acl_check.sql`
6. `p0_cat_workflow_acl_check.sql`
7. `p0_definer_view_contract_check.sql`
8. `p0_slack_edge_only_contract_check.sql`
9. `p0b_acl_harden_check.sql`
10. `p0c_translator_eligibility_check.sql`

### 3.3 未執行（因 SQL 組失敗依規則停止）

- 雙 client 競態（`dual-client-collab-race.mjs`）
- Data API／definer view（`micro3-definer-view-api-check.mjs`）
- 隔離環境案件指派 RPC 冒煙
- types 暫存重生與 repo 比對
- 必要 typecheck／指派相關 Vitest（本輪未另跑；CI 已於 push 時通過）

**未**在失敗的 Micro 上修 DB／改錯誤碼後宣稱從零全綠。  
**未**建立第七次 Micro。

---

## 4. 問題分類（供 Codex）

| # | 類型 | 判定 |
|---|---|---|
| 1 | 產品／migration 真錯誤 | **否** — 未知鍵拒絕行為正確，僅錯誤碼命名已由 P0-D 統一為 `*_payload_key` |
| 2 | 測試裝配錯誤 | **是** — `p0_admin_create_case_check.sql` T5／T6 仍斷言 P0-C 舊字串 `unknown_create_key`／`forbidden_create_key`；T3 修通後才暴露 |
| 3 | 平台或環境錯誤 | **否** — 165/165、Advisors、其餘 10 SQL 正常 |

建議最小後續（**待 Codex 核准**；本代理停止）：

1. 僅改 `p0_admin_create_case_check.sql`：T5→`unknown_payload_key`；T6→`forbidden_payload_key`。
2. 不得為配合測試改回 migration／RPC 錯誤碼。
3. 是否允許「再一次」隔離 Micro（本輪已用掉核准的唯一一次 final2）由 Codex 決定。

---

## 5. Playwright

| Run | 結果 |
|---|---|
| [33632836928](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33632836928) @ `daf31a58` | **success** — P2-L7 結案為非 P0-D 阻擋 |
| `99ef5b0b` E2E | 非本輪擋關；未因 SQL 測試修正主動重跑 |

---

## 6. 部署判定

**not deployable** — P0-D 定性**尚未**達到  
`isolated verification passed / ready for controlled maintenance-window review`。

未 merge、未部署、未操作正式資料、未開始維護窗口。  
停止等待 Codex。
