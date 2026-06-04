# Phrase `.mxliff` 作業檔支援 — 實作與驗收紀錄（2026-06）

> **狀態**：已上線並驗收通過（Phrase 可開啟 TMS 匯出之 `.mxliff`）。  
> **技術深文件**（tag 管線、勿隨意改匯出）：[`XLIFF_TAG_PIPELINE.md`](./XLIFF_TAG_PIPELINE.md) §5、§8。  
> **程式觸點速查**：[`CODEMAP.md`](./CODEMAP.md)「Phrase mxliff」列。

---

## 1. 背景與目標

### 1.1 產品需求

- TMS CAT 需能**匯入**、**編輯**、**匯出** Phrase（原 Memsource）產出的 **`.mxliff`** 作業檔。
- 編輯器內行內格式須以 **pill** 顯示（例如 `<#66c5ff>`、`</color>`），譯者能辨識 Excel／Word 格式邊界。
- 匯出檔須能被 **Phrase 桌面版** 正常開啟（不得出現 *Unable to open MXLIFF file*）。

### 1.2 與其他 XLIFF 格式的差異

| 項目 | mqxliff | sdlxliff | **Phrase mxliff** |
|------|---------|----------|-------------------|
| 命名空間 | `mq:` | `sdl:` | `m:`（`http://www.memsource.com/mxlf/2.0`） |
| 行內 tag 常見型態 | `<ph>`、`<bpt>`／`<ept>` 或字面 `{1}` | `<g>`／`<mrk>` 包裝 | **純文字佔位** `{1}`、`{1>…<1}` |
| 格式定義位置 | 元素屬性 | `sdl:seg-defs` | **`m:tunit-metadata`／`m:mark`／`m:content`** |
| `currentFileFormat` | `mqxliff` | `sdlxliff` | **`mxliff`**（獨立分支，非一般 `xliff`） |

### 1.3 代表性驗收樣本

- **檔名**：`oneapp_I2Loc E50 Shadow Strike FOR TRANSLATORS (1)-en_us-zh_tw-PE.mxliff`
- **特性**：`m:file-format="BILING_XLS"`（Excel 雙語）；句段含 `{1}Shadow Strike{2}` 奇開偶關；`m:mark` 內容如 `&lt;#66c5ff&gt;`、`&lt;/color&gt;`。
- **驗收句段**：`trans-unit` id 含 `dc9:3`（VIP Bundle 文案）。

---

## 2. 版本與提交紀錄

| Commit | 日期脈絡 | 摘要 |
|--------|----------|------|
| `ff23f8c` | 第一波 | 接受 `.mxliff`、格式偵測、`{N>…<N}` 合成、`m:confirmed` 匯出、`currentFileFormat = 'mxliff'` |
| `56bbfd0` | 第二波 | `{1}{2}` 成對佔位合成、`readPhraseMarkContentById`、匯出路徑納入 `mxliff`、UI regex 對齊 |
| `e744f50` | 第三波（**Phrase 可開匯出檔**） | 匯出保留 `{N}` 字面量；mark 洩漏修復；依原始 `<target>` 骨架重組缺開標譯文；`tagChipLabelAndFull` tooltip 防禦 |

**驗收確認**：`e744f50` 部署後，使用者以 oneapp 樣本重新匯出，Phrase 可開啟；VIP 句段 `<target>` 含 `{1}…{4}`，無 `&amp;lt;/color&amp;gt;` 夾在譯文內。

---

## 3. 檔案格式（工程視角）

### 3.1 根元素與句段

```xml
<xliff xmlns:m="http://www.memsource.com/mxlf/2.0" … m:version="2.16">
  <file m:file-format="BILING_XLS" …>
    <trans-unit id="…" m:confirmed="0" …>
      <source>…{1}text{2}…</source>
      <target>…{1}譯文{2}…</target>
      <m:tunit-metadata>
        <m:mark id="1"><m:content>&amp;lt;#66c5ff&amp;gt;</m:content></m:mark>
        <m:mark id="2"><m:type>code</m:type><m:content>&amp;lt;/color&amp;gt;</m:content></m:mark>
      </m:tunit-metadata>
    </trans-unit>
  </file>
</xliff>
```

### 3.2 兩種佔位符

| 類型 | 字面量 | 常見來源 | 匯入合成 |
|------|--------|----------|----------|
| Brace | `{1}`、`{2}` | BILING_XLS、部分 Excel 匯出 | `synthesizeMxliffBraceTags` |
| Range | `{1>text<1}` | Word／DOC | `synthesizeMxliffRangeTags`（`{N>…<N}` 掃描） |

奇數 id 為**開**、偶數 id 為**關**（brace 成對）。

---

## 4. 匯入流程

**模組**：[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)

