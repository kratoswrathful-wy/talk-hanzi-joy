狀態：P0-D types 契約收尾推送中；等候唯一一次 GitHub PG17 workflow

# 第一關／P0-D 隔離驗收報告（更新 2026-09-04 types 收尾）

分支：`feat/isolation-replay-20260901`  
正式庫：**未修改**。  
PR #81：Draft／DO NOT MERGE。  
Micro／Preview：**未建立**。

---

## 0. Types 契約比較邊界（權威）

隔離驗證**只**比對：

```ts
Database["public"]
```

完整結構（Tables／Views／Functions／Enums／CompositeTypes；含 Row／Insert／Update 欄位與 RPC Args／Returns；含 optional／nullable）。

**不納入**本機 migration 契約比較：

| 排除項 | 理由 |
|---|---|
| `__InternalSupabase` | 產生器／平台 PostgREST 資訊，非 migration schema |
| `graphql_public` 等非 public schema | 產品未使用；非本次 public 契約 |
| 宣告／property **文字排列順序** | 以 TypeScript 結構相等判定，順序無關 |

實作：`scripts/lib/public-schema-types-contract.mjs`（`Equal<CheckedPublic, GeneratedPublic>`）＋ `scripts/check-public-schema-types-contract.mjs`。  
產生：`supabase gen types typescript --local --schema public`。  
**保留**目前 checked-in `types.ts`（含既有 `__InternalSupabase`）；不相等時不得放寬、不得整檔覆蓋。

Workflow 順序：Advisors → Quality gates（含契約自我測試）→ public schema types contract（避免格式差異遮蔽後段結果）。

---

## 1. 產品修正（既有）

| 項目 | 值 |
|---|---|
| Migration | `20260904004224_p0d_restore_admin_create_payload_validation.sql` |
| Commit | `28638c15` |
| 預期鏈 | **166／166**；max=`20260904004224` |

## 2. 測試裝配（既有）

| Commit | 說明 |
|---|---|
| `9a7f7ef9` | 失敗路徑查底層前 `RESET ROLE`；RPC 仍 `authenticated` |

## 3. 前次 workflow（`9a7f7ef9`）

[33829785715](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33829785715)：166／P0 SQL 11／競態／Data API／Playwright **PASS**；**FAIL** 於整檔 `diff` types（`__InternalSupabase`／`graphql_public`／函式排序）。Advisors／QG 因順序被跳過。

## 4. 本輪收尾（待 workflow）

定向：types 契約檢查器＋workflow 順序；**不**改 migration／RPC／RLS／production。

判定門檻（全過後）：  
`combined isolated verification passed / ready for controlled maintenance-window review`  
（仍非 merge／部署核准。）
