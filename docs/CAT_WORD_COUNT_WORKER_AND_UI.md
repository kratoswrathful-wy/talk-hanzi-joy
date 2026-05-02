# CAT 字數：Web Worker、載入 UI 與「切換字數」行為規格

本文件記錄已討論並**已實作**（持續以程式為準）的項目，作為驗收與後續調整依據。  
既有「原始字數／加權字數」定義與 TM 分桶邏輯見 [`cat-tool/word-count-engine.js`](../cat-tool/word-count-engine.js)；本文件補充**效能**與**介面**行為。

### 決策摘要（架構已定，供實作直接遵循）

| 議題 | 決議 | 說明 |
|------|------|------|
| **§3.2 資料如何進 Worker** | **方案 A** | 主執行緒以 `DBService` 讀取句段與 TM，整理後以 `postMessage` **分批**傳入 Worker。方案 B（Worker 直連 IndexedDB）**不列入第一版**，僅在傳輸／記憶體成為瓶頸時再評估。 |
| **§3.4 併發** | **單一佇列** | 同一時間僅執行**一個**大型加權計算任務；**不**採多 Worker 並行，以避免 CPU 打滿、拖累其他分頁。 |

---

## 1. 背景與問題

加權字數需對每個句段與 TM 做相似度計算（含 Levenshtein），若在**主執行緒**同步跑大量 `analyze()`，會長時間阻塞瀏覽器**繪圖與互動**，出現整頁黑掉、凍結；同網域其他分頁也可能受影響。

---

## 2. 目標（優先順序）

1. **不要求**總計算時間最短；可接受分批、略慢。  
2. **必須**避免長時間占滿主執行緒，讓使用者在計算期間仍能操作 CAT 其他功能。  
3. 盡量降低對同一瀏覽器內**其他分頁**的影響（必要時在 Worker 內限流）。  
4. **不提供**手動「取消」按鈕。  
5. **切頁即停**：離開相關畫面時中止背景計算（見 §5）。

---

## 3. Web Worker 架構（已落地）

**實作狀態**：Dedicated Web Worker 見 [`cat-tool/js/word-count-worker.js`](../cat-tool/js/word-count-worker.js)，載入 [`cat-tool/word-count-engine.js`](../cat-tool/word-count-engine.js) 並呼叫 `WordCountEngine.analyzeAsync`；主執行緒以 `runWcAnalyzeWorker`／`runWcAnalyzeWithFallback`（[`cat-tool/app.js`](../cat-tool/app.js)）封裝，失敗時 fallback 至主執行緒同步 `analyze`。

### 3.1 職責切分

- **主執行緒**：UI、路由、讀取 DB（`DBService`）、顯示進度、組裝／接收 Worker 訊息。  
- **Dedicated Web Worker**：執行與 TM 相關之重算（至少包含現有 `WordCountEngine.analyze` 中需對 TM 掃描與相似度計算之部分；實作時將 engine 拆成**無 DOM 依賴**之純邏輯供 Worker 載入）。

### 3.2 資料如何進 Worker

| 方案 | 說明 | 優點 | 缺點 |
|------|------|------|------|
| **A（預設實作）** | 主執行緒讀句段與 TM，整理成可序列化資料，以 `postMessage` **分批**傳入 Worker。 | 與現有 Dexie 流程一致；除錯直覺。 | 資料量大時有複製成本；需定義分批協定。 |
| **B（備選）** | Worker 內直接存取 IndexedDB。 | 減少主執行緒大包傳輸。 | 與 Dexie 整合較重；列為日後瓶頸再評估。 |

**決議（已定案）**：實作僅採 **方案 A**。方案 B 保留為文件中的備選說明，不實作至程式碼除非日後另有決策。

### 3.3 Worker 內分批與限流

- 以**固定數量句段**為一批處理；批與批之間可插入短延遲，降低 CPU 持續滿載，減輕對其他分頁的影響。  
- 具體批大小與延遲由實作決定，本文件不要求固定數字。

### 3.4 單一佇列