1. **偵測**：`isMxliffFile`（副檔名 `.mxliff` 或根元素 `m:` 命名空間）。
2. **原文／譯文擷取**：`extractTaggedText`；若無 XML 行內元素但原文含 `{N}`／`{N>…`，走合成 tag。
3. **Brace 合成**（`synthesizeMxliffBraceTags`）：
   - `ph`：`{N}` 字面量（Phrase 匯出所需）。
   - `xml`：`m:mark` 的 `m:content`（經 `normalizePhraseMarkXmlForRoundTrip`）。
   - `display`：解碼後供 pill 顯示（`decodePhraseMarkForDisplay`）。
   - `type`：`open`／`close`；`pairNum`／`num` 供 UI 配色。
4. **譯文 tag**：`copyMxliffTargetTagsFromSource` — 若 target 含 `{N}` 但無 `targetTags`，從 `sourceTags` 複製對應 `ph`。
5. **句段欄位**：`sourceFormat: 'mxliff'` 寫入 segment 中繼（供日後篩選／除錯）。

**設計決策（刻意保留）**：`xml` 存 mark 內容**僅供編輯器 pill／tooltip**，不代表匯出時要寫回 `<target>` 文字節點。

---

## 5. 編輯器顯示

**模組**：[`cat-tool/app.js`](../cat-tool/app.js)

| 行為 | 實作 |
|------|------|
| Pill 渲染 | `buildTaggedHtml(text, effectiveTags(seg))` |
| 儲存譯文 | `extractTextFromEditor` — `.rt-tag` 還原為 `data-ph`（`{N}`），**不**把 display 寫進 `targetText` |
| Tooltip | `tagChipLabelAndFull`（`e744f50`）：`display !== ph` 時 tooltip 優先 `display` |
| 開檔格式 | `openEditor`：`currentFileFormat = 'mxliff'` |
| 接受副檔名 | `#sourceFileInput`、`#tmImportInput` 含 `.mxliff` |

---

## 6. 匯出流程（核心）

**模組**：[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) — `exportXliffFamilyToBlob(f, segs, format)`，當 `format === 'mxliff'`。

**觸發**：[`cat-tool/app.js`](../cat-tool/app.js) `#exportBtn`、`batchExportSelectedFiles` → `_batchExportGetFileFormat` 回傳 `mxliff`。

**匯出前準備（目前開啟檔）**：`prepareSegmentsForExport` → `flushTargetEditorsToDbForExport` → `await confirmSideEffectChain` → `flushSegmentStatusToDbForExport` → `segmentsWithEditorTargetsForExport`（合併記憶體中的 `targetText`／`status`）。批次匯出若含目前開啟檔，走相同路徑。

### 6.1 正確行為（`e744f50` 起）

```
原始 XML（originalFileBuffer）
  └── 逐 trans-unit 對應 seg（idValue / globalId）
        ├── repairMxliffTargetForExport（見 §6.3）
        ├── tagsForReplace：xml := ph（字面 round-trip）
        ├── replacePlaceholders → 仍為 {1}{2}…
        ├── 略過 prepareRestoredFragmentForXmlParse / setXmlTargetContent
        ├── targetNode.textContent = restoredXml（純文字）
        ├── 更新 m:confirmed、m:level-edited、target@state
        └── 不修改 m:tunit-metadata / m:mark
```

### 6.2 曾發生的錯誤（Phrase 無法開檔）

**症狀**：匯出 `<target>` 為  
`…《暗影突擊》&amp;lt;/color&amp;gt;…`，**無** `{1}{2}`；Phrase 顯示 *Unable to open MXLIFF file*。

**根因（兩層）**：

1. **匯出邏輯**：`replacePlaceholders` 用 `tag.xml`（mark 內容）取代 `{1}`，再經 `setXmlTargetContent` 當 XML 片段解析 → 字面佔位被毀。
2. **資料狀態**：若曾用錯誤邏輯匯出或譯文已無 `{N}`，僅剩 `</color>` 洩漏在 `targetText` 中；僅做 `xml := ph` 仍會把壞資料原樣寫出。

### 6.3 匯出前修復（`repairMxliffTargetForExport`）

| 步驟 | 函式 | 說明 |
|------|------|------|
| 1 | `repairMxliffMarkLeaksInText` | 將 `&lt;/color&gt;`、`</color>`、`&amp;lt;…&amp;gt;` 等變體**依 tag 順序**還原為 `{N}`；**同一字面（如 `</color>`）對應 {2}、{4} 時逐次 replace，避免都變成 {2}** |
| 2 | `rebuildMxliffTargetFromOriginalStructure(orig, text, tags)` | 若仍缺佔位：僅對 **sourceTags 驗證的 open/close 色標對**（`isMxliffOpenClosePair`）重組；插入開標前若譯文已有 `{N}` 則不重複 |
| 3 | `insertMissingMxliffOpenPlaceholders` | 仍缺開標時，在對應關標前補開標（不把 `{1}` 與 `{4}` 誤當一對） |
| 4 | `collapseDuplicatePhrasePlaceholders` | 收斂連續重複 `{2}{2}` 等（舊 DB 污染安全網） |
| 5 | `tagsForReplace` + `textContent` | 見 §6.1 |

**輔助**：`phraseMarkLeakVariants`、`mxliffPrefixAnchorSuffix`、`isPhrasePlaceholderToken`、`findTagByPh`（避免全域 regex `.test` 在迴圈中誤判）。

