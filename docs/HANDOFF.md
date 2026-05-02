# 1UP TMS 移交說明（TMS 本體 + CAT 內嵌）

> 本檔供新協作者快速掌握**目前狀態**與**下一步**。細部規格與歷史見 `docs/` 各專題文件。

## 專案概況

- **技術棧**：React + Vite + TypeScript；後端 Supabase（Postgres、Auth、Storage）；部署 Vercel。
- **CAT 工具**：Vanilla JS，**唯一原始碼**在 [`cat-tool/`](../cat-tool/)，建置前以 `npm run sync:cat` 同步至 [`public/cat/`](../public/cat/)（見根目錄 [`AGENTS.md`](../AGENTS.md)）。
- **功能對照**：[`docs/CODEMAP.md`](CODEMAP.md)。

## 目前狀態（2026-05-03）

### TMS 本體

- 案件／客戶／發票／內部註記等既有流程持續維運。
- **CAT 內嵌頁** [`src/pages/CatToolPage.tsx`](../src/pages/CatToolPage.tsx)：與 iframe 之 `postMessage`（指派、`TMS_ASSIGNMENTS`、句段集指派 `viewAssignments`、`CAT_VIEW_ASSIGNMENT_STATUS` 等）。

### CAT 工具（團隊線上模式）

- **句段集（`cat_views`）**：團隊線上版已可建立／清單／更名／指派橋接／譯者儀表板開啟；編輯器體驗已與**單檔模式**對齊（含排序、快捷鍵、TM 寫入語言對）；句段集清單「涉及檔案」超過 **5** 筆時可**展開／收合**（預設收合）。詳見 [`docs/CAT第四波主記錄.md`](CAT第四波主記錄.md) **§八**、**§八點六**。
- **字數與 TM 加權分析（Modal）**：專案檔案或句段集勾選後可開啟；多檔或多句段集時顯示**合併範圍**與**各檔／各集分項**，執行中顯示進度並鎖定「執行分析」；本機報告可含 `viewUnitIds`、`perUnitResults`。詳見 [`docs/CAT_WORD_COUNT_WORKER_AND_UI.md`](CAT_WORD_COUNT_WORKER_AND_UI.md) **§9**。
- **mqxliff 預設身分與匯入提示**：團隊庫 **`cat_files.default_mq_role`** 已與 RPC／專案檔案清單連動；清單對非 mqxliff 顯示 **`N/A`**；XLIFF 類匯入完成後若原始語言對與任務不符，以 **dialog 表格**（檔名／原語言對）提示。詳見 [`docs/CAT第四波主記錄.md`](CAT第四波主記錄.md) **§九點五**。
- **尚未做**：離線句段集 UI、協作 view 房、建立精靈「自訂篩選」完整步驟二等（見下節）。

## 待實作（建議優先序）

1. **離線句段集**：[`docs/CAT_VIEW_SPEC.md`](CAT_VIEW_SPEC.md) §2.2 — Dexie `views`、本機建立／開啟／同步。
2. **協作房間（句段集）**：同檔 §14 — `roomType` + `roomId`、`CAT_COLLAB_*` payload、`viewId` 房。
3. **建立句段集精靈步驟二**：§5.2 — 進階篩選列 + 唯讀格線預覽。
4. **§10 檢查清單**：逐項對齊程式後勾選；與程式分歧時以 PR 說明為準。

## 關鍵文件對照

| 主題 | 規格／索引 | 開發記錄 |
|------|------------|----------|
| 句段集 | [`CAT_VIEW_SPEC.md`](CAT_VIEW_SPEC.md)（§4 涉及檔案折疊） | [`CAT第四波主記錄.md`](CAT第四波主記錄.md) §八、**§八點六** |
| CAT 第四波（TM 游標、協作鎖等） | 主計畫鏡像 `docs/mirror/…` | [`CAT第四波主記錄.md`](CAT第四波主記錄.md) §一～§七；**§九點五**（匯入後語言對提示、mqxliff `default_mq_role` 與專案清單） |
| 路徑與檔案 | [`CODEMAP.md`](CODEMAP.md) | — |
| 字數／TM 加權（Worker、切換字數、分析 Modal） | [`CAT_WORD_COUNT_WORKER_AND_UI.md`](CAT_WORD_COUNT_WORKER_AND_UI.md) | — |

## 已知後續風險（簡記）

- **父頁與 iframe URL 不同步**：深連結／路由還原行為若擴充，需一併評估 [`CatToolPage.tsx`](../src/pages/CatToolPage.tsx)（見 [`CODEMAP.md`](CODEMAP.md) 註記）。
