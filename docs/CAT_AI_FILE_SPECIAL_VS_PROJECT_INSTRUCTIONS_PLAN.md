# CAT：檔案特殊指示與專案 AI 指示分離 — 實作計畫

> 狀態：**規劃文件**（尚未改程式）。實作時以此檔為單一權威，並同步更新 [CAT_AI_BATCH_TOKEN_UX_2026-05.md](./CAT_AI_BATCH_TOKEN_UX_2026-05.md) 等交叉引用。  
> 背景：先前 UI 將「候選條目池」內區塊標為「本案特殊指示」，但資料與「專案 AI 指示」同來自 `specialInstructions`／`__aiBatchProjectInstructions`，與產品設計不符；見 [CAT_AI_BATCH_TOKEN_UX_2026-05.md](./CAT_AI_BATCH_TOKEN_UX_2026-05.md) 中「候選條目池」一節的歷史敘述（已加註將由本計畫取代）。

---

## 1. 產品目標（白話）

- **共用資訊（編輯器內）**：區塊標題為「**本案特殊指示**」。條目操作體驗對齊「專案準則」風格；資料以**專案**為儲存單位，但**是否套用在哪幾個檔**以**檔案**為單位（PM 以上為每條指示勾選適用檔案）。
- **共用資訊（專案頁）**：同一批資料與邏輯，區塊標題改為「**檔案特殊指示**」（與編輯器用語區隔，避免與 AI 設定畫面內「本案」混淆）。
- **譯者**：在編輯器內僅看得到**已勾選適用於目前檔案**的檔案特殊指示；**不可**變更「要套在哪幾個檔」。
- **專案頁（譯者）**：僅顯示**至少已指定一個套用檔**的指示，以及適用的檔案序號（`#x`）；不可編輯套用關係。
- **專案頁（PM 以上）**：可看見全部檔案特殊指示、每條目前套用的檔案序號；可開啟介面以**完整序號＋檔名＋勾選**增減套用檔案。
- **AI 翻譯前設定畫面**：
  - **本案特殊指示**：列出專案內之檔案特殊指示；**預設勾選**「目前檔案已套用」的條目，使用者可再增減勾選（僅影響本批／本次設定流程，細節見下節「每檔快照」）。
  - **專案 AI 指示**：維持可新增、編輯、刪除、勾選；以**專案**為單位儲存；**不要**出現在共用資訊／筆記區。

---

## 2. 已定決策（實作必遵守）

| 項目 | 決策 |
|------|------|
| 既有資料遷移 | 現有 `specialInstructions`（或雲端 `special_instructions`）內容**全部視為「專案 AI 指示」**遷入新欄位；新的「檔案特殊指示」陣列自空開始（除非另訂種子流程）。 |
| 每檔 AI 設定記憶 | **允許**為每個檔案詳細記錄「上次 AI 翻譯前設定」之快照，供下次開啟設定畫面還原。**尚待產品拍板**：僅保留最近一次，或保留最近 N 次；以及結構改版時的預設值／相容策略、團隊模式是否與帳號一併考量。 |
| 批次句段順序 | **維持現行**：依 `currentSegmentsList` 目前順序（含句段排序）；「指定範圍」之列號為畫面上由上到下的序號，非固定句段 ID。使用者提示已規劃於 [`cat-tool/index.html`](../cat-tool/index.html) `#aiBatchModal`「翻譯範圍」區塊（見下「小額 UI」）。 |
| 譯者權限 | 譯者**不可**改檔案特殊指示之「套用檔案」關係。 |
| 專案 AI 指示露出範圍 | **不**在共用資訊／筆記區顯示或編輯。 |

### 2.1 小額 UI（可與資料拆分同 PR 或先行）

在 AI 批次翻譯設定 Modal 中，`#aiBatchRangeError` 下方新增灰色說明段落，文案要點：

- 批次處理順序與「指定範圍」列號皆以**目前畫面上的句段順序**為準（含句段排序）。
- 調整排序或篩選後，同一組範圍數字所對應的句段可能改變。

---

## 3. 資料模型與遷移（建議欄位名 — 實作時可微調但需全文一致）

