# R1-D migration 靜態審核（recovery/p0a-20260830）
狀態：partially verified / not deployable（靜態審核；乾淨重放未執行）

## 環境

| 項目 | 值 |
|---|---|
| Supabase CLI | 2.116.0 |
| 建立方式 | `npx supabase migration new <name>`（五支空檔後填入 8/28 契約正文） |
| 禁止重用檔名 | 未使用 `202608280905*`／`20260827154*` |
| 正式 DB | **未套用** |

## CLI 新檔名（順序）

1. `20260830122351_p0a_case_participants_revision_audit.sql`
2. `20260830122353_p0a_case_participant_backfill_safe.sql`
3. `20260830122356_p0a_case_action_rpcs.sql`
4. `20260830122359_p0a_case_field_acl.sql`
5. `20260830122401_p0a_case_credentials.sql`

正文來源：Discard 前對話 transcript 還原之 8/28 SQL（暫存於 gitignored `scripts/.cache/r1d-extract/`）；**非**舊 worktree `20260827*`（舊 A2 會 INSERT participants，已拒用）。

## 官方文件核對（本機靜態）

- Supabase RLS／SECURITY DEFINER：`set search_path` 固定、schema-qualify、revoke PUBLIC／anon 後最小 grant（docs + advisors 0010／0011）。
- View：Postgres 預設 definer 語意會繞過 RLS；官方建議暴露給呼叫者時用 `security_invoker=on`，或撤銷基表權限並在 view／policy 內自建列條件。

## 強制條件核對

| 條件 | 結果 |
|---|---|
| A2 只寫 unresolved、無 `INSERT case_participants` | **PASS**（靜態 grep） |
| SECURITY DEFINER 皆有固定 `search_path` | **PASS**（皆 `pg_catalog`；非空字串但仍固定） |
| 撤銷 PUBLIC／anon 後再 grant | **PASS**（action／field／credential RPC） |
| 不可只依 `TO authenticated` | **PASS**（函式內 `auth.uid()`／`current_env()`／admin／participant） |
| mutation 用 expected revision | **PASS**（`p_expected_revision` 出現多次） |
| `cases_visible` definer 語意 | 草稿為 `security_invoker=false` + `security_barrier=true`（遮罩＋env 謂詞＋撤銷基表 SELECT）。Advisors `security_definer_view` ERROR 為**未決安全例外**，**不得**標已接受；乾淨環境旁路測試未做 |
| 不得單純 drop 敏感更新防護而無替代 | 草稿保留／重建遮罩 view＋credential RPC；**DB 未套用、未驗證** |

## 與 8/28 差異

- migration **時間戳**改為 `20260830122*`（CLI 新建），內容契約對齊 8/28 unresolved-only A2。
- 相對舊唯讀樹 `20260827*`：A2 **不再**信任 legacy FK 寫入 `case_participants`。
