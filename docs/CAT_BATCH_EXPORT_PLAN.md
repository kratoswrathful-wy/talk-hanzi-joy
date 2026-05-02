# CAT 批次匯出（ZIP）實作計畫

> 建立日期：2026-05-03  
> 狀態：實作中

---

## 1. 功能描述

在專案頁面「檔案清單」的批次工具列加入「**匯出所選**」按鈕。使用者勾選任意數量的檔案後，按鈕觸發批次匯出：所有檔案的譯文以原格式組裝，打包成單一 ZIP 供下載。

---

## 2. 使用者決策（已確認）

| 項目 | 決定 |
|------|------|
| 交付方式 | 一律 ZIP（不支援逐一下載） |
| ZIP 內檔名 | `{sourceLang}-{targetLang}_Translated_{原檔名}`；無語言對時退回 `Translated_{原檔名}` |
| ZIP 本身檔名 | `批次匯出_{專案名稱}_{YYYYMMDD-HHmmss}.zip` |
| Tag 驗證 | 全部跑完後統一回報哪些檔案有問題（不中途打斷）|
| 部分失敗 | 成功的仍放入 ZIP；失敗的列名稱告知；ZIP 仍下載 |
| flush 提示 | 若有檔案已在編輯器開啟（`currentFileId` 不為空），觸發前顯示 `confirm` 提示使用者先存檔或繼續 |
| 進度回饋 | 按鈕顯示「匯出中…(N/N)」並 disabled；完成後自動恢復 |
| UI 位置 | `#projectFilesToolbar`（與指派、移除等按鈕並列，`secondary-btn btn-sm`） |

---

## 3. 影響範圍

| 檔案 | 變更摘要 |
|------|---------|
| `cat-tool/index.html` | 1. `<head>` 引入 JSZip CDN；2. toolbar 加「匯出所選」按鈕 |
| `cat-tool/js/xliff-tag-pipeline.js` | 新增 `exportXliffFamilyToBlob(f, segs, format)` → `{ blob, filename }`；原 `exportXliffFamily` 改呼叫它 |
| `cat-tool/js/po-import.js` | 新增 `exportPoToBlob(f, segs)` → `{ blob, filename }`；原 `exportPo` 改呼叫它 |
| `cat-tool/app.js` | 新增 `batchExportSelectedFiles()`；按鈕 click 事件綁定 |

---

## 4. 格式判斷邏輯

與編輯器現有邏輯一致，以檔名後綴為主、`fileFormat` 欄位為輔：

```js
function getFileFormat(file) {
    if (file.fileFormat === 'googlesheet') return 'googlesheet';
    const lower = (file.name || '').toLowerCase();
    if (lower.endsWith('.mqxliff'))  return 'mqxliff';
    if (lower.endsWith('.sdlxliff')) return 'sdlxliff';
    if (lower.endsWith('.xlf') || lower.endsWith('.xliff') || lower.endsWith('.mxliff')) return 'xliff';
    if (lower.endsWith('.po') || lower.endsWith('.pot')) return 'po';
    return 'excel';
}
```

---

## 5. Blob 產出邏輯（依格式）

### 5-a. XLIFF 族（xliff / mqxliff / sdlxliff）

重構 `exportXliffFamily`：
- 現有組裝 XML 邏輯不動
- 移除最後的 `<a> download` 觸發
- 改為 `return { blob: new Blob([outputXml], { type: 'application/xml' }), filename }`

原 `exportXliffFamily` 改成呼叫 `exportXliffFamilyToBlob` 後再觸發下載（保持單檔匯出不受影響）。

### 5-b. PO

同上，重構 `exportPo` 拆出 `exportPoToBlob`。

### 5-c. GoogleSheet

在 `batchExportSelectedFiles` 內 inline 處理：
- 用 `XLSX.utils.aoa_to_sheet` + `XLSX.write(wb, { type: 'array', bookType: 'xlsx' })`
- `new Blob([array], { type: 'application/octet-stream' })`
- 檔名：`{langPrefix}_Translated_{原檔名去副檔名}_Translated.xlsx`

### 5-d. Excel

在 `batchExportSelectedFiles` 內 inline 處理：
- 用 `XLSX.read` + 修改儲存格 + `XLSX.write(wb, { type: 'array', bookType: 'xlsx' })`
- 同樣組裝 Blob

---

## 6. `batchExportSelectedFiles()` 流程

```
1. getSelectedProjectFileIds() → ids[]
2. 若 ids 為空 → alert('請先勾選至少一個檔案') → return
3. 若 currentFileId 不為空 → confirm('有檔案在編輯器中，請先儲存後再批次匯出。繼續？')
4. btn.disabled = true; btn.textContent = '匯出中… (0/${ids.length})'
5. const zip = new JSZip()
   const failures = []
   const tagWarnings = []  // { name, issues[] }
   
   for (let i = 0; i < ids.length; i++) {
     btn.textContent = `匯出中… (${i+1}/${ids.length})`
     try {
       f = await DBService.getFile(id)
       segs = await DBService.getSegmentsByFile(id)
       format = getFileFormat(f)
       
       // tag 驗證（收集，不中斷）
       if (Xliff.validateExportTags) {
         const issues = Xliff.validateExportTags(segs)
         if (issues.length) tagWarnings.push({ name: f.name, issues })
       }
       
       { blob, filename } = await buildExportBlob(f, segs, format)
       zip.file(filename, blob)
     } catch (err) {
       failures.push({ name: f?.name || id, err })
     }
   }
   
6. 若 zip 內有至少一個檔案：
   const zipBlob = await zip.generateAsync({ type: 'blob' })
   triggerDownload(zipBlob, `批次匯出_${projectName}_${timestamp}.zip`)
   
7. 組裝結果訊息：
   - 成功：N 個
   - 失敗清單（若有）
   - Tag 警告清單（若有）
   以 alert 顯示

8. btn.disabled = false; btn.textContent = '匯出所選'
```

---

## 7. JSZip 引入方式

`index.html` `<head>` 加：
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

---

## 8. 驗收步驟

1. 進入任意專案，勾選 0 個檔案 → 按「匯出所選」→ 應 alert 提示「請勾選至少一個檔案」。
2. 勾選 1 個 XLIFF 檔 → 下載 ZIP，解壓後確認譯文正確。
3. 勾選混合格式（XLIFF + PO + Excel）→ 下載 ZIP，解壓後每種格式各自正確。
4. 勾選有 tag 問題的檔 → 匯出完成後應出現 tag 警告訊息（ZIP 仍下載）。
5. 在編輯器已開啟某檔案時，從另一分頁觸發批次匯出 → 應先出現提示。

---

## 9. 不在此次範圍

- 進度列 UI（目前按鈕文字已足夠）
- 取消批次匯出功能
- 批次匯出的歷程記錄
