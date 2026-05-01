# CAT 批次匯入作業檔精靈：構想、實作與驗收備忘

本文件整理 **2026-05 前後** 關於「專案詳情 → 匯入」**多檔批次流程**的產品構想、開發要點、已修問題與手動測試方式，供維運與後續接手對照程式（[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/index.html`](../cat-tool/index.html)）。改動後請依 [`AGENTS.md`](../AGENTS.md) 於專案根目錄執行 `npm run sync:cat`，並一併提交 `cat-tool/` 與 `public/cat/`。

---

## 一、功能構想（產品）

1. **多檔選取**  
   匯入來源 `<input type="file">` 支援 **multiple**，一次選入多個 CAT 作業檔（含 XLIFF／mqxliff、PO、Excel 等既有格式組合）。

2. **精靈步驟泛化**  
   `showWizardStep` 改為以 `.wizard-step` 集中切換，新增批次專用步驟節點，例如：
   - `wizardStepBatchMq`：多個 **mqxliff** 各自選角色（T／Allow／R1…）。
   - `wizardStepBatchExcel`：多個 **Excel** 的欄位對應（全域同一組 vs 每檔各自設定）。
   - `wizardStepBatchProgress`：逐檔匯入進度與摘要。

3. **語言對與格式驗證**  
   維持既有單檔語意；批次時對每一檔套用相同閘門（不支援的檔名／副檔名、語言對不符等）。

4. **Excel 欄位設定模式**  
   - **「全部使用相同欄位設定」**（預設勾選）：以清單中**第一個 Excel** 開欄位編輯預覽；儲存後 `_batchExcelGlobalCfg` 生效；每檔匯入時仍讀取**該檔自己的工作簿**（不是只匯第一檔）。  
   - **取消勾選**：改為每檔個別 `_batchExcelConfigs`（`Map<file, config>`）。

5. **狀態清理規則（避免殘留「已設定」）**  
   - 勾回「全部相同」：清空**個別檔**設定與各列「✓ 設定完畢」。  
   - 取消「全部相同」：清空**全域**設定與全域「✓ 設定完畢」。  
   （與 `_refreshBatchExcelStep` 的啟用條件一致。）

6. **開始匯入按鈕**  
   `#btnBatchExcelStart` 是否可按由 `_refreshBatchExcelStep()` 統一計算：全域模式須 `_batchExcelGlobalCfg`；個別模式須**每一個** Excel 檔都在 `_batchExcelConfigs` 内。

7. **實際匯入**  
   `runBatchImport` 逐檔呼叫既有單檔路徑（例如 `_importSingleExcelFile`、`xliffImportCtx({ suppressWizardHide: true })` 等），更新進度文案與錯誤／成功摘要。

8. **刻意不做（本次對話收斂）**  
   **不在**「儲存欄位設定」時依「原文欄是否整欄空白」阻擋匯入或標註檔名／工作表（單檔與批次皆不實作）。若未來要加，應另開規格與驗收項。

---

## 二、主要程式錨點（維運）

| 主題 | 位置（`cat-tool/`） |
|------|---------------------|
| 精靈 HTML 骨架、多選 input、`wizardStepBatch*` | `index.html` |
| 批次狀態（`_batchExcelGlobalCfg`、`_batchExcelConfigs`、`_batchExcelModalExcelFiles` 等） | `app.js` |
| 重新計算 Excel 步驟 UI 與「開始匯入」`disabled` | `app.js` → `_refreshBatchExcelStep` |
| 批次 Excel 設定畫面建構與解析 `Promise` | `app.js` → `showBatchExcelConfigModal` |
| 「全部相同」勾選時清空／同步按鈕狀態 | `app.js` → `onBatchExcelSameCfgToggle`（綁 `change` + `input`） |
| 開啟欄位編輯（讀取緩衝、塞入精靈第二步） | `app.js` → `_openBatchExcelColumnEditor` |
| 批次匯入主迴圈 | `app.js` → `runBatchImport` |
| XLIFF 匯入不強制關閉精靈 overlay | `app.js` → `xliffImportCtx` 選項 `suppressWizardHide` |

更短的路徑索引見 [`CODEMAP.md`](./CODEMAP.md)「CAT：批次匯入作業檔精靈」。

---

## 三、開發過程摘要

### 3.1 已交付主線

- 多選、`wizardStepBatchMq`／`BatchExcel`／`BatchProgress`、`runBatchImport`、單檔匯入抽出、批次 mqxliff 角色表單等，已於較早提交落地（`HANDOFF.md` 曾以 `3348922` 摘要「批次匯入 CAT 作業檔」）。

### 3.2 `ReferenceError: label is not defined`

- **現象**：批次 Excel 開欄位編輯時，按鈕暫時顯示載入字串用了未定義變數 `label`。  
- **修正**：改為字面 `'讀取中…'`（commit 摘要曾記於 `HANDOFF.md`：`e11bbe0`）。

### 3.3 「全部相同」取消勾選後「開始匯入」仍可按

- **現象**：先勾「全部使用相同欄位設定」並完成全域欄位設定後，**取消勾選**，預期應改為要求每檔各自設定，但「開始匯入」仍維持可點。  
- **原因**：僅依賴 `change` 且於 handler 內用 `querySelector(...).checked` 讀取，部分環境／操作順序下狀態更新與 `_refreshBatchExcelStep` 不同步；取消勾選時也未保證觸發與 DOM 一致的重新計算。  
- **修正**：  
  - 抽出 `onBatchExcelSameCfgToggle(e)`，以 **`!!e.target.checked`** 為準。  
  - 同時監聽 **`change`** 與 **`input`**。  
  - 保留原有資料清理：勾選→清個別設定與狀態列；取消→清全域設定與全域狀態列；結尾一律 `_refreshBatchExcelStep()`。

---

## 四、手動測試建議（驗收）

1. **批次多檔**：選 2+ 作業檔（含至少一個 Excel），走完語言對 → mqxliff（若有）→ Excel 設定 → 進度／摘要。  
2. **全域欄位**：勾選「全部使用相同欄位設定」，只開「欄位設定」（全域）一次，確認「開始匯入」啟用；匯入後各 Excel 皆有資料（非僅第一檔）。  
3. **切換模式（本次修正重點）**：  
   - 全域設定完成後 **取消**「全部相同」→「開始匯入」應 **disabled**。  
   - 逐檔按下「欄位設定」並儲存後，最後一檔完成時「開始匯入」應 **enabled**。  
4. **切回全域**：再次勾選「全部相同」→ 個別「✓ 設定完畢」應清除；須重新完成全域設定才可匯入。  
5. **取消**：批次流程中「取消」應終止並回到合理畫面（與既有精靈一致）。

---

## 五、文件與規範交叉引用

- 單一來源與 sync：`AGENTS.md`、`cat-tool/README.md`。  
- 交接摘要表：`HANDOFF.md`「其他近期落地」。  
- 功能路徑：`CODEMAP.md`。  
- 介面用語（避免簡中「匹配」等）：`CAT_VIEW_SPEC.md` §1.3。

---

## 六、修訂紀錄

| 日期（約） | 內容 |
|------------|------|
| 2026-05-01 | 初稿：整合批次匯入構想、錨點、`label` 錯誤、「開始匯入」勾選同步修正與驗收項；標註「原文全空白阻擋」不實作。 |
| 2026-05-01 | 程式修正入庫：`1d82a97`（`onBatchExcelSameCfgToggle`：`change` + `input`、`e.target.checked`）。 |
