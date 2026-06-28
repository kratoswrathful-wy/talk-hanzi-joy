# CAT 鎖定句段確認狀態保留與選取體驗 — 需求規格與開發紀錄（2026-06）

> **狀態**：**已落地並驗收**（mxliff 確認狀態；`12eb3ab`）  
> **關聯 bug-report**：[`bug-report_mxliff-confirm-level-export_2026-06.md`](./bug-report_mxliff-confirm-level-export_2026-06.md)  
> **格式深文件**：[`CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md`](./CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md) §6.4

---

## 1. 背景

使用者以 Phrase 產出之 **`.mxliff`**（`m:level="2"`）在 CAT 內確認句段後匯出，上傳回 Phrase 仍顯示未確認。另需釐清 **禁止編輯**（系統鎖定）與 **手動鎖定** 句段在匯入／匯出與編輯器互動上的一致行為。

**驗收樣本**：`I2Loc E50 Shadow Strike FOR TRANSLATORS (1)-en_us-zh_tw-PE.mxliff`（3,381 句；130 個 TM 鎖定句段）。

---

## 2. 產品需求規格（定案）

### 2.1 確認狀態（匯入／匯出）

| # | 規格 | 適用格式 |
|---|------|----------|
| 1 | 原檔為**禁止編輯**（`isLockedSystem`）的句段：匯入後顯示禁止編輯，**無法**在我方工具內手動解鎖 | mxliff、mqxliff、sdlxliff |
| 2 | 禁止編輯句段之確認狀態：匯入與匯出**保持一致**（客戶原檔樣子） | 同上 |
| 3 | 匯入時保留原檔確認狀態，於編輯器忠實呈現 | 同上 |
| 4 | 匯出時寫入編輯器內的確認狀態（可編輯句段） | 同上 |
| 5 | 標準 **xliff** 無原生鎖定欄位 → **不**納入禁止編輯規格 | xliff 除外 |

### 2.2 編輯器互動（鎖定／禁止編輯列）

| # | 規格 |
|---|------|
| A | 禁止編輯、手動鎖定列：**可**點選句段、反白文字；支援批次勾選（D2：橘／藍底 + 藍框區別） |
| B | 禁止編輯列：批次操作（取代、確認等）**略過**；以 **`showCatToast`** 提示被略過之列號 |
| C | 手動鎖定列：可回應鎖定／解鎖指令；被略過時**不**另發 toast |
| D | 禁止編輯列：**不回應**任何編輯／確認／取代指令 |

---

## 3. 技術方案摘要

### 3.1 mxliff 確認狀態

**匯入**（`xliff-build-segments.js`）：

```javascript
const mConf = parseInt(tu.getAttribute('m:confirmed') || '0', 10);
if (!isNaN(mConf) && mConf > 0) status = 'confirmed';
```

**匯出**（`xliff-tag-pipeline.js`）：

- 讀根元素 `m:level`；已確認可編輯句段寫 `m:confirmed = String(mLevel)`。
- `m:locked="true"`：**跳過** `m:confirmed`、`m:level-edited`、`target@state` 覆寫。

### 3.2 sdlxliff

- `seg.isLockedSystem` 時不覆寫 `sdl:seg@conf`、`target@state`（多段／單段 TU 皆然）。

### 3.3 mqxliff

- 既有 `commitinfo`／`mq:status` 匯入與 `updateMqxliffStatus` 匯出已滿足可編輯句段；本次未改 mqxliff 鎖定句段匯出跳過（若日後需與 mxliff 對齊可另開議題）。

### 3.4 編輯器

- `app.js`：鎖定列 `mousedown` → `active-row`、可選取；`user-select: text`（`style.css`）。
- `notifySkippedSystemLockedSegs`：掛於 `performReplaceAll`、`runTextOpOnSelection`、`ctxBatchConfirm`、`ctxBatchUnconfirm`。

---

## 4. 開發與提交紀錄

| Commit | 摘要 |
|--------|------|
| `12eb3ab` | fix(cat): mxliff confirm level export and locked segment UX |

**觸點**：

