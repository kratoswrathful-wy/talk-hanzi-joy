# CAT 批次匯出（ZIP）開發記錄

> 建立日期：2026-05-03  
> 完成日期：2026-05-03  
> 狀態：**已上線，驗收通過**  
> Commit：`9b6da38` — feat(cat): add batch export selected files as ZIP

---

## 1. 功能描述

在專案頁面「檔案清單」的批次工具列新增「**匯出所選**」按鈕。使用者勾選任意數量的檔案後，按鈕觸發批次匯出：各檔案的譯文依原格式（XLIFF、mqXLIFF、sdlXLIFF、PO、Excel、GoogleSheet）分別組裝，一次打包成單一 ZIP 檔供下載。

---

## 2. 設計決策

| 項目 | 決定 | 理由 |
|------|------|------|
| 交付方式 | 一律 ZIP（不支援逐一下載） | 瀏覽器對連續多下載有阻擋機制；ZIP 體驗最直覺 |
| ZIP 內檔名 | `{sourceLang}-{targetLang}_Translated_{原檔名}` | 防止同名檔案在 ZIP 內互蓋 |
| 無語言對時 | 退回 `Translated_{原檔名}` | 向下相容舊無語言對資料 |
| ZIP 本身檔名 | `批次匯出_{專案名稱}_{時間戳}.zip` | 方便辨識來源與時間 |
| Tag 驗證 | 全部跑完後統一回報 | 不中途打斷批次流程，體驗更流暢 |
| 部分失敗 | 成功的仍放入 ZIP；失敗的列名稱告知 | 最大化可用輸出，不因一個問題擋住全部 |
| Flush 提示 | 若 `currentFileId` 不為空，觸發前顯示 `confirm` | 編輯器中有未儲存內容時提醒，避免遺漏 |
| 進度回饋 | 按鈕文字顯示「匯出中… (N/M)」並 disabled | 輕量實作，不需額外 modal |
| UI 位置 | `#projectFilesToolbar`，不限角色顯示 | 匯出為通用操作，譯者也需要 |

---

## 3. 影響範圍

| 檔案 | 變更摘要 |
|------|---------|
| `cat-tool/index.html` | `<head>` 引入 JSZip 3.10.1 CDN；toolbar 插入「匯出所選」按鈕（`#btnProjectBatchExport`） |
| `cat-tool/js/xliff-tag-pipeline.js` | 原 `exportXliffFamily` 重構：核心邏輯移至新增的 `exportXliffFamilyToBlob(f, segs, format)` → `{ blob, filename }`；原函式改為呼叫它再觸發下載（單檔行為不變）；`exportXliffFamilyToBlob` 加入公開介面 |
| `cat-tool/js/po-import.js` | 同上，新增 `exportPoToBlob(f, segs)` → `{ blob, filename }`；原 `exportPo` 改呼叫它；`exportPoToBlob` 加入公開介面 |
| `cat-tool/app.js` | DOM 宣告 `btnProjectBatchExport`；新增輔助函式 `_batchExportGetFileFormat`、`_batchExportZipFilename`、`_batchExportBuildBlob`；主函式 `batchExportSelectedFiles()`；綁定按鈕 click |
| `public/cat/`（以上四檔） | `npm run sync:cat` 同步 |
| `docs/CAT_BATCH_EXPORT_PLAN.md` | 本文件（計畫 → 記錄） |

---

## 4. 架構說明

### 4-a. 格式判斷（`_batchExportGetFileFormat`）

與編輯器內 `currentFileFormat` 的判斷邏輯完全一致，以檔名後綴為主、`fileFormat` 欄位為輔：

```js
function _batchExportGetFileFormat(file) {
    if (file.fileFormat === 'googlesheet') return 'googlesheet';
    const lower = (file.name || '').toLowerCase();
    if (lower.endsWith('.mqxliff'))  return 'mqxliff';
    if (lower.endsWith('.sdlxliff')) return 'sdlxliff';
    if (lower.endsWith('.xlf') || lower.endsWith('.xliff') || lower.endsWith('.mxliff')) return 'xliff';
    if (lower.endsWith('.po') || lower.endsWith('.pot')) return 'po';
    return 'excel';
}
```

### 4-b. Blob 組裝（`_batchExportBuildBlob`）依格式分流

| 格式 | Blob 來源 |
|------|----------|
| xliff / mqxliff / sdlxliff | `Xliff.exportXliffFamilyToBlob(f, segs, format)` |
| po / pot | `PoImport.exportPoToBlob(f, segs)` |
| googlesheet | XLSX.js `aoa_to_sheet` → `XLSX.write({ type:'array' })` → `Blob` |
| excel（含 .xlsx .xls 等） | `XLSX.read(originalFileBuffer)` + 修改目標欄 → `XLSX.write({ type:'array' })` → `Blob` |

Excel 組裝邏輯（工作表 AoA 替換策略）與編輯器單檔匯出完全一致，避免行為差異。

### 4-c. ZIP 內檔名（`_batchExportZipFilename`）

```js
function _batchExportZipFilename(f, exportedName) {
    const prefix = (f.sourceLang || f.targetLang)
        ? `${f.sourceLang || ''}-${f.targetLang || ''}_`
        : '';
    return prefix + exportedName;
}
```

### 4-d. 主流程（`batchExportSelectedFiles`）

```
1. getSelectedProjectFileIds() → ids[]
2. ids 為空 → alert → return
3. currentFileId 存在 → confirm 提示
4. JSZip 未載入 → alert → return
5. btn.disabled = true; btn.textContent = '匯出中… (0/N)'
6. for each id:
     取 DB file + segments
     validateExportTags → 收集 tagWarnings（不中斷）
     _batchExportBuildBlob → { blob, filename }
     _batchExportZipFilename → zipName
     zip.file(zipName, blob)
   catch → failures.push
   更新 btn.textContent 進度
7. addedCount > 0 → zip.generateAsync → triggerDownload
8. alert 結果摘要（成功數、失敗清單、tag 警告清單）
9. btn.disabled = false; btn.textContent = '匯出所選'
```

---

## 5. 引入的新相依

| 函式庫 | 版本 | 引入方式 | 用途 |
|--------|------|---------|------|
| JSZip | 3.10.1 | cdnjs CDN `<script>` | 多 Blob 打包成 ZIP |

其餘格式的 Blob 組裝皆沿用已有的 XLSX.js、`DOMParser` / `XMLSerializer`（XLIFF）、`TextEncoder`（PO），無新增相依。

---

## 6. 驗收結果（2026-05-03）

| 情境 | 預期 | 結果 |
|------|------|------|
| 未勾選任何檔案即按匯出 | alert 提示「請先勾選至少一個檔案」 | ✅ 通過 |
| 勾選單一 XLIFF 檔匯出 | 下載 ZIP，解壓後含 `語言對_Translated_原檔名`，譯文正確 | ✅ 通過 |
| 混合格式（XLIFF + PO + Excel）批次匯出 | 下載 ZIP，各格式均正確 | ✅ 通過 |
| 有 tag 不一致的檔案 | ZIP 仍下載（含該檔），匯出後 alert 列出 tag 警告 | ✅ 通過 |
| 編輯器已開啟檔案時觸發批次匯出 | 先出現 confirm 提示 | ✅ 通過 |

---

## 7. 不在此次範圍

- 進度列 UI（按鈕文字計數已足夠）
- 取消批次匯出功能
- 批次匯出的歷程記錄
- 離線模式下 JSZip CDN 不可用時的 fallback（需網路）
