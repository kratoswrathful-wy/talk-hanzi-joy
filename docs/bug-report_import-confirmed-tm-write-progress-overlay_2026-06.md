# Bug 調查：匯入原檔已確認句段 — 進度框疊層與 TM 寫入去重（2026-06）

> **狀態**：**Bug A／B 已修**（待驗收）；**61e8fc2** 相關修復見 [`bug-report_workflow-import-confirmed-status-column_2026-06.md`](./bug-report_workflow-import-confirmed-status-column_2026-06.md) §8。  
> **關聯**：B-7e 匯入確認對話框 [`showConfirmedSegmentsDialog`](../cat-tool/app.js)；TM 寫入 [`writeImportConfirmedToProjectTms`](../cat-tool/app.js)；篩選語意 [`CAT_MQXIFF_FILTER_STATUS_IMPLEMENTATION.md`](./CAT_MQXIFF_FILTER_STATUS_IMPLEMENTATION.md) §6。

---

## 1. 症狀

### 1.1 Bug A：進度框疊在「原檔已確認句段」對話框上方

| 項目 | 內容 |
|------|------|
| 操作 | 批次匯入含**原檔已確認句段**的 mqxliff（例如 `Liveops 22.06.2026.xlsx_zho-TW.mqxliff`） |
| 畫面 | 「新增檔案並設定匯入邏輯」進度框（`正在匯入 1 / 1：…`）疊在「原檔已確認句段」選項框上方，使用者無法操作勾選 |
| 預期 | 確認句段對話框應在最上層，進度訊息在背景或暫時隱藏 |

### 1.2 Bug B：勾選寫入 TM 後，部份句段未寫入

| 項目 | 內容 |
|------|------|
| 操作 | 匯入 mqxliff，勾「將原檔已確認句段寫入翻譯記憶庫」；專案 TM：Top Drives |
| 樣本 | `Liveops 22.06.2026.xlsx_zho-TW.mqxliff`（26 個原檔已確認句段） |
| 現象 | 編輯器內句段皆已確認，但 TM 僅寫入**部份**句段；同類 Key（如多個 `Offer Name`）只有第一句在 TM，後續句段查不到 |
| 預期 | 所有已確認句段（含相同 `x-mmq-context` 類別名）皆寫入專案 TM |

---

## 2. 根因

### 2.1 Bug A：同 class、DOM 順序導致後者蓋前者

[`cat-tool/index.html`](../cat-tool/index.html)：

- 約第 1903 行：`#importConfirmedModal`（原檔已確認句段）
- 約第 2017 行：`#wizardOverlay`（匯入精靈／批次進度）

兩者皆為 `.wizard-overlay`（[`cat-tool/style.css`](../cat-tool/style.css) `z-index: 10050`）。無額外 id 規則時，**後宣告的 `#wizardOverlay` 疊在上方**。

流程：[`runBatchImport`](../cat-tool/app.js) 先更新 `#batchProgressMessage`，再呼叫 [`handleXliffLikeImport`](../cat-tool/js/xliff-import.js) → [`showConfirmedSegmentsDialog`](../cat-tool/app.js)；此時 `#wizardOverlay` 仍可見。

### 2.2 Bug B：`buildTmImportCandidates` 以 `idValue` 去重

[`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js)：

```js
const dedupKey = String(seg.idValue || '').trim() || `_row_${si}`;
if (seenKeys.has(dedupKey)) continue;
```

[`xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 對 memoQ Excel 衍生 mqxliff：`idValue` 取自 `context-type="x-mmq-context"`（例如 `Offer Name`、`Inventory Item Name`），是**欄位類別名**而非唯一鍵。

樣本 `Liveops 22.06.2026.xlsx_zho-TW.mqxliff`：多句共用 `Offer Name`，去重後**每類只保留第一句**，其餘 25 句中多數被跳過。TM 查詢單元為**原文**，以 `idValue` 去重與產品語意不符。

---

## 3. 修復

### 3.1 Bug A（z-index）

[`cat-tool/style.css`](../cat-tool/style.css) 在 `#mqRoleModal` 規則旁新增：

```css
#importConfirmedModal.wizard-overlay { z-index: 10051; }
```

高於預設 `wizard-overlay`（10050），低於 `#mqRoleModal`（100050）。同步 `public/cat/style.css`。

### 3.2 Bug B（去重鍵改原文）

[`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js)：

```js
// 改前
const dedupKey = String(seg.idValue || '').trim() || `_row_${si}`;

// 改後
const dedupKey = (seg.sourceText || '').trim() || `_row_${si}`;
```

同一檔內**原文完全相同**的句段仍只寫一筆；不同原文即使 `idValue` 相同皆寫入。同步 `public/cat/js/xliff-to-tm.js`。

---

## 4. 程式觸點

| 區塊 | 路徑 |
|------|------|
| 確認句段 Modal HTML | [`cat-tool/index.html`](../cat-tool/index.html) `#importConfirmedModal` |
| 疊層樣式 | [`cat-tool/style.css`](../cat-tool/style.css) |
| 批次匯入進度 | [`cat-tool/app.js`](../cat-tool/app.js) `runBatchImport` |
| XLIFF 匯入流程 | [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) |
| TM 候選建立 | [`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js) |
| TM 寫入 | [`cat-tool/app.js`](../cat-tool/app.js) `writeImportConfirmedToProjectTms` |
| `idValue` 解析 | [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) `x-mmq-context` |

---

## 5. 驗收

### Bug A

1. 批次匯入含已確認句段的 mqxliff。
2. 出現「原檔已確認句段」對話框時，**可完整操作**勾選與「確認匯入」；進度框不擋住內容。
3. 單檔匯入（非批次）同樣可正常操作。

### Bug B

1. 使用樣本 `Liveops 22.06.2026.xlsx_zho-TW.mqxliff`，專案 TM Top Drives，勾寫入 TM。
2. 匯入後在 TM 搜尋多個原為「只寫入第一句」的原文（例如多個不同 `Offer Name` 句段）。
3. 預期：26 個已確認句段對應原文皆可在 TM 找到（除非原文完全相同去重）。

---

## 6. 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-24 | 初稿：Bug A 疊層、Bug B `idValue` 去重；樣本 Liveops／Top Drives；修法與驗收 |
