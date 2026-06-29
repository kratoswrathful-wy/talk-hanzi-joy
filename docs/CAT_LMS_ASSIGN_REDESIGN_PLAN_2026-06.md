# CAT／LMS 派案介面與同步邏輯重構規劃（2026-06）

> **狀態**：**規劃中**（靜態預覽階段，尚未動程式）。
> **預覽**：[`docs/preview-cat-assign/index.html`](preview-cat-assign/index.html)
> **緣由**：多人協作案件出現「所有譯者顯示『整檔』、開檔卻無法編輯」回報；調查後發現派案的指派資料分散在兩套系統、同步觸發零碎、譯者以名字配對易靜默失敗，且 CAT 內建指派介面過於陽春，導致實務上大家只在 LMS 派工。
> **關聯既有文件**：
> - [`docs/CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) — Phase B Workflow 完整規格（本案在其基礎上重構派案層）
> - [`docs/CAT_WORKFLOW_PREP_DISPATCH_DECOUPLE_2026-06.md`](CAT_WORKFLOW_PREP_DISPATCH_DECOUPLE_2026-06.md) — `accepted` SQL 過濾的由來（本案的直接觸發點）
> - [`docs/CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) — 顯示層狀態

---

## 1. 問題摘要（根因）

| # | 症狀 | 根因 |
|---|------|------|
| A | 多人案件檔案清單所有譯者顯示「整檔」 | `cat_stage_assignments` 查無段落指派 → `wf-display-status.js` fallback 顯示「`{name}（整檔）`」把缺資料偽裝成正常整檔 |
| B | 譯者開檔顯示「禁止編輯：未受指派，無法編輯檔案」 | `resolveFileUnassignedReadOnly` 查無該人指派 → 全檔唯讀。與 A 同根因 |
| C | 指派沒被寫入 | `sync_cat_workflow_assignments_for_case` 自 `20260623131500` 起多人路徑只處理 `accepted = true` 的協作列；但「已派出」後 UI 勾選框變「任務完成」，`accepted` 無法再勾，於是同步整段跳過 |

### 1.1 延伸的結構性問題

| 項目 | 說明 | 程式位置 |
|------|------|----------|
| 兩套指派系統並存 | 檔案層級 `cat_file_assignments`（CAT 內建視窗、`CAT_ASSIGN_FILE` 訊息）與段落層級 `cat_stage_assignments`（LMS 協作表格）各自為政；編輯權限與清單顯示卻同時參考兩者 | `cat-tool/app.js` `resolveFileUnassignedReadOnly`、`openFileAssignModal`；`src/stores/case-store.ts` |
| 觸發條件零碎 | `shouldSyncCatWorkflowAssignments` 為 4 條件布林 OR，漏一條就不同步 | `src/stores/case-store.ts` §386–395 |
| 名字配對脆弱 | `cat_resolve_profile_id` 以 `display_name`／`email` 比對；改名、同名（`LIMIT 1` 任挑）、凍結重邀皆會靜默失敗 | `supabase/migrations/20260610140000_*.sql` |
| 靜默跳過 | SQL 充斥 `CONTINUE`、`EXCEPTION WHEN OTHERS THEN NULL`；配不到譯者／未連結檔案的列無聲消失，PM 無回饋 | `sync_cat_workflow_assignments_for_case` |
| CAT 指派介面陽春 | `fileAssignModal` 僅平面人員勾選清單：無翻譯／審稿之分、無列範圍、無交期 | `cat-tool/index.html` §2511、`cat-tool/app.js` `openFileAssignModal` |
| 「拆分」名不符實 | 工具列「拆分」只計算工作量均分（參考用），不送出指派；使用者誤以為能拆完直接派 | `cat-tool/app.js` `splitAssignModal` |

### 1.2 「UUID 已在手上卻被丟棄」

協作表格選人時，選單每個選項本就帶 profile UUID，但選定瞬間只存了顯示名稱：

```text
select-options-store.ts  →  options.push({ id: String(p.id), label: p.display_name || p.email, ... })
ColorSelect.tsx          →  onValueChange(opt.label)   // 只送 label，UUID 被丟棄
```

故 `collab_rows[].translator` 存的是名字字串，SQL 端再用名字反查 UUID。改用 UUID 配對屬「保留既有資料、別丟棄」，工程量小。

---

## 2. 產品決策（2026-06-29，與專案擁有者確認）