**已修（2026-06）**：編輯器全數已確認但匯出仍 `m:confirmed="0"`（匯出未合併／flush `status`）；`:34` 類句段 `{2}{2}`／雙 `{4}`（rebuild 誤把任意相鄰 `{N}` 當色標對）。

---

## 7. 程式觸點總表

| 路徑 | 職責 |
|------|------|
| `cat-tool/js/xliff-build-segments.js` | 匯入、`synthesizeMxliffBraceTags`、`readPhraseMarkContentById` |
| `cat-tool/js/xliff-tag-pipeline.js` | 匯出、`repairMxliffTargetForExport` 全家桶 |
| `cat-tool/js/xliff-import.js` | 呼叫 `buildSegmentsFromXliffXml` |
| `cat-tool/app.js` | `currentFileFormat`、匯出按鈕、`_batchExportGetFileFormat`、`tagChipLabelAndFull` |
| `cat-tool/index.html` | `accept` 含 `.mxliff` |
| `cat-tool/js/file-update.js` | 更新作業檔格式偵測 |
| `public/cat/*` | `npm run sync:cat` 鏡像，勿單獨手改 |

---

## 8. 驗收步驟（白話）

1. 在 CAT 匯入或開啟 **`.mxliff`**（oneapp 樣本即可）。
2. 確認編輯器：VIP Bundle 等句段 **pill 顯示顏色碼**，譯文可編輯。
3. **Ctrl+F5** 強制重新載入（確保載入最新 `/cat` 靜態檔）。
4. 按 **匯出檔案**，下載新檔（勿用舊的錯誤匯出檔比對）。
5. 用文字編輯器開啟匯出檔，搜尋 `VIP Bundle` 或 `dc9:3`：
   - `<target>` 內應有 `{1}`、`{2}`、`{3}`、`{4}`。
   - 譯文內**不應**出現 `&amp;lt;/color&amp;gt;` 這類裸 mark 字串。
6. 用 **Phrase** 開啟該匯出檔 → 應正常進入編輯，無 *Unable to open MXLIFF file*。

**確認狀態（Final Fragment 或 oneapp 樣本）**

7. 將可編輯句段全部確認（進度 100%），**立即**按匯出。
8. 記事本搜尋原為 MT 未確認的 `trans-unit`：應為 `m:confirmed="1"`、`target@state="final"`。
9. Phrase 開匯出檔：先前未確認的 MT 句應顯示已確認。

**Tag 不重複（`Unlock the remaining {1} chapters…` 對應句，`:34`）**

10. 編輯器譯文各 `{1}{2}{3}{4}` 僅一次。
11. 匯出 `<target>`：**不得**出現 `{2}{2}` 或兩個 `{4}`。

**不必**為測匯出邏輯而重匯入舊句段；**若 pill 異常**可刪檔重匯以重建 `sourceTags`。

---

## 9. 限制與已知邊界

| 情境 | 行為 |
|------|------|
| 使用者在編輯器**手動刪除**所有 `{N}` 且無法從 mark 洩漏或原始 `<target>` 對齊 | 匯出可能仍缺佔位；`validateExportTags` 可提示；Phrase 可能可開但顯示結構警告 |
| 僅副檔名為 `.mxliff` 但內文非 Phrase／標準 XLIFF 1.2 | 匯入可能失敗，屬內文相容性問題 |
| 修改 `m:tunit-metadata` 匯出 | **刻意不做**；格式碼須與 Phrase 專案一致 |
| mqxliff 的 T／R1／R2 工作流 | mxliff **不**套用 mq 身分鎖定 |

---

## 10. 維護注意（避免迴歸）

1. **勿**對 `format === 'mxliff'` 呼叫 `setXmlTargetContent` 或 `setExportTargetPlainOrFragment`（除非整體重設計並重驗 Phrase）。
2. **勿**在 mxliff 匯出時用 `tag.xml`（mark）做 `replacePlaceholders`；匯出用物件須 `xml: ph`。
3. 修改 `repairMxliffMarkLeaksInText` 時，須保留**同一 leak 字面對多個 `{N}` 的逐次替換**行為。
4. 變更 `cat-tool/` 後執行 **`npm run sync:cat`** 並一併提交 `public/cat/`。
5. 全域 regex 勿在迴圈中對多 token 重複 `.test`（`lastIndex` 污染）；使用 `isPhrasePlaceholderToken`。

---

## 11. 相關文件

- [`XLIFF_TAG_PIPELINE.md`](./XLIFF_TAG_PIPELINE.md) — §5 Phrase mxliff、§8 修復歷史
- [`CAT_BATCH_EXPORT_PLAN.md`](./CAT_BATCH_EXPORT_PLAN.md) — 批次匯出分流含 `mxliff`
- [`bug-report_mqxliff-tag-issues.md`](./bug-report_mqxliff-tag-issues.md) — 舊版將 `.mxliff` 當一般 `xliff` 的說明（**本專案現已獨立 `mxliff` 格式**）

---

*文件建立：2026-06-01（驗收通過後補齊）。*
