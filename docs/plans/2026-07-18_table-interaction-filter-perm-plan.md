狀態：部分上線／後續進行中（見 §0 完成定義）

# 執行計畫：表格可編輯欄互動統一＋篩選排序全欄位＋權限可見性稽核（工項 A–C）

日期：2026-07-18（結案定義更新 2026-09-06）  
來源工單：`工單_表格互動統一與篩選排序權限稽核_2026-07-18.md`  
適用範圍：案件、內部註記、費用、稿費請款、客戶請款五個模組的總表  
流程：計畫已審核通過；本檔為 docs-only 留存。功能實作另開獨立分支／PR。

---

## 0. 完成定義（強制；2026-09-06）

| 狀態 | 意義 |
|---|---|
| **已寫程式** | 功能分支／commit 存在 |
| **已測試** | 單元／定向／UI 驗收有證據 |
| **已上線** | 正式 deployment 含該變更 |

不得僅因本檔或舊勾選 completed 就判定正式站已有功能。

### 0.1 現況對照（相對正式 `bbfa5cb3`／`dpl_4Zc3teyF23yWZ4cPhd5yvatdNGMz`）

| 項目 | 已寫程式 | 已測試 | 已上線 | 備註 |
|---|---|---|---|---|
| 工項 A：譯者／工作類型單擊即開 | 是（`feat/table-inline-edit-a` 等） | 曾驗 | **視 main／正式線是否含該 commit** | 與「選單空桶」是不同缺陷 |
| **案件總表工作類型選單鍵**（`fieldKey`→`taskType`） | **是**：沿用 `7ebfb567` 最小修正，重植於 `fix/cases-worktype-on-gate2-prod`（基準 `bbfa5cb3`） | **是**：`case-table-select-field-keys` 回歸＋全量 vitest／typecheck／lint／encoding／forbidden-casts／build | **否**（正式仍為 `bbfa5cb3`；待審核合併／部署） | 選項鍵 `taskType`；案件值 `workType`／DB `work_type` 不改名 |
| 工項 B／C 其餘 | 見原章節 | — | — | **不**混入本輪 |

### 0.2 後續保留（不刪、不偷改規則、不全部混進本輪）

- LMS 表格編輯一致性（其餘模組行內編）
- CAT 編輯操作
- 分段指派與同步
- 匯入流程
- 私人檢視等需求

權威發布結案：[`docs/GATE2_FINAL_WINDOW_CHECKLIST_2026-09.md`](../GATE2_FINAL_WINDOW_CHECKLIST_2026-09.md)。

---

## 1. 模組對照

| 工單用語 | 產品側欄 | 路由 | 總表頁面 |
|---|---|---|---|
| 案件 | 案件管理 | `/cases` | `src/pages/CasesPage.tsx` |
| 註記 | 內部註記 | `/internal-notes` | `src/pages/InternalNotesPage.tsx` |
| 費用 | 費用管理 | `/fees` | `src/pages/TranslatorFees.tsx` |
| 稿費 | **稿費請款** | `/invoices` | `src/pages/InvoicesPage.tsx` |
| 請款 | **客戶請款** | `/client-invoices` | `src/pages/ClientInvoicesPage.tsx` |

已確認：稿費＝側欄「稿費請款」（`/invoices`）。費用表內的「稿費總額」等金額欄不是獨立模組。

---

## 2. 審核通過的決定項（2026-07-18）

1. **工項 A 範圍（最小）**：只修案件 `translator`、`workType` 單擊即開＋版面穩定，並做共用路徑回歸。內部註記／稿費請款／客戶請款的總表行內編輯**不在本次**，另開工單。
2. **多人協作交期**：總表維持唯讀，走既有協作對話框。
3. **費用 8 個 orphan metas**：補進總表＋開放篩選／排序；可見性必須過工項 C（依 W10 §9.2），譯者不可見客戶側欄位。實作排在 **C 稽核完成後，與工項 B 一起收**。
4. **工項 C 權威**：(a) 費用／稿費請款／客戶請款嚴格依 W10 §9.2 稽核修補；案件／內部註記角色×欄位矩陣缺定稿 → **暫緩不動權限邏輯**，待定案後另交辦。
5. **篩選／排序豁免**：列選取 checkbox、開啟按鈕。
6. **選單開放範圍**：「屬性可打開的全部欄」（含預設隱藏欄），一律受 C 確認後的權限規則約束。

---

## 3. 依賴與分支策略

| 順序 | 工項 | 建議分支 | 說明 |
|---|---|---|---|
| 可即刻 | **A** | `feat/table-inline-edit-a` | 與 C 平行；不依賴 B |
| 1（權限） | **C** | `feat/table-perm-audit-c` | 僅費用／稿費請款／客戶請款；依 W10 §9.2 |
| 2（等 C） | **B** | `feat/table-filter-sort-b` | 含 orphan 8 欄補欄；選單受 C 約束 |