| # | 議題 | 定案 |
|---|------|------|
| 1 | CAT 指派細緻度 | **完整**：角色（翻譯／審稿）＋列範圍＋交期，與 LMS 協作表格對等 |
| 2 | 「拆分」功能 | **接上指派**：拆分計算結果直接預填指派表，PM 微調後送出 |
| 3 | `cat_file_assignments`（檔案層級舊表） | **淘汰**，統一改用 `cat_stage_assignments` |
| 4 | 同步觸發策略 | **過度同步**：派案相關欄位（`collab_rows`／`translator`／`reviewer`／`status`）任一變動即重跑冪等同步，寧可多跑不漏跑 |
| 5 | 譯者配對 | **改用 UUID（雙寫）**：存名字供顯示、存 `*_user_id` 供配對；同步優先用 UUID，配不到再退回名字 |
| 6 | 失敗回報 | **不靜默失敗**：同步收集「配不到帳號的譯者／未連結檔案」清單，回傳前端以 toast 提示 PM |
| 7 | 單一事實來源 | **做法甲**：CAT 與 LMS 兩介面都保留，但底層共用同一同步函式、寫同一張 `cat_stage_assignments` |
| 8 | 進行方式 | **先做靜態 HTML 預覽**確認版面，通過後再分階段實作 |

---

## 3. 目標體驗

1. PM 在 **LMS 協作表格** 或 **CAT 指派視窗** 任一處派工，結果一致、互不打架。
2. CAT 指派視窗可指定：每列「翻譯／審稿」角色、負責列範圍、交期；可新增多列；可從「拆分」一鍵預填。
3. 任一相關欄位變動後，指派即時同步；不再因狀態或勾選框語意切換而漏同步。
4. 指派若有譯者配不到帳號或檔案未連結，PM 立即收到明確提示（含名單），而非事後譯者開檔才發現不能編輯。
5. 檔案清單「整檔」只在真的整檔指派時出現；查無指派改顯示明確警示。

---

## 4. 預計變更觸點（實作階段；本次僅文件＋預覽）

| 層 | 檔案 | 變更方向 |
|----|------|----------|
| 預覽 | `docs/preview-cat-assign/index.html` | 新版 CAT 指派視窗版面、拆分→預填流程、現況檢視、資料模型註解 |
| 後台 | `supabase/migrations/<new>.sql` | `sync_cat_workflow_assignments_for_case` 改寫：移除依賴 `accepted` 的硬性過濾（改依案件狀態判定）、收集失敗名單回傳、優先用 `*_user_id`；新增 `translator_user_id`／`reviewer_user_id`（雙寫）；淘汰 `cat_file_assignments` 寫入路徑 |
| 後台 | `src/stores/case-store.ts` | `shouldSyncCatWorkflowAssignments` 收斂為「相關欄位一變即同步」 |
| LMS | `src/components/CollaborationTable.tsx`、`src/components/ColorSelect.tsx`、`src/data/case-types.ts` | 選人時雙寫 UUID；協作列加「CAT 同步狀態」徽章 |
| LMS | `src/pages/CaseDetailPage.tsx` | 接收同步失敗名單並 toast |
| CAT | `cat-tool/index.html`、`cat-tool/app.js`（`openFileAssignModal`、`splitAssignModal`）、`cat-tool/js/wf-display-status.js` | 平面勾選清單 → 協作式指派表格；拆分接上指派；「整檔」顯示與查無指派區分。改完跑 `npm run sync:cat` |
| 遷移 | 一次性 backfill 腳本 | 舊 `collab_rows` 名字 → `*_user_id`；舊 `cat_file_assignments` → `cat_stage_assignments`；產出配不到名單報告 |

> 上表為實作藍圖，**本次提交不含程式變更**，僅供後續分階段對照。

---

## 5. 分階段實作計畫與進度

| 階段 | 範圍 | 產出 | 狀態 |
|------|------|------|------|
| P1 | 靜態預覽 | `docs/preview-cat-assign/index.html` + 本文件 | **已完成** |
| P2 | 後台統一 | `20260629140000_*.sql`：同步改寫（狀態判定取代 `accepted`）、`cat_resolve_profile_id_dual`、回傳失敗報告 | **已實作（待 db push）** |
| P4 | LMS 端 | `CollabRow.translatorUserId/reviewerUserId` 雙寫、`case-store` 過度同步、配不到譯者 toast、`wf-display-status` 顯示區分 | **已實作（typecheck 通過）** |
| P5a | 資料回填 | migration 內回填既有 `collab_rows` 名字→UUID | **已實作（待 db push）** |
| P3 | CAT 介面 | 協作式指派表格、拆分均分預填、單一來源寫回（採 §5.1 方案 A） | **已實作（待驗收）** |
| P5b | 舊表遷移 | `cat_file_assignments` → `cat_stage_assignments` 並淘汰 | **延後**（多人路徑已不經舊表；全面拆除待 P3 驗收後另案） |

### 5.1 P3 關鍵設計抉擇（單一事實來源）

`sync_cat_workflow_assignments_for_case` 會刪除連結檔上 `collab_row_id IS NULL` 的翻譯指派。
故對「已連結多人協作案件」的檔案，CAT 端若直接寫整檔／段落指派（`collab_row_id` 為空），**會在下次同步被刪除**（雙系統衝突）。

