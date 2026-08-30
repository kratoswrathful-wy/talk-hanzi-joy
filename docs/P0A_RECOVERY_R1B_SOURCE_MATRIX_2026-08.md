# R1-B source matrix (recovery/p0a-20260830)
狀態：實作中（本機 checkpoint；unverified；not deployable）

基準：`724eb886`（PR #80 merge）。舊稿僅作區塊參考，禁止整檔覆蓋。

| dest | old-tree SHA-256（參考） | action |
|---|---|---|
| `src/stores/case-store.ts` | `2D63A7A7B29FC774C6B8BB6E271C59BE96740E1C4EB9BF9122F531DE97C5CADB` | **人工整合**：保留 PR #80 `AuthRecoverableError`、`loadVersion`、TOKEN_REFRESHED 短路、optimistic pending；改用 `mergeCasePublicSnapshot`（禁止 richer tools 回補）；`toDb` 剝除 login／tools／questionTools；admin `update` → `applyCaseUpdate`（標示過渡至 P0-B）；member → `updateCasePermittedFields`；憑證走 `updateCredentials`／vault；action RPC 方法 |
| `src/pages/CasesPage.tsx` | `69A4C307EFCC6AF3875134A9BF3B423CA6AE4648FCBF9C08A692F4EA4A97EE12` | **人工移植區塊**：accept／task complete／decline → case-action RPC；其餘列表／Auth 行為留 `724eb886` |
| `src/pages/CaseDetailPage.tsx` | `3F610A83D4FB7A2050E7BFD2B62B4BABE4EC564E9BEE32765F965F7DF01690A4` | **人工移植區塊**：憑證 state、tools→`updateCredentials`、accept／decline／complete／member collab／review RPC；登入欄 UI 暫留 TODO；不整檔覆蓋 |

## 強制保留核對

1. PR #80 Auth recoverable／generation／stale guard／store 初始化：保留於 case-store。
2. P0-A 專用案件動作 RPC：頁面與 store 已接。
3. 敏感憑證移出一般 case store：`toDb` 剝除；vault／credential RPC。
4. 公開遮罩快照：`mergeCasePublicSnapshot`，不得以較完整舊本機資料補回。
5. 一般欄位更新：只傳明確變更欄位（admin／member 路徑）。
6. tools／question_tools／登入等不得經一般 patch／整份 JSON replacement。
7. PM 過渡 `applyCaseUpdate`：註解標示僅到 P0-B；不還原一般使用者 `apply_case_update`。

## 測試（本機，R1-B 閘門子集）

- `tsc -b`：通過
- Vitest R1-A 三組：通過
- PR #80 Auth／Bridge：`auth-ready`、`auth-identity`、`ai-agent-bridge.get-fresh`、`use-auth`、`use-permissions.hook`、`permission-settings-fetch`：通過
- 註：`@testing-library/dom` 在本 worktree 曾缺 peer；本機以 `--no-save` 補齊後 hook 測試通過（未寫入 package.json／lock）
