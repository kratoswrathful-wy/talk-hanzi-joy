# 1UP TMS 移交說明（TMS 本體 + CAT 內嵌）

> 本檔供新協作者快速掌握**目前狀態**與**下一步**。細部規格與歷史見 `docs/` 各專題文件。

## 專案概況

- **技術棧**：React + Vite + TypeScript；後端 Supabase（Postgres、Auth、Storage）；部署 Vercel。
- **CAT 工具**：Vanilla JS，**唯一原始碼**在 [`cat-tool/`](../cat-tool/)，建置前以 `npm run sync:cat` 同步至 [`public/cat/`](../public/cat/)（見根目錄 [`AGENTS.md`](../AGENTS.md)）。
- **功能對照**：[`docs/CODEMAP.md`](CODEMAP.md)。

## 目前狀態（2026-05-02）

### TMS 本體

- 案件／客戶／發票／內部註記等既有流程持續維運。
- **CAT 內嵌頁** [`src/pages/CatToolPage.tsx`](../src/pages/CatToolPage.tsx)：與 iframe 之 `postMessage`（指派、`TMS_ASSIGNMENTS`、句段集指派 `viewAssignments`、`CAT_VIEW_ASSIGNMENT_STATUS` 等）。

### CAT 工具（團隊線上模式）

- **句段集（`cat_views`）**：團隊線上版已可建立／清單／更名／指派橋接／譯者儀表板開啟；編輯器體驗已與**單檔模式**對齊（含排序、快捷鍵、TM 寫入語言對）；詳見 [`docs/CAT第四波主記錄.md`](CAT第四波主記錄.md) **§八**。
- **尚未做**：離線句段集 UI、協作 view 房、建立精靈「自訂篩選」完整步驟二等（見下節）。

## 待實作（建議優先序）

1. **離線句段集**：[`docs/CAT_VIEW_SPEC.md`](CAT_VIEW_SPEC.md) §2.2 — Dexie `views`、本機建立／開啟／同步。
2. **協作房間（句段集）**：同檔 §14 — `roomType` + `roomId`、`CAT_COLLAB_*` payload、`viewId` 房。
3. **建立句段集精靈步驟二**：§5.2 — 進階篩選列 + 唯讀格線預覽。
4. **§10 檢查清單**：逐項對齊程式後勾選；與程式分歧時以 PR 說明為準。

## 關鍵文件對照

| 主題 | 規格／索引 | 開發記錄 |
|------|------------|----------|
| 句段集 | [`CAT_VIEW_SPEC.md`](CAT_VIEW_SPEC.md) | [`CAT第四波主記錄.md`](CAT第四波主記錄.md) §八 |
| CAT 第四波（TM 游標、協作鎖等） | 主計畫鏡像 `docs/mirror/…` | [`CAT第四波主記錄.md`](CAT第四波主記錄.md) §一～§七 |
| 路徑與檔案 | [`CODEMAP.md`](CODEMAP.md) | — |

## 已知後續風險（簡記）

- **父頁與 iframe URL 不同步**：深連結／路由還原行為若擴充，需一併評估 [`CatToolPage.tsx`](../src/pages/CatToolPage.tsx)（見 [`CODEMAP.md`](CODEMAP.md) 註記）。
