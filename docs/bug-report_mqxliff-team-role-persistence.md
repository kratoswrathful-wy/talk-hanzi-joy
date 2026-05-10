# Bug Report：mqxliff 在 Team（雲端）模式下無法持久化確認身分（T／R1／R2）

> 調查與修正日期：2026-05-10  
> 專案：1UP TMS — CAT 內嵌（`cat-tool/`）與團隊後端（[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)）  
> 相關程式修正 commit：`d9295c1`（`fix(cat): persist mqxliff original_role and confirmation_role in Team mode`）

本文採雙層結構：**Part 1** 用白話說明現象、原因與修正後行為；**Part 2** 為技術細節與資料流，供維運／AI 日後查閱。

---

## Part 1 — 白話摘要

### 1.1 使用者看到什麼（現象）

- 在 **Team 模式**（資料存在 Supabase，透過雲端 RPC 讀寫）下匯入 **mqxliff** 後，畫面上「Key」欄可能仍帶有角色名稱等**字串識別**（那是檔案裡的**鍵值／脈絡**，不是本 bug 的主題）。
- 與 **memoQ 工作流程身分**（譯者 T、審校一 R1、審校二 R2）有關的是：**狀態欄**應顯示單勾 ✓、✓+、雙勾 ✓✓，以及「在目前選的身分下，某句是否禁止編輯」。
- **修正前**：同一檔在雲端上，**重新開啟檔案或重新整理**後，已確認句段往往**一律顯示成單勾**（如同全部是 T 確認）；且 **R1／R2 已確認的句段**，在較低權限身分下仍可能被編輯——與 memoQ 匯出檔內紀錄不一致。
- **本機模式**（瀏覽器 IndexedDB、不經雲端 RPC）則**較少**出現上述「重開就丟身分」的現象。

### 1.2 白話結論：問題出在哪裡

可以把流程想成兩段：

1. **讀檔、解析 mqxliff**（在瀏覽器裡完成）：程式其實**有**從 XML 推斷每句是誰確認的（例如 memoQ 的 `<commitinfo>` 或 `mq:status`），並放在記憶體裡的 `originalRole`、`confirmationRole`。
2. **存進雲端資料庫**：舊版後端在「寫入句段」與「讀回句段」時，**沒有對應的欄位**，也沒把這兩個值寫進 Postgres；確認後更新狀態時，**多傳的 `confirmationRole` 也被忽略**。因此一重新載入，畫面上就只剩「有確認／沒確認」，**看不出是 T、R1 還是 R2**。

**「身分」若指 Key 裡的角色名**：那是匯入時寫進 `id_value`／脈絡文字，本來就會顯示；本 bug 指的是 **memoQ 審校流程身分** 在雲端的**遺失**。

### 1.3 修正後行為（概要）

- 資料庫 `cat_segments` 表新增 **`original_role`**、**`confirmation_role`** 兩欄（文字，可為空）。
- 匯入時把解析結果寫入；使用者確認／變更狀態時把 **`confirmation_role`** 一併更新。
- 讀回句段時還原為 `originalRole`、`confirmationRole`，與 `cat-tool/app.js` 既有邏輯（鎖定規則、圖示）一致。

### 1.4 仍須注意的限制

- **在修正上线前就已匯入雲端**的句段：資料庫裡這兩欄為 **NULL**，**不會自動**從舊列補回 memoQ 身分。若要與檔案完全一致，需**重新匯入**該 mqxliff（或依你們維運流程重灌該檔句段）。**修正後新匯入**的檔案會帶正確值。
- **本機模式**未改程式行為：本來就會把 `extra` 展開寫入 IndexedDB；本次主要補齊 **Team／Supabase** 路徑。

### 1.5 白話驗收（與產品驗收一致）

1. Team 專案匯入含多階段確認的 mqxliff。  
2. 開檔後看狀態欄圖示（✓／✓+／✓✓）是否合理。  
3. **重新整理或關閉再開同一檔**，圖示應**維持**，不應全部變成單一 ✓。  
4. 以 **T_DENY_R1** 開檔：若句段在檔案中為 **R1 已確認**，譯文欄應**無法編輯**（與設計一致）。

---

## Part 2 — 技術細節

### 2.1 資料來源（匯入解析）

