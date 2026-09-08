狀態：實作中（隔離修復；未授權正式發布）

# Bug：登入後停在「角色資料載入失敗」

正式基準（第 2 項發布後）：`a011b96d062f3ff55d594b5b6eb0fd8ab2d11c0e`／`dpl_GvfaeuNYFaqKtEkBZWoQ3nCviH2w`；migration 168 筆，最高 `20260907120000`。

本項在 `C:\Homemade Apps\1UP-TMS-auth-identity-20260908` 分支 `fix/auth-identity-20260908`。保留 #85／#89／第 2 項。不 merge `main`、不正式部署。

## 已證實（程式＋正式 24h 彙總，非正式單次使用者請求）

能看到「角色資料載入失敗」表示 **session 已過關**（`authPhase === authenticated`）。那是另一個畫面「登入狀態載入逾時」。

正式 24h REST 彙總（2026-09-07 09:10Z～2026-09-08 09:10Z，只計路徑／狀態／延遲，不含使用者識別）：

| 路徑 | 200 | 非 200 | 200 且 origin>12s |
|---|---|---|---|
| `/auth/v1/token` | 344 | 504×4、409×1 | 2 |
| `/rest/v1/user_roles` | 5790 | 504×1 | 17 |
| `/rest/v1/profiles` | 53841 | 無 5xx | 17 |
| `/rest/v1/cases_visible` | 31245 | 500×221 等 | （第 4 項） |

前端 `fetchRoles`／`fetchProfile` 各 12 秒逾時。伺服器後來仍可能 200，畫面上已當失敗。這與 `cases_visible` 大量 500 **不是同一張表、不能預設同一根因**。

修正前程式把 **roles 失敗與 profile 失敗合成同一個 `identityError`**，標題一律「角色資料載入失敗」。roles 成功還會 `setIdentityError(null)` 清掉先前的 profile 錯誤；`identityLoading` 只等 roles。合法空 `[]` 已是成功，與 HTTP／逾時／中止分開。

## 尚未證實

- 使用者**當次**卡住是 roles 逾時、profile 逾時、HTTP 5xx、回應遺失或舊請求覆蓋：無對應 request id，**標未知**。隔離重現不能冒充該次原因。
- `--skip-domain` 準備階段團隊別名誤切期間是否有人操作：無使用紀錄，**標未知**。

## 最小修改

- 分開 `rolesError`／`profileError`；授權只看 roles。profile 失敗改標「個人資料載入失敗」，**仍阻擋進入**（不放寬存取）。
- 兩路都 settle 後一次套用；roles 成功不得清 profile 錯誤。
- 逾時／切帳 abort 進行中請求；pending 時重試重用同一 flight；手動重試上限 5。
- 合法空 roles：進入系統、管理鈕不出現。

## 第 2 項發布流程異常（不重開、不回切）

見 [`VERCEL_PROD_PREPARE_SKIP_DOMAIN_2026-09.md`](VERCEL_PROD_PREPARE_SKIP_DOMAIN_2026-09.md)。
