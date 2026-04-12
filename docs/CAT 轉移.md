# CAT 工具整合至線上 TMS — 轉移文件

## 1. 文件目的

協助接手的工程師或 AI 代理，將本機優先的 **CAT 工具**（本儲存庫）整合到既有的**線上 TMS**，成為同一產品內的一個模組或子應用，並降低遺漏依賴、執行環境錯誤與資料模型衝突的風險。

## 2. 範圍與明確排除（重要）

| 項目 | 說明 |
|------|------|
| **必須達成** | **功能完整**：與產品規格對齊的編輯、句段、標籤、匯入／匯出（含 mqxliff／XLIFF 管線）、搜尋等可運行行為。 |
| **不必搬移** | 目前開發環境或使用者電腦上**實際的 TM／TB（翻譯記憶／術語庫）檔案內容**，以及**不必**為既有 IndexedDB 內資料做一對一遷移。 |
| **資料策略** | 整合後以 **TMS 為權威資料源**為原則；TM／TB 在正式環境可由 TMS 提供空庫、共用資源或重新匯入，**不以還原本工具舊檔為前提**。 |

若「完整功能」包含 TM／TB 查詢與套用，仍須在 TMS 端實作或串接對應 API；僅**不要求**帶入現有某一份 `.tmx`／術語檔的**歷史內容**。

## 3. 專案位置與啟動方式

| 項目 | 說明 |
|------|------|
| 範例路徑 | `c:\Users\WeiYi\.gemini\antigravity\playground\vector-kepler\my-cat-tool`（依實際 clone 位置而定） |
| 技術型態 | 以 **Vanilla JS** 為主的前端，**IndexedDB**（Dexie）做本機儲存 |
| 本機開發 | 需 **HTTP 伺服器**，勿用 `file://` 直接開 `index.html` |
| 批次啟動 | 專案根目錄 `Launch-CAT-Tool.bat`：本機伺服器埠 **3000**，並嘗試開啟瀏覽器 |
| 指令啟動 | `npm start` / `npm run dev`（`npx serve .`）；固定埠可：`npx serve -l 3000` → **http://localhost:3000** |
| 測試 | `npm run test:xliff`：XLIFF／mqxliff 標籤管線（Node + jsdom） |

## 4. 架構摘要（整合前必讀）

- **現況無後端**：主要邏輯在瀏覽器；資料在 **IndexedDB**。整合 TMS 時通常改為 **API + 可選本地快取**。
- **關鍵模組**（檔名以儲存庫為準）：
  - `index.html`：入口與腳本載入順序
  - `app.js`：主要 UI、編輯器、專案／檔案／句段流程
  - `db.js`：IndexedDB schema 與 CRUD
  - `js/xliff-tag-pipeline.js`：**mqxliff／XLIFF 標籤擷取、匯出、寫回 `<target>`**（memoQ 相關行為敏感，改動需迴歸）
  - `js/xliff-import.js`：XLIFF 類檔案匯入 orchestration
- **維護說明**：同目錄下 [XLIFF_TAG_EXPORT.md](./XLIFF_TAG_EXPORT.md)、`.cursor/rules/xliff-tag-export.mdc`（若存在）

## 5. 整合到 TMS 時需釐清的決策

### 5.1 產品形態

- **內嵌**：iframe 載入獨立部署 URL，或 monorepo 子路由（例如 `/cat`）。
- **子網域**：`cat.example.com` 與 TMS 共用 SSO，以 postMessage／共用 cookie 傳遞任務／專案 ID。

### 5.2 身分與權限

- TMS 角色（譯者、審校、PM）如何對應本工具的專案、檔案、句段鎖定、匯出權限。

### 5.3 資料存放（與「不搬 TM／TB 內容」一致）

| 方向 | 說明 |
|------|------|
| TMS 為權威 | 句段與任務狀態以伺服器為準；IndexedDB 僅作快取或離線時再評估。 |
| TM／TB | 不遷移本工具現有檔案內容；正式環境由 TMS 或管理員匯入／建空庫。 |

### 5.4 API 契約（建議由 TMS 方定義）

- 取得任務、拉取句段（含 source／target、狀態、鎖定、標籤 JSON）。
- 儲存句段（樂觀鎖或版本號）。
- 上傳／下載 mqxliff、xlsx 等。
- 錯誤碼、分頁、批次儲存與逾時。

### 5.5 建置與部署

- 靜態資源可放 CDN；`index.html` 勿長期快取。
- 環境變數：TMS API Base URL、功能開關。

### 5.6 安全

- CORS、CSP（`script-src` / `connect-src`）。
- 上傳檔：大小限制、副檔名白名單。

## 6. 建議遷移步驟（工程師）

1. **唯讀盤點**：搜尋 `export`、`import`、`DBService`、`mqxliff`、IndexedDB 表名。
2. **定義邊界**：哪些畫面保留、哪些改為 TMS 既有頁（例如專案列表 → 任務列表）。
3. **抽象資料層**：新增 `TmsApiAdapter`，與現有 `DBService` 並行，以功能開關切換。
4. **句段模型對齊**：TMS 是否支援 `sourceTags`／`targetTags`（JSON）；若否需轉換層。
5. **XLIFF 迴歸**：`npm run test:xliff`，並以真實 memoQ 檔在整合環境測匯入／匯出。
6. **E2E**：登入 TMS → 開任務 → 編輯 → 儲存 → 重新載入一致。

## 7. 給接手 AI 的提示（可貼入對話）

```
你正在將一個 Vanilla JS + IndexedDB 的 CAT 工具整合到既有線上 TMS。
目標是功能完整；不必遷移現有 TM／TB 檔案內容或舊 IndexedDB 資料，以 TMS 為資料權威。
請先閱讀 docs/XLIFF_TAG_EXPORT.md 與 js/xliff-tag-pipeline.js，避免破壞 mqxliff 標籤匯出。
資料存取請集中經由待實作的 TmsApiAdapter，不要直接刪除 IndexedDB 邏輯直到切換完成。
所有 API 呼叫需處理錯誤、逾時與 401 重新導向登入。
```

## 8. 交付物檢查清單

- [ ] TMS API 規格（OpenAPI 或同等文件）
- [ ] 句段／標籤欄位對照表
- [ ] 部署 URL 與環境（staging／production）
- [ ] SSO／Token 取得方式
- [ ] 大檔上傳大小與逾時限制
- [ ] 已確認：**不搬移舊 TM／TB 實體內容**，TMS 端資料策略已定

## 9. 相關文件

- [XLIFF_TAG_EXPORT.md](./XLIFF_TAG_EXPORT.md) — 標籤匯出管線
- [MULTI_USER_AND_NOTES_SYNC.md](./MULTI_USER_AND_NOTES_SYNC.md) — 多人／備註（若與 TMS 同步有關可一併閱讀）

## 10. 1UP TMS 內嵌現況（工程）

| 項目 | 說明 |
|------|------|
| 應用路由 | `/cat`（`CatToolPage` iframe 嵌入） |
| 靜態來源目錄 | 專案根目錄 [`cat-tool/`](../cat-tool/) |
| 建置輸出 | [`public/cat/`](../public/cat/)（`npm run sync:cat`，`prebuild` 會自動執行） |
| 側欄 | 「CAT（建構中）」，所有已登入使用者可見 |

更新 `cat-tool` 內檔案後請執行 `npm run sync:cat` 並提交 `public/cat` 變更，以便他人 clone 後可直接開發。

---

*本文件隨整合決策更新；若檔名或路徑變更請同步此節。*