- 每工項獨立 PR、獨立驗收；禁止堆同一分支。
- migration（如有）一律 `supabase db push`；禁止 MCP 直套。
- 既有使用者視圖（欄序／欄寬／篩選）不得損毀。

```text
A 分支 ──────────────────────────► PR A
C 分支（費用／請款）──► PR C
                         └─► B 分支（含 orphan 8）──► PR B
案件／註記權限 ── 暫緩，另交辦
```

---

## 4. 工項 A：可編輯儲存格互動統一

### 4.1 根因（已核對）

| 路徑 | 行為 |
|---|---|
| 標竿：案件 `status` | `InlineEditCell` → `type="select"`，掛載時 `open` 強制為真 |
| 對照：費用 `assignee` | `colorSelect` + `defaultOpen` → 單擊即開 |
| 缺陷：案件 `translator`／`workType` | `multiColorSelect`；`InlineEditCell` 未傳 auto-open；`MultiColorSelect` 無 `defaultOpen` |

共用殼層：`src/components/fees/InlineEditCell.tsx`  
多選元件：`src/components/MultiColorSelect.tsx`

### 4.2 本次實作範圍

1. 為 `MultiColorSelect` 加 `defaultOpen`（比照 `ColorSelect`）。
2. `InlineEditCell` 的 `multiColorSelect` 分支傳入 `defaultOpen`，並處理關閉後退出編輯（避免版面跑位）。
3. 回歸：案件譯者、工作類型；費用各型別各抽一欄；唯讀欄不得變可編。
4. **不做**：註記／兩種請款總表行內編；多人協作交期總表可編；案件客戶／聯絡人等唯讀欄改可編。

### 4.3 案件總表欄位盤點（摘要）

| key | 顯示名 | 型別 | 可編？ | 本次達標目標 |
|---|---|---|---|---|
| status | 狀態 | 下拉 | 是 | 已是標竿，不改行為 |
| workType | 工作類型 | 多選色票 | 是 | **修：單擊即開＋版面穩定** |
| translator | 譯者 | 多選色票 | 是 | **修：單擊即開＋版面穩定** |
| translationDeadline／reviewDeadline | 交期 | 日期／條件 | 條件 | 多人協作維持唯讀 |
| 其餘可編欄（title、category、billingUnit…） | — | 文字／下拉／日期 | 是 | 回歸抽查，預期已達標 |
| client／contact／createdAt 等 | — | 唯讀 | 否 | 維持唯讀 |
| 選取／開啟 | — | 動作 | — | 豁免篩選排序 |

費用總表：未鎖定時大致已達標；鎖定屬業務規則。註記／兩種請款總表無行內編 → 本次不適用。

### 4.4 驗收（A）

1. 案件譯者欄、工作類型欄：單擊即開選單；選擇後圖示／文字位置正確。
2. 費用抽查各型別至少一欄：單擊可編、儲存後顯示正常、重新整理後資料保持。
3. 唯讀欄仍不可編；多人協作交期仍走協作對話框。

---

## 5. 工項 C：權限可見性稽核（費用／請款側）

### 5.1 權威出處

| 出處 | 用途 |
|---|---|
| `docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md` **§9.2** | 擁有者裁定：列級＋欄位白／黑名單＋客戶請款譯者不可見 |
| migrations `20260703140000_*`、`20260704010000_*`、`20260704020000_*` | RLS、`fees_visible`、寫入僅 admin |
| `docs/CODEMAP.md` 費用段 | 讀取須走 `fees_visible` |

### 5.2 W10 §9.2 摘要（實作依據，不另發明）

- **列級**：譯者僅見本人（`assignee`／`translator`＝`display_name`）；`fees` 另須非草稿。PM／執行長見全部。
- **費用欄位白名單（譯者）**：標題、譯者、稿費請款狀態、開立狀態、相關案件、稿費請款單連結、稿費內容（任務類型／計費單位／單價／單位數／小計／總額等）、費用相關備註、變更紀錄（白名單條目）、建立者／建立時間。
- **禁區（譯者）**：營收整區塊（含客戶端任務類型／客戶報價／營收總額／利潤／關鍵字／客戶 PO#／對帳／請款完成／費用群組／派案途徑）、客戶／聯絡人／客戶請款狀態／客戶案件單連結、內部備註等。
- **客戶請款**：譯者完全不可見（路由／側欄／RLS）。
- **技術**：列靠 RLS；欄位靠 view／RPC 遮罩；禁止只靠前端隱藏。Realtime 非管理員須重查遮罩來源。

### 5.3 本次 C 執行內容

