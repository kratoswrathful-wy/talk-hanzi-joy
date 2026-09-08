狀態：已落地待驗收（隔離 CI 通過；未授權正式發布）

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
- 逾時／切帳 abort 進行中請求；pending 時重試重用同一 flight；手動重試上限 5。達上限後重試鈕停用，提供「登出」；上限在登出或切帳重置，沒有自動重試。
- 合法空 roles：進入系統、管理鈕不出現。
- 前端期限常數仍為 12 秒，**未**調高 timeout。

本項只能宣稱：**已驗證的前端錯誤處理**已修好。不能宣稱角色載入逾時或後端效能已根治。

## 產品對照（同一套新斷言）

保留新測試設定與斷言，只把產品程式還原為 `a011b96d` 的 `auth-identity.ts`／`use-auth.ts` 後跑代表項，再換回新版。**不是**隔離 CI 的 `No tests found`。

`No tests found`（run [34209998554](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/34209998554)）是 Playwright `testMatch` 未列入新 spec，屬測試設定失敗，**不是**舊產品缺陷重現。

| 代表情境 | 舊產品（`a011b96d`） | 新產品 |
|---|---|---|
| profile 先失敗、後到的 roles 成功 | `identityError` 被清成 `null` | 仍為失敗，`identitySource=profile`，授權仍看 roles |
| pending 時 `force` 重試 | 開第二個 Promise（重疊請求） | 重用同一 flight |
| 手動重試 8 次 | 無 `identityRetryCapped`，不擋 | 上限 5，之後不再送出；登出後計數歸零 |

既有 A→B／signOut 晚到測試在 `a011b96d` 已存在，作切帳污染的既有證據，不重跑等價項當本項紅燈。

## 逾時（正式紀錄曾出現 12 秒後才 200）

- 期限常數 `IDENTITY_ROLES_TIMEOUT_MS`／`IDENTITY_PROFILE_TIMEOUT_MS` 仍為 **12000**。單元測試縮短時鐘（80ms／200ms），走同一條程式。
- 超過期限：分類 `kind: "timeout"`，不寫入角色快取，畫面走錯誤（非合法空角色）。
- 逾時後 `force` 重試成功：快取為新結果；先前晚到的 roles 不得覆寫。
- **中止驗證層次**：逾時會把 supabase-js 的 `AbortSignal` 設為 `aborted`。這只證明前端／客戶端要求取消。 **不能**宣稱 PostgREST 或資料庫查詢已停止。

## 隔離 UI（Playwright T1–T6）

- 分支 `fix/auth-identity-20260908`；Draft PR [#91](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/91)（base＝`fix/case-buttons-20260908`／`a011b96d`）。
- 通過：run [34210613080](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/34210613080) SHA `507b9ee0`；後續 HEAD 再綠見該次 push。suite `auth-identity`；未跑 case-buttons／T14／T15。
- T5：達上限後重試鈕停用、可見「登出」與「請按「登出」後再登入」；案件頁與新增案件不出現。
- 切帳／登出污染：單元測試為主；Playwright 未單獨做「spinner 期間登出」。
- 正式發布未授權；無新 migration。

## 第 2 項發布流程異常（不重開、不回切）

見 [`VERCEL_PROD_PREPARE_SKIP_DOMAIN_2026-09.md`](VERCEL_PROD_PREPARE_SKIP_DOMAIN_2026-09.md)。