**決議（已定案）**：採 **單一佇列**——同一時間僅執行**一個**大型加權計算任務；**不**以多個 Worker 並行縮短總時間（優先保護整機與其他分頁體驗）。

- 新任務觸發時之排隊／取代策略（例如中止舊 Worker 再啟新工作）由實作註明於程式註解，行為須符合「不並行跑多個重型任務」。

---

## 4. 載入中 UI（計算進行中）

下列情況在「加權」路徑重算時適用：專案檔案列表、句段集列表、編輯器狀態列。

1. **顏色**：進度條使用**中性色**（例如灰或藍灰），**不得**使用目前「原始＝綠／加權＝紅」之**完成態**語意顏色。  
2. **文案**：顯示 **「載入中…」**，並顯示 **「已處理 x / y 個句段」**（或等價、可讀性相同之進度文字）。  
3. **互動**：計算中使用者仍可操作其他 UI（依主執行緒是否尚有其他阻塞而定；Worker 方案目標為主執行緒可持續回應）。

---

## 5. 生命週期：不可取消，切頁即停

- **不提供**「取消計算」按鈕。  
- 下列情況須**中止** Worker 與後續 UI 更新（實作以 `terminate` 或明確中止訊號為準）：  
  - 離開專案詳情／切換至其他主畫面導致目前專案上下文不再適用；  
  - 離開編輯器或切換目前檔案（`currentFileId` 變更）；  
  - 其他「使用者已不在該計算所屬畫面」之導航（細節由實作與程式註解對齊）。

---

## 6. 專案頁與編輯器：「切換字數」行為（補齊先前未實作規格）

### 6.1 工具列按鈕（檔案區、句段集區）

- **按鈕文案**：統一為 **「切換字數」**。  
- **工具提示（`title`）**：**「一次切換所有檔案顯示的字數，目前顯示：原始／加權字數」**  
  - 「目前顯示」須反映**批次切換後**全專案檔案列表所採用之模式（句段集列表若與同一按鈕聯動，於實作註明；若句段集獨立則另列）。

### 6.2 單列進度條可點擊

- **檔案列**：使用者點選**該檔案列上的進度區塊**時，僅切換**該檔案**之顯示模式（原始／加權），**不**影響其他檔案。  
- **句段集列**：點選**該句段集進度區塊**時，僅切換**該句段集**。  
- 狀態須以 **per `fileId` / per `viewId`**（或等價鍵）儲存，不得僅用單一全域旗標代表所有列。

### 6.3 編輯器狀態列

- 使用者點選**狀態列進度條區域**時，切換**目前編輯檔**之顯示模式（與專案列表每列獨立）。  
- 與 §3 Worker 搭配時，加權重算觸發條件與中止條件見 §5。

---

## 7. 已修改的檔案（已落地）

- [`cat-tool/js/word-count-worker.js`](../cat-tool/js/word-count-worker.js)：Dedicated Worker，`analyzeAsync` 與句段進度 `postMessage`。  
- [`cat-tool/word-count-engine.js`](../cat-tool/word-count-engine.js)：Worker 安全之純邏輯與 `analyzeAsync`（含分批讓出）。  
- [`cat-tool/app.js`](../cat-tool/app.js)：進度載入、佇列、中止、per-id 模式、點擊事件；**字數分析 Modal**（`runWordCountAnalysis`、`openWordCountModalWithSelection`、句段集工具列分析等，見 §9）。  
- [`cat-tool/index.html`](../cat-tool/index.html)：`#wordCountModal`、`#btnRunWordCount`、`#wordCountAnalysisProgress`、`#wordCountResultDisclaimer` 等 DOM；「切換字數」按鈕文案與 `title`。  
- 變更後依專案慣例執行 `npm run sync:cat` 並提交 `public/cat/`（見根目錄 [`AGENTS.md`](../AGENTS.md)）。

---

## 8. 與其他文件

- [`docs/CODEMAP.md`](CODEMAP.md) 已有一列連結至本文件；若搬移檔名請同步更新 CODEMAP。

---

