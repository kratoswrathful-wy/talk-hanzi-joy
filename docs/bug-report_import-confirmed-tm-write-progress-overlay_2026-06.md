# Bug 調查：匯入原檔已確認句段 — 進度框疊層與 TM 寫入（2026-06）

> **狀態**：Bug A **已修並驗收**（`1ee8cc6`）；Bug B **已修並驗收**（`1ee8cc6`）；Bug C **已修並驗收**（`c4e4736`）。  
> **關聯**：**61e8fc2** 匯入確認持久化見 [`bug-report_workflow-import-confirmed-status-column_2026-06.md`](./bug-report_workflow-import-confirmed-status-column_2026-06.md) §8；B-7e 見 [`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) §12。

---

## 1. 症狀

### 1.1 Bug A：進度框疊在「原檔已確認句段」對話框上方

| 項目 | 內容 |
|------|------|
| 操作 | 批次匯入含**原檔已確認句段**的 mqxliff（例如 `Liveops 22.06.2026.xlsx_zho-TW.mqxliff`） |
| 畫面 | 「新增檔案並設定匯入邏輯」進度框疊在「原檔已確認句段」選項框上方，使用者無法操作勾選 |
| 預期 | 確認句段對話框應在最上層 |

### 1.2 Bug B：勾選寫入 TM 後，部份句段未寫入（同 Key 類別）

| 項目 | 內容 |
|------|------|
| 操作 | 匯入 mqxliff，勾寫入 TM；專案 TM：Top Drives |
| 樣本 | `Liveops 22.06.2026.xlsx_zho-TW.mqxliff`（26 個原檔已確認句段） |
| 現象 | 同類 Key（如多個 `Offer Name`）只有第一句在 TM |
| 預期 | 不同原文皆寫入（即使 `x-mmq-context` 相同） |

### 1.3 Bug C：勾寫入 TM 後，右欄仍無相符 TM（整批未寫入）

| 項目 | 內容 |
|------|------|
| 操作 | 從**專案檔案清單**匯入 mqxliff，勾寫入 TM |
| 樣本 | 同上 Liveops／Top Drives |
| 現象 | 編輯器句段已確認；格線「相符度 94」為原檔 `mq:percent`；右欄 CAT 仍顯示「無相符 TM／TB 紀錄」 |
| 預期 | 寫入後開檔應能在右欄比對到 TM |

---

## 2. 根因

### 2.1 Bug A：同 class、DOM 順序導致後者蓋前者

[`cat-tool/index.html`](../cat-tool/index.html)：`#importConfirmedModal`（約 1903 行）在 `#wizardOverlay`（約 2017 行）之前；兩者皆 `.wizard-overlay`（`z-index: 10050`），後者自然疊在上。

### 2.2 Bug B：`buildTmImportCandidates` 以 `idValue` 去重

`idValue` 取自 `x-mmq-context`（欄位類別名如 `Offer Name`），非唯一鍵；去重後每類只留第一句。TM 比對單元為**原文**。

### 2.3 Bug C：匯入路徑 `window.ActiveWriteTms` 為空

[`writeImportConfirmedToProjectTms`](../cat-tool/app.js) 僅讀 `window.ActiveWriteTms`；空陣列時 `return { written: 0 }`，**無 toast**。

專案頁 [`sourceFileInput`](../cat-tool/app.js) 匯入會 `getProject` 取語言對，但**未**同步 `project.writeTms`。`ActiveWriteTms` 僅在開編輯器或 TM 掛載 Modal 時設定。

### 2.4 Bug D（次要／可選）：語言過濾

寫入 TM 使用匯入對話框「系統設定」語言（如 `en-us`）；開檔後 [`_tmSegLangOk`](../cat-tool/app.js) 以檔案 `sourceLang` 過濾快取。若不一致，DB 有句段但右欄比對不到。另波評估。

---

## 3. 修復

### 3.1 Bug A（已落地 `1ee8cc6`）

```css
#importConfirmedModal.wizard-overlay { z-index: 10051; }
```

### 3.2 Bug B（已落地 `1ee8cc6`）

[`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js) 去重鍵改為 `(seg.sourceText || '').trim()`。

### 3.3 Bug C（已落地 `c4e4736`，已驗收）

1. **`writeImportConfirmedToProjectTms`**：`ActiveWriteTms` 為空時從 `currentProjectId` → `project.writeTms` 解析；回傳 `{ written, skippedReason }`。
2. **`sourceFileInput` 匯入前**：`window.ActiveWriteTms = project.writeTms.slice()`（雙保險）。
3. **`xliff-import.js`**：寫入後 toast（成功筆數／未掛載寫入 TM）。
4. **寫入成功後**：將新列併入 `ActiveTmCache`（若編輯器已開且語言相符），減少關檔重開。

### 3.4 Bug D（規劃中）

`_tmSegLangOk` 變體放寬或寫入語言與檔案任務語言對齊；驗收 Bug C 後再定。

---

## 4. 程式觸點

| 區塊 | 路徑 |
|------|------|
| 確認句段 Modal | [`cat-tool/index.html`](../cat-tool/index.html) `#importConfirmedModal` |
| 疊層樣式 | [`cat-tool/style.css`](../cat-tool/style.css) |
| 匯入選檔 | [`cat-tool/app.js`](../cat-tool/app.js) `sourceFileInput` |
| XLIFF 匯入 + toast | [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) |
| TM 候選 | [`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js) |
| TM 寫入 | [`cat-tool/app.js`](../cat-tool/app.js) `writeImportConfirmedToProjectTms` |
| TM 快取過濾 | [`cat-tool/app.js`](../cat-tool/app.js) `_tmSegLangOk`、`loadProjectTmCacheInBackground` |

---

## 5. 驗收

### Bug A（已驗收）

批次／單檔匯入時，「原檔已確認句段」對話框可完整操作。

### Bug B

刪檔重匯後，TM 內多個不同 `Offer Name` 原文皆可找到（去重後略少於 26）。

### Bug C（已驗收，2026-06-24，Liveops／Top Drives）

1. 專案掛載 Top Drives 為**寫入 TM**。
2. **刪除舊檔**後重匯 Liveops 樣本，勾寫入 TM。
3. 匯入完成 toast 顯示寫入筆數（非「未掛載寫入 TM」）。
4. TM 管理頁句段數增加。
5. 開檔第 4 句等：右欄有 TM 比對（不只格線 94%）。

---

## 6. 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-24 | 初稿：Bug A 疊層、Bug B 去重；`1ee8cc6` |
| 2026-06-24 | 第二輪：Bug C `ActiveWriteTms` 匯入缺口；Bug D 語言過濾備註；Bug C 實作 `c4e4736` |
| 2026-06-24 | Bug C **已驗收**（Liveops／Top Drives）：匯入 toast、TM 句段寫入、右欄比對正常 |