[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 在 `isMqxliffFile` 為真時，對每個 `trans-unit`：

- 掃描子元素 `commitinfo`（`localName === 'commitinfo'`），由 `role` 數值對照 `1000→T`、`2000→R1`、`3000→R2`，並略過無效使用者或 `0001-01-01` 時間戳，取**最後一筆有效**紀錄寫入 `originalRole`。
- 若仍無：fallback 讀 `mq:status`（如 `Reviewer1Confirmed` → R1、`Proofread`／`Reviewer2Confirmed` → R2 等）。
- 若有 `originalRole`，程式會同步設 `confirmationRole` 並將 `status` 設為 `confirmed`（與 memoQ 已確認句段一致）。

此物件隨後由 [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) 呼叫 `DBService.addSegments` 送往後端。

### 2.2 根因（三處斷點，均在雲端 RPC）

Team 模式下 [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) 的 `handleCatCloudRpc`：

| 環節 | 問題 |
|------|------|
| `db.addSegments` | 組出的 Postgres row **未包含** `original_role`、`confirmation_role`；`cat_segments` 表**原本無此欄**，插入時等價丟棄語意。 |
| `mapSegmentRow` | 讀回 `select *` 後**未映射**上述欄位，前端 `seg.originalRole`／`seg.confirmationRole` 恒為 `undefined`。 |
| `db.updateSegmentStatus` + `segmentExtraCamelToSnake` | `app.js` 會傳 `extra: { confirmationRole: 'T' \| 'R1' \| 'R2' }`，但 `segmentExtraCamelToSnake` **未處理** `confirmationRole`，更新語句不會寫入任何對應欄位。 |

`apply_cat_segment_target_update`（Postgres RPC）僅處理 `match_value`、`is_locked_*`、`target_tags` 等，**與本問題無關**；`confirmationRole` 主要走 `updateSegmentStatus`。

### 2.3 修正內容

1. **Migration** [`supabase/migrations/20260510130000_cat_segments_mq_roles.sql`](../supabase/migrations/20260510130000_cat_segments_mq_roles.sql)  
   - `ALTER TABLE public.cat_segments ADD COLUMN IF NOT EXISTS original_role text;`  
   - `ADD COLUMN IF NOT EXISTS confirmation_role text;`

2. **`cat-cloud-rpc.ts`**  
   - `db.addSegments`：對每筆 segment 寫入 `original_role`、`confirmation_role`（由 `s.originalRole`、`s.confirmationRole` 而來；空字串正規化為 `null`）。  
   - `segmentExtraCamelToSnake`：若 `extra` 含 `confirmationRole` 且為字串，則輸出 `confirmation_role`（否則 `null`）。  
   - `mapSegmentRow`：讀取 `r.original_role`、`r.confirmation_role` 映射為 `originalRole`、`confirmationRole`（空字串視為 `null`）。

3. **部署**：於連線專案執行 `supabase db push` 套用 migration（與 [`docs/HANDOFF.md`](HANDOFF.md)、[`docs/DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) 慣例一致）。

### 2.4 與前端邏輯的銜接

[`cat-tool/app.js`](../cat-tool/app.js) 已存在：

- `computeForbiddenForRole(seg, role)`：依 `seg.originalRole` 與目前 session 身分決定是否禁止編輯。  
- 狀態欄繪製：依 `seg.confirmationRole` 顯示 ✓／✓+／✓✓。  
- `persistSegStateToDb` 等路徑：mqxliff 時透過 `DBService.updateSegmentStatus(..., { confirmationRole })` 寫庫。

**修正前**雲端無欄位與映射，上述資料在重新載入後遺失；**修正後**與本機行為對齊。

### 2.5 調查過程紀要（供日後類案參考）

1. 使用者回報 mqxliff 在畫面上無法區分「身分」，並提供檔名與畫面（Key 含角色名，狀態皆為綠勾）。  
2. 程式碼檢視：`xliff-build-segments.js` 已寫入 `originalRole`／`confirmationRole`；`xliff-import.js` 僅對檔案層寫入 `defaultMqRole`。  
3. 查 Supabase `cat_segments` 欄位清單：無角色相關欄位；`db.addSegments` 映射確認未傳入。  
4. 查 `mapSegmentRow`、`segmentExtraCamelToSnake`：讀寫雙向皆缺。  
5. 擬定計畫：僅新增兩欄與 RPC 映射，不變更 `apply_cat_segment_target_update`、不變更 `cat-tool` 匯入解析（已正確）。  
6. 實作、db push、驗收通過後撰寫本文件。

### 2.6 相關檔案索引

| 檔案 | 角色 |
|------|------|
| [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) | mqxliff 句段層級 `originalRole`／`confirmationRole` 推斷 |
| [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) | 匯入流程、檔案層 `defaultMqRole` |
| [`cat-tool/app.js`](../cat-tool/app.js) | 鎖定規則、狀態圖示、`updateSegmentStatus` 呼叫 |
| [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) | Team 模式句段 CRUD 與欄位映射 |
| [`cat-tool/db.js`](../cat-tool/db.js) | 本機 `updateSegmentStatus` 以 `...extra` 寫入（本 bug 不影響本機） |

---

## 修訂紀錄

| 日期 | 說明 |
|------|------|
| 2026-05-10 | 初版：記錄問題發現、根因、修正與驗收要點。 |