## 9. 「字數與 TM 加權分析」Modal（`#wordCountModal`）

專案詳情內可開啟之**字數與 TM 加權分析**對話框；與 §4 列表／編輯器進度條為不同場景，但加權計算同走 `runWcAnalyzeWithFallback` 與 §3 Worker。

### 9.1 入口

| 來源 | 行為（程式錨點） |
|------|------------------|
| **檔案清單** | 勾選一個或多個檔案後開啟：`openWordCountModalWithSelection`（[`cat-tool/app.js`](../cat-tool/app.js)）。 |
| **句段集工具列** | 勾選一個或多個句段集後按「分析」：`btnViewsToolbarWordCount`。 |

### 9.2 分析範圍狀態

- **檔案模式**：`wordCountSelectedFileIds`（開啟自檔案清單時寫入）。  
- **句段集模式**：`window._wordCountAnalysisViews` 為 `{ id, name, segmentIds }[]`（每個句段集一筆）；開啟時 **`wordCountSelectedFileIds` 清空**，且**不再**使用舊版整包 `_wordCountSegmentOverride` 扁平合併。  
- 自檔案清單開啟時：**`_wordCountAnalysisViews` 清空**。  
- **`closeWordCountModal`**：清除 `_wordCountAnalysisViews` 與 `_wordCountSegmentOverride`，避免殘留狀態。

### 9.3 合併範圍與分項分析

- **一律**先對「合併範圍」跑一次分析：句段集模式為各集 `segmentIds` **去重後**依序串成之句段陣列；檔案模式為依序載入各檔句段後串接。  
- 僅當 **多檔**（`fileIds.length > 1`）或 **多句段集**（`viewUnits.length > 1`）時，**另外**對每一檔或每一句段集**各跑一次**獨立分析，並在結果表中以分區標題區隔（「【合併範圍】…」「【分項】…」）。  
- **單檔**或**單一句段集**：不顯示分項區塊；不顯示 `#wordCountResultDisclaimer`。  
- **標註**（`#wordCountResultDisclaimer`）：僅在「多檔或多句段集」時顯示，說明下方各分項為**分開**分析，因檔內重複與 TM 分類計算範圍與合併一次分析不同，**分項加權加總不一定等於**合併範圍總計。

### 9.4 執行中 UX

- **`#btnRunWordCount`**：分析進行中 **`disabled`**，完成後於 `finally` 解除（避免重複觸發）。  
- **`#wordCountAnalysisProgress`**：`role="status"`、`aria-live="polite"`；階段文案包含讀取勾選之 TM、載入句段、合併／分項分析；分析階段並顯示 Worker 回報之**百分比與句段數**（`done/total`）。  
- 完成後短暫顯示「完成」，約 **1.2 秒**後清空進度文字。

### 9.5 本機報告 payload

`DBService.addWordCountReport` 儲存之 `payload` 在既有 `fileIds`、`result`（合併範圍結果）、`includeLocked` 之外，可含：

- **`viewUnitIds`**：句段集模式時各集 `id` 陣列（檔案模式可為空陣列）。  
- **`perUnitResults`**：分項陣列 `{ label, result }[]`；無分項時為 `null` 或省略語意與舊報告相容。

---

## 修訂紀錄

| 日期 | 說明 |
|------|------|
| 2026-05-02 | 初稿：納入 Worker、分批限流、載入 UI、切頁即停、單一佇列、切換字數與單列點擊規格。 |
| 2026-05-02 | 增「決策摘要」：正式採用方案 A、單一佇列；註明程式尚未開工、CODEMAP 已連結。 |
| 2026-05-02 | 實作補充：進專案／編輯器重置為原始字數；單列重算、全表原始並行；混合時工具列只收斂加權→原始；進度條自訂無延遲提示與游標。 |
| 2026-05-03 | §3／§7 改為已落地敘述；新增 **§9** 字數分析 Modal（合併／分項、`_wordCountAnalysisViews`、進度列、按鈕鎖定、標註、報告 `viewUnitIds`／`perUnitResults`）。程式追溯：`3850264`。 |