為維持決策 §2-#7「單一事實來源」，P3 採：

- **已連結多人案件的檔案**：CAT 指派視窗 = 編輯該案 `collab_rows`（透過 iframe 訊息寫回 LMS），再觸發同步。CAT 不自建 `collab_row_id` 為空的指派。
- **未連結 / 單人 / 獨立 CAT 檔**：CAT 視窗直接寫 `cat_stage_assignments`（同步不會刪除這類檔的指派，或根本不跑同步）。

此設計需新增跨框架訊息（讀／寫案件協作列）與 CAT 端協作式表格 UI，屬較大且具風險之子工程（動 `cat-tool/app.js`、須 `sync:cat`、無法於此環境即時測 iframe 互動）。

**已採方案 A 實作（2026-06-29）**：

- 新增兩個 CAT cloud RPC action（`src/lib/cat-cloud-rpc.ts`）：
  - `lms.getCaseCollabForFile`：由 `cat_files.related_lms_case_id` 找到連結案件，回傳 `multiCollab`、`collabRows`、`reviewer`、`caseTitle` 等。
  - `lms.updateCaseCollab`：寫回完整 `collab_rows` 後立即呼叫 `syncCatWorkflowAssignmentsForCase`，回傳未解析譯者報告。
- CAT 端（`cat-tool/index.html` 新增 `#catCollabAssignModal`、`cat-tool/app.js` 新增 `openCatCollabAssignModal` 等）：工具列「指派」**單選一檔且為多人連結檔** → 開協作式表格（譯者下拉／列範圍／翻譯交期、新增列、刪除列、拆分均分預填），按「儲存並同步」即寫回 LMS 並更新 CAT 段落指派；其餘情況（多選、未連結、單人案）沿用原成員清單視窗，行為不變。
- 譯者下拉同時雙寫 `translator`（顯示名）與 `translatorUserId`（UUID），與 P4 一致。

---

## 6. 驗收方式（白話，預覽階段）

1. 在編輯器或瀏覽器開啟 [`docs/preview-cat-assign/index.html`](preview-cat-assign/index.html)。
2. 對照畫面確認：
   - 指派視窗是否為「角色／人員／列範圍／交期／狀態」的列式表格、可新增列。
   - 「拆分」區塊按下後，是否把建議範圍與人選預填到指派表。
   - 是否有「目前指派現況」檢視區（誰負責哪段、翻譯或審稿、進度）。
   - 檔案清單示意是否把「整檔」與「查無指派（警示）」分開呈現。
3. 確認版面與用語符合期待後，再決定進入 P2 實作。

> 本預覽為純靜態 HTML，不連資料庫、不影響正式系統；可安心點按。

---

## 7. 需要持續注意

- **中大型重構**：橫跨 CAT 介面、後台同步、資料遷移三塊，務必分階段、分批驗收。
- **進行中案件**：P5 遷移時，正在翻譯／審稿的案件不可因換配對方式而瞬間變「未指派」（會重演問題 A／B）。遷移採「先雙寫並存、確認無誤再切換」。
- **權限**：CAT 內指派沿用 `window._tmsCanAssign`（PM 以上）；新表格不得讓譯者改派工。
- **與既有規格相容**：勿破壞 Phase B／B-6／B-7 已驗收行為（prep 步驟、確認狀態五態、顯示層狀態）。
- **CAT 單一來源**：凡動 `cat-tool/`，改完跑 `npm run sync:cat` 並一併提交 `public/cat`。

---

## 8. 開發紀錄

| 日期 | 項目 |
|------|------|
| 2026-06-29 | 調查「整檔＋無法編輯」回報，定位三項根因（§1）與結構性問題（§1.1） |
| 2026-06-29 | 與專案擁有者確認八項決策（§2）；撰寫本規劃文件與 P1 靜態預覽 |
| 2026-06-29 | 實作 P2／P4／P5a：後台同步改寫（不再依賴 `accepted`、UUID dual 解析、失敗報告）、LMS 雙寫 UUID＋過度同步＋失敗 toast、顯示層「整檔／查無指派」區分、既有協作列 UUID 回填；`typecheck` 通過、`sync:cat` 完成。P3（CAT 介面）待確認 §5.1 後實作 |
| 2026-06-29 | 實作 P3（方案 A）：新增 `lms.getCaseCollabForFile`／`lms.updateCaseCollab` 兩個 CAT cloud RPC、CAT 端協作式指派 modal（譯者／列範圍／翻譯交期、拆分均分預填、UUID 雙寫），寫回 LMS `collab_rows` 後即時同步並回報未解析譯者；`typecheck` 通過、`sync:cat` 完成。iframe 互動無法於此環境實測，待團隊版實機驗收 |
