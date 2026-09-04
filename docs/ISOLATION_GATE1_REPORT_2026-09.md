狀態：combined isolated verification passed / ready for controlled maintenance-window review

# 第一關／P0-D 隔離驗收報告（更新 2026-09-04 收尾全綠）

分支：`feat/isolation-replay-20260901` @ **`28f80509`**  
正式庫：**未修改**（全程未操作 production）。  
PR #81：Draft／DO NOT MERGE。  
Micro／Preview：**未建立**。

**最終定性：** `combined isolated verification passed / ready for controlled maintenance-window review`  
（可進入正式維護窗口**審核**；**不**代表已核准 merge 或 production 部署。）

---

## 0. Types 契約比較邊界（權威）

隔離驗證**只**比對 `Database["public"]` 完整結構（Tables／Views／Functions／Enums／CompositeTypes；Row／Insert／Update；RPC Args／Returns；optional／nullable）。

**不納入：** `__InternalSupabase`、`graphql_public` 等非 public schema、宣告文字排列順序。

| 項目 | 值 |
|---|---|
| 檢查器 | `scripts/lib/public-schema-types-contract.mjs` |
| CLI | `scripts/check-public-schema-types-contract.mjs` |
| 方法 | 雙檔寫入完整 types → `export type __P0PublicContract = Database["public"]` → TypeScript `Equal<A,B>`（雙向結構相等） |
| 產生 | `supabase gen types typescript --local --schema public` |
| checked-in types | **保留**（含既有 `__InternalSupabase`；未加入未使用的 `graphql_public`） |
| 自我測試 | `node --test scripts/check-public-schema-types-contract.test.mjs`（7/7） |

Workflow 順序：Advisors → Quality gates（含自我測試）→ public schema types contract。

---

## 1. 產品修正

| 項目 | 值 |
|---|---|
| Migration | `20260904004224_p0d_restore_admin_create_payload_validation.sql` |
| Commit | `28638c15` |
| 鏈 | **166／166**；max=`20260904004224` |

## 2. 測試／CI 收尾 commits

| Commit | 說明 |
|---|---|
| `9a7f7ef9` | 失敗路徑查底層前 `RESET ROLE` |
| `28f80509` | public schema types 契約檢查＋workflow 順序 |

## 3. 收尾 workflow（唯一）

| Run | 結果 |
|---|---|
| [33848719517](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33848719517) @ `28f80509` | **success** |

| 階段 | 結果 |
|---|---|
| 166/166 migration | PASS |
| P0 SQL 11/11 | PASS（含 `p0_admin_create_case_check`） |
| 雙 client 競態 | PASS |
| Data API／definer | PASS |
| Playwright 冒煙 | PASS（4） |
| Advisors | PASS（僅既定 `cases_visible`／`fees_visible` 兩 ERROR） |
| Quality gates | PASS |
| public schema types contract | PASS |

## 4. 部署判定

可進入 **controlled maintenance-window review**。  
**禁止**在未另核准下 merge／部署／操作 production。