| 檔案 | 變更 |
|------|------|
| `cat-tool/js/xliff-build-segments.js` | mxliff `m:confirmed > 0` |
| `cat-tool/js/xliff-tag-pipeline.js` | mxliff `m:level`、鎖定跳過；sdlxliff 鎖定跳過 |
| `cat-tool/app.js` | 鎖定列選取、批次略過 toast |
| `cat-tool/style.css` | 鎖定列 `user-select: text` |
| `public/cat/*` | `npm run sync:cat` |

---

## 5. 驗收紀錄（2026-06-10）

### 5.1 Phrase 確認狀態（可編輯句段）

- 樣本 `m:level="2"`；編輯器內確認後匯出。
- 可編輯句段：`m:confirmed="2"`、`target@state="final"`。
- Phrase 開匯出檔：顯示**綠色已確認**（非空心圓）。
- **使用者回報：mxliff 驗收成功。**

### 5.2 TM 鎖定句段（130 筆）比對

原檔 vs 匯出檔 `en-zh-TW_Translated_I2Loc E50 Shadow Strike FOR TRANSLATORS (1)-en_us-zh_tw-PE.mxliff`：

| 項目 | 結果 |
|------|------|
| 鎖定句段數 | 130 = 130 |
| `m:confirmed` 分布 | 原檔／匯出檔皆 130× `"2"` |
| 不一致筆數 | **0** |
| 抽查 `:0`、`:4`、`:20` | 皆保留 `m:confirmed="2"` |

### 5.3 編輯器互動（目視／操作）

- TM 鎖定列（橘底 ⛔）匯入後顯示已確認。
- 禁止編輯列可點選、反白；批次含禁止編輯列時出現 toast 列號。

---

## 6. 已知邊界與後續議題

| 議題 | 說明 |
|------|------|
| mqxliff 鎖定句段匯出 | 未實作「跳過覆寫 `mq:status`」；若客戶回報再對齊 mxliff |
| 大檔 Shift 多選錨點 | 序號欄 Shift 範圍選取可能錯用 `lastEditedRowIdx`（見本檔 §7 與使用者回報） |
| 虛擬捲動 | 3,381 句全 DOM 渲染，點選體感延遲與效能相關；6333 句 Riftbound 全面遲鈍見 [`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)（Phase 1 focus 優化已做；Phase 2 虛擬捲動規劃中） |

---

## 7. 附錄：序號欄 Shift 多選異常（調查紀錄，未修）

**現象**：原選第 10 句，欲 Shift 選 5–15；先點 #5 再 Shift+#15，結果為 10–15。

**程式錨點**（`app.js` ID 欄 `click`）：

```javascript
const anchor = lastEditedRowIdx ?? lastSelectedRowIdx;
```

- `lastEditedRowIdx`：最後**取得焦點**的句段（`focusin` 或譯文格編輯）。
- `lastSelectedRowIdx`：最後點**序號欄**的句段。

點 #5 只更新 `lastSelectedRowIdx`，若第 10 句譯文格仍為焦點來源，`lastEditedRowIdx` 仍為 9 → Shift 錨點落在第 10 句。

**與歷史修改的關係**：

- [`CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md`](./CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md) §3.2／§7（`5168549`）：譯文 **debounce 寫庫**後 `requestAnimationFrame` 不得把焦點搶回舊列——解的是「游標被拉回第一次點的那列」，不是 Shift 錨點，但同屬「焦點與選取狀態不同步」家族。
- [`CAT第四波主記錄.md`](./CAT第四波主記錄.md) `6f0bc89`：多選外框視覺（`syncSelectedRowAbutmentTopClass`），非反應速度。
- 大檔（`bug-report_team-large-file-editor-stuck-loading`）：開檔載入，非點選延遲。

**改善方向（僅規劃，未實作）**：

1. 序號欄點擊時同步更新選取錨點（或 Shift 時優先 `lastSelectedRowIdx`）。
2. `focusin` 在序號多選流程中勿清除 `selectedRowIds`。
3. 延後／節流 `renderLiveTmMatches`、`renderSegmentComments`（換句時最重的同步工作）。**Phase 1 已落地**（focus 增量 class、`scheduleRenderLiveTmMatches` debounce、預翻面板快取）；見 [`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)。
4. 大檔虛擬捲動，減少每次 `querySelectorAll('.grid-data-row')` 全表掃描（**Phase 2 規劃**；同上文件）。

---

*文件建立：2026-06-10（驗收通過後補齊）。*