1. 對費用／稿費請款／客戶請款：比對前端總表欄位可見性、篩選／排序選單、屬性欄清單與 W10／`fees_visible`／RLS 是否一致。
2. 修補「側門」：無權欄位不得出現在篩選／排序／欄位設定；API／store 回應不得原樣送達無權資料。
3. 核對 PermissionsPage module key 與列表頁 `checkPerm` key 是否對得上（現況可能不一致）；僅在與 W10 衝突或造成洩漏時修正，不擅自改產品語意。
4. **不做**：案件、內部註記的權限邏輯變更（缺定稿）。

### 5.4 驗收（C）

1. 譯者／PM／執行長各登入：費用與兩種請款符合 §9.2。
2. 譯者：客戶請款不可見；費用禁區欄不在表／選單；本人列以外為 0。
3. 直接查 API／store（或 DB 測試腳本）驗證無權資料不在回應中。

---

## 6. 工項 B：篩選與排序（含 orphan 8 欄）

**前置**：工項 C（費用／請款側）完成並確認權限矩陣後才開分支。

### 6.1 通則

- 屬性可打開的全部欄（含預設隱藏）皆須出現在篩選與排序選單。
- 一律受 C 確認後的權限規則約束（譯者見不到的欄不得進選單）。
- 豁免：列選取 checkbox、開啟按鈕。
- 運算子依型別：文字（包含／等於）、日期（區間）、下拉（等於／不等於）、數字（大小比較）。

### 6.2 盤點現況（計畫階段）

| 模組 | 表頭 vs 篩選／排序 | 備註 |
|---|---|---|
| 案件 | 對齊 | 含預設隱藏欄已在 metas |
| 內部註記 | 對齊 | |
| 稿費請款 | 對齊 | |
| 客戶請款 | 對齊 | |
| 費用 | **8 orphan metas** | 見下 |

### 6.3 費用 orphan 8 欄（與 B 一同收）

| key | 語意側 | 對譯者（W10） |
|---|---|---|
| `feeTaskType` | 稿費工作類型 | 白名單（可見） |
| `feeBillingUnit` | 稿費計費單位 | 白名單 |
| `feeUnitCount` | 稿費單位數 | 白名單 |
| `feeUnitPrice` | 稿費單價 | 白名單 |
| `clientTaskType` | 客戶端任務類型 | **禁區** |
| `clientBillingUnit` | 客戶計費單位 | **禁區** |
| `clientUnitCount` | 客戶單位數 | **禁區** |
| `clientUnitPrice` | 客戶單價 | **禁區** |

實作要點：

1. 將上述 8 key 納入費用總表 `allColumnDefs`（可預設隱藏，但屬性可打開）。
2. 放寬／對齊 `permittedFieldKeys` 與 `fieldMetas`，使篩選／排序選單出現這些欄。
3. 顯示與選單可見性：client 側四欄對譯者隱藏（前端＋確認資料層已遮罩）；fee 側四欄譯者可見本人列。
4. 不得破壞既有視圖設定。

### 6.4 驗收（B）

1. 逐模組打開篩選／排序：與「屬性可打開的全部欄」一致（豁免項除外）。
2. 費用 orphan 8 欄：PM 可見可篩；譯者僅 fee 側、無 client 側。
3. 本次新增欄位各實測一次篩選／排序結果正確。

---

## 7. 共用基礎設施（參考）

| 用途 | 路徑 |
|---|---|
| 行內編輯殼層 | `src/components/fees/InlineEditCell.tsx` |
| 單選色票 | `src/components/ColorSelect.tsx` |
| 多選色票 | `src/components/MultiColorSelect.tsx` |
| 篩選／排序工具列 | `src/components/fees/FilterSortToolbar.tsx` |
| 費用欄位鎖定 | `src/lib/fee-field-locks.ts` |

---

## 8. 紅線（沿用工單）

1. 唯讀欄不得因工項 A 變成可編輯。
2. 工項 B 不得先於 C 就把敏感欄位開進篩選／排序。
3. 找不到權限規範時禁止自訂規則（案件／註記暫緩即此條）。
4. 既有資料與使用者視圖設定不得遺失或損壞。
5. migration 走 `db push`；禁止 MCP 直套。

---

## 9. 動工順序（審核通過後）

1. ~~docs-only：本計畫檔進 repo~~（本 commit）
2. **A**：開 `feat/table-inline-edit-a`，修 `MultiColorSelect`／`InlineEditCell`，獨立 PR。
3. **C**：開 `feat/table-perm-audit-c`，費用／請款側稽核修補，獨立 PR。
4. **B**：C 合併或驗收通過後，開 `feat/table-filter-sort-b`（含 orphan 8），獨立 PR。

---

## 10. 暫緩／另開工單

| 項目 | 狀態 |
|---|---|
| 內部註記／稿費請款／客戶請款總表行內編輯 | 另開工單 |
| 案件／內部註記角色×欄位權限定稿與實作 | 待擁有者定案後另交辦 |
| 多人協作交期總表可編 | 不做（維持唯讀＋協作對話框） |