| UI／概念 | 建議程式／JSON 屬性（專案設定） | 說明 |
|----------|--------------------------------|------|
| 檔案特殊指示（編輯器「本案」／專案頁「檔案」） | `fileSpecialInstructions`（陣列，元素含 `id`、`content`、`enabled` 等，風格可對齊現有條目） | 與 `files.applicableSpecialInstructionIds`（或等價欄位）**僅**綁此陣列之 `id`。 |
| 專案 AI 指示 | `projectAiInstructions`（陣列） | 僅在 AI 設定畫面 CRUD；**不**參與檔案套用 id 表。 |

- **本機**：[`cat-tool/db.js`](../cat-tool/db.js) `aiProjectSettings` 之 Dexie 結構升版：新增 `projectAiInstructions`、將原 `specialInstructions` 語意收斂為僅檔案特殊指示，或在 upgrade 中把舊列**搬入** `projectAiInstructions` 並清空 `specialInstructions`（依上表遷移規則）。
- **雲端**：`cat_ai_project_settings` 新增 JSONB 欄（例如 `project_ai_instructions`）或於單一 JSON 文件內區分兩鍵；[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) 之 `mapAiProjectSettingsRow`、`db.saveAiProjectSettings` 必須雙向映射，避免靜默丟欄。
- **檔案快照**：若採「每檔上次 AI 設定」，欄位可置於 `files` 表／Dexie `files` 物件（例如 `aiBatchSettingsSnapshot` JSON）；開啟 `#aiBatchModal` 時讀取並合併預設。

---

## 4. 程式觸點清單（實作勾選用）

- [`cat-tool/app.js`](../cat-tool/app.js) `loadSharedInfoAiPanel`：僅讀寫 `fileSpecialInstructions`（或遷移後之 `specialInstructions` 新語意）；專案頁標題「檔案特殊指示」。
- [`cat-tool/app.js`](../cat-tool/app.js) `__aiBatchProjectInstructions`、`_loadAiBatchProjectInstructions`、`_saveAiBatchProjectInstructions`：改為讀寫 **`projectAiInstructions`**，**禁止**再整份覆寫檔案特殊指示。
- [`cat-tool/app.js`](../cat-tool/app.js) `_defaultAiBatchPoolFromProjectData`、`_renderAiBatchCandidatePool`、`_syncAiBatchPoolSiKeys`：區分「候選池：檔案特殊指示」與「候選池：專案 AI 指示」（可為 `pool.fileSi` + `pool.projectAi` 或類似），token 合計分別納入或分項顯示（產品可再定）。
- [`cat-tool/app.js`](../cat-tool/app.js) `_buildAiOptions`：兩類文字併入 system／user 的路徑與順序、防重複。
- [`cat-tool/db.js`](../cat-tool/db.js) v17 註解與 `applicableSpecialInstructionIds`：僅指向檔案特殊指示之 id。
- 團隊：[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) 與對應 migration。

---

## 5. 驗收清單（產品可測）

- PM：專案頁「檔案特殊指示」可管理全部條目、每條可設定適用檔（序號＋檔名＋勾選）。
- 譯者：編輯器僅見已套用至**目前檔**之指示；不可改套用檔案。
- AI 設定：兩區塊資料來源分離；預設勾選行為符合「本案區＝檔案已套用可再改勾選」之規格。
- 遷移後：舊專案原 `specialInstructions` 內容出現在「專案 AI 指示」；檔案特殊指示為空或依種子規則。
- 翻譯範圍下方提示：讀完能理解列號隨畫面順序變動。

---

## 6. 相關文件（已排定之修訂）

| 文件 | 動作 |
|------|------|
| [CAT_AI_BATCH_TOKEN_UX_2026-05.md](./CAT_AI_BATCH_TOKEN_UX_2026-05.md) | 「同一份資料」改為歷史說明＋連結本計畫。 |
| [CAT_AI_GUIDELINES_AND_PROJECT_RULES.md](./CAT_AI_GUIDELINES_AND_PROJECT_RULES.md) | `special_instructions` 表列處加註語意將拆分、連結本計畫。 |
| [AGENTS.md](../AGENTS.md) | 文件索引新增本計畫連結。 |
| [CODEMAP.md](./CODEMAP.md) | 增一行對照本計畫與 `cat-tool` 觸點。 |

---

## 7. 不在本文件第一次落地範圍內（除非另開任務）

- 除第 2.1 節所述**單段提示文案**外之大規模 UI 重排。
- 與本主題無關之 AI 模型／prompt 內容調整。
