# CAT 第四波主記錄（摘要，可版控）

**狀態標記（2026-04-26）**：第四波 **A（§11）與 B（§3）皆已完成驗收**；**第四波整體已結案**。B 階段最終採「伺服器權威 lease 鎖 + 前端硬擋 + 續租/釋放時序強化 + 型別補齊 + 線上部署驗收」收斂（詳 **§一** B 與 **§二** 複驗）。

關聯主計畫：`cat_工具綜合改版_42ac9451.plan.md` 第 **11** 節（TM 搜尋結果互動與編輯區游標輔助）、第 **3** 節（樂觀鎖 revision／協作誤報）。  
可版控鏡像：[`docs/mirror/cat_工具綜合改版_42ac9451.plan.md`](mirror/cat_工具綜合改版_42ac9451.plan.md)（與本機 `%USERPROFILE%\.cursor\plans\` 同名檔同步維護）。

**第四波子階（主計畫已定案）**

| 子階 | 主計畫節次 | frontmatter todo | 說明 |
|------|------------|------------------|------|
| **A** | §11 | `live-tm-cursor-ux` | **已結案**：`ebb9ee4`、`8f8cea8`、`d326666`、`c783b56`、**`e834bc2`**（整表重繪後補 `runSearchAndFilter`）、**`6f0bc89`**（多選外框可見列鄰接）；詳 **§一點五** |
| **B** | §3 | `collab-false-positive` | **已結案**：由首批「比對正規化 + `catCollabDebug`」起步，後續完成同句段搶編鎖、版本選擇期間阻擋、伺服器權威 lease（acquire/release/續租/釋放）、Supabase migration 與型別補齊、Vercel 部署與實機複驗 |

**原則**：A／B **可並行開發**，**分開 merge、分開驗收**（見主計畫「白話：建議怎麼分階段做」第四波段）。

---

## 一、第四波完成清單（依子階／批次）

### 第四波 A（§11）

- `ebb9ee4`：TM 搜尋分頁單擊改為僅選取、雙擊才套用譯文；搜尋結果顯示 1～N 編號並支援 Ctrl+1～9 套用；Ctrl+K 執行 TM 搜尋後焦點回目前譯文欄尾端；離開譯文欄顯示靜態假游標；Ctrl+0 將原文／CAT／TM 搜尋中的選取文字插入最後譯文游標；快捷鍵 modal 同步更新。
- **驗收修正**（`8f8cea8`）：`Ctrl+0` 與 editor undo 堆疊整合（並同步 `editorUndoEditStart` 避免 debounce 重複推 undo）、譯文欄觸發之 `Ctrl+K` 自動將 `#tmSearchField` 設為譯文、`Ctrl+0` 後雙重 `requestAnimationFrame` 將游標穩定留在插入點後方。**使用者複驗（2026-04-25）**：上述三項皆通過。
- **第二輪驗收發現**（同次回報）：(1) `Ctrl+Y` 重做全檔無效；(2) 篩選下確認後不跳到篩選結果內下一個未確認句段；(3) 篩選下 `Ctrl+↑↓` 無法在可見列間移動；(4) 篩選下多選批次確認後隱藏列全部顯示；(5) 出現 (4) 後再改篩選條件無反應，須先清除篩選才恢復。
- **追加修正**（`d326666`）：(1) `applyEditorRedo` 對 redo 堆疊內已交換 old/new 的 mirror entry 改傳 `applyOneTargetUndo(..., 'undo')`，重做才會套到正確譯文；(2) `getAfterConfirmFocusIndex` 在篩選模式下略過 `display:none` 列；(3) 譯文欄 `Ctrl+↑↓` 以 `while` 跳過不可見鄰列；(4) 批次確認／`confirmOp` undo-redo 路徑在 `renderEditorSegments()` 後補 `runSearchAndFilter()`。**使用者複驗**：(1)～(3) 通過；(4)(5) 於 `d326666` 後仍發生。
- **篩選快取修復**（`c783b56`）：`renderEditorSegments()` 清空 `gridBody` 後立即 `sfRowRenderCache.clear()`，使後續 `runSearchAndFilter()` 能依快照正確設定 `display`，避免舊 `vis` 快取導致應隱藏列全顯與篩選條件變更無效。**使用者回報（`c783b56` 後）**：批次變更狀態後隱藏列仍會全顯，但**改任一篩選條件即可恢復**（與修正前「改條件也無效」不同）。
- **整表重繪後補篩選**（**`e834bc2`**）：凡 `renderEditorSegments()` 後漏接 `runSearchAndFilter()` 之路徑已補齊——右鍵 `ctxBatchUnconfirm`、`ctxLockSegments`、`ctxUnlockSegments`；`applySorting`；`btnApplyRepMode` 全檔套用重複模式；預先翻譯完成後。**使用者複驗（2026-04-25 起）**：第二輪 (4)(5) 通過（篩選條件未變下整表重繪後隱藏列行為與條件變更反應正常）。
- **多選外框視覺**（**`6f0bc89`**）：以 `syncSelectedRowAbutmentTopClass()` 依**可見列**為上一列同選取時加上 `selected-abut-top`，使 [`cat-tool/style.css`](../cat-tool/style.css) 之 `::after` 僅保留單一水平邊線；選取列並隱藏 `.grid-data-row` 底部分隔線色，避免與框線疊加。**使用者複驗**：交界線過粗問題已排除。

### 一點五、A 階段測試期問題／需求／作法與結論（摘要）

本節為測試與除錯之**決策與時間線摘要**；篩選與列快取之程式對照與機制說明見 **§二點一**。

| 類別 | 內容 |
|------|------|
| **遭遇問題（第二輪）** | (1) `Ctrl+Y` 全檔重做無效。(2) 篩選下確認後未跳到篩選結果內下一個未確認句段。(3) 篩選下 `Ctrl+↑↓` 無法只在可見列間移動。(4) 篩選下多選批次確認後隱藏列全顯。(5) 出現 (4) 後改篩選條件無反應，須先清除篩選。**另（驗收期 UX）**：多選句段之選取框在列與列交界呈現雙倍粗線，干擾閱讀。 |
| **衍生／明確需求** | 篩選 spec 未變時，整表重繪後仍須依快照正確隱藏列；篩選條件於 UI 上不可卡死；多選外框在畫面上可見之範圍內呈現單一視覺寬度之邊線。 |
| **嘗試與演進** | **`d326666`**：修正 redo、確認後跳格、`Ctrl+↑↓` 跳過 `display:none` 列，並於批次確認／`confirmOp` 等路徑在 `renderEditorSegments()` 後補 `runSearchAndFilter()` — (1)～(3) 通過；(4)(5) 類仍發生。**`c783b56`**：於 `renderEditorSegments()` 清空 `gridBody` 後即 `sfRowRenderCache.clear()` — (5) 類「改條件也完全無反應」解除；使用者仍見 (4) 於「篩選條件完全不變」時隱藏列全顯，但微調條件即可恢復。**`e834bc2`**：盤點凡 `renderEditorSegments()` 後漏接 `runSearchAndFilter()` 之路徑並補齊（右鍵批次未確認／鎖定／解鎖、`applySorting`、`btnApplyRepMode` 全檔重複模式、預先翻譯完成後等），使 spec 不變時仍重套 `display`。**`6f0bc89`**：原僅以 CSS `.selected-row + .selected-row::after` 去掉內側頂邊，於篩選列 `display:none` 或非連續 Ctrl 多選時 **DOM 不相鄰**而失效；改以 `syncSelectedRowAbutmentTopClass()` 依**可見列順序**加 `selected-abut-top`，並將選取列列表底線設透明，避免與 `::after` 邊框疊加。 |
| **結論** | 第二輪 (4)(5) **分層**：(a) **`sfRowRenderCache` 與重建後之列**不一致，使 `runSearchAndFilter` 誤判無需更新 `display`（`c783b56`）；(b) **整表重繪後未再呼叫 `runSearchAndFilter()`**，在 spec 不變時畫面維持全列可見（`e834bc2`）。兩者皆須處理；與第一波篩選「快照」設計無必然衝突，屬快取一致性與流程漏接（細節見 **§二點一**）。**多選外框**另線：畫面上可見鄰列與 CSS 相鄰兄弟選擇器語意不一致，改以 JS 同步 `selected-abut-top`（**`6f0bc89`**、[`cat-tool/style.css`](../cat-tool/style.css)）。 |

**第四波 A（§11）本里程碑**：篩選 (4)(5) 與多選外框經使用者複驗確認後，**本子階依主計畫 §11 範圍可結案**（例行 smoke 仍見 §二）。**第四波 B（§3）** 另計。

### 第四波 B（§3）

- **首批（`59f161a`）**：[`cat-tool/app.js`](../cat-tool/app.js) 新增 `normalizeCollabTargetPlainTextForCompare`；`applyRemoteCommit` 與 `resolvePendingRemoteConflict` 改以正規化後字串比較，降低 NBSP／零寬字元誤報；`localStorage.catCollabDebug='1'` 可輸出 `[cat-collab]`／`[cat-revision]` 除錯。
- **同句段鎖定演進（2026-04-25，驗收驅動）**
  - `8cb9d10`：先補防回溯與初版同句段編輯鎖。
  - `f01ed11`：鎖改「先佔先贏」（最早 `at` session 為 owner）。
  - `f68642e`：前置硬擋（`mousedown/focus/contextmenu`）+ 版本衝突 modal 期間禁切段。
  - `8f515c1`：收到協作狀態時，若非 owner 仍持有焦點則強制踢出（關閉短暫穿透）。
  - `fc630e2`：DOM 層 `contenteditable=false` 硬鎖非 owner 句段，封鎖事件路徑漏擋。
  - `1937604`：改為伺服器權威 lease（Supabase RPC acquire/release）。
  - `f452f72`：補 Supabase `Database` 型別（解 Vercel TS2345 build fail）。
  - `62aa6be`：改成「成功切到新句段才釋放舊 lease」，移除 blur 立即釋放空窗。
  - `0233129`：續租/釋放時序再強化（TTL/refresh/可見度補續租/寬限釋放），改善同帳號雙分頁不一致。
- **DB / RPC 收斂**
  - migration：[`supabase/migrations/20260425193000_cat_segment_edit_leases.sql`](../supabase/migrations/20260425193000_cat_segment_edit_leases.sql)
  - RPC 接線：[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)
  - Team DB 代理：[`cat-tool/db.js`](../cat-tool/db.js)
  - 前端協作鎖邏輯：[`cat-tool/app.js`](../cat-tool/app.js)
- **B 階段結論**：同句段搶編鎖、版本衝突期間阻擋、同帳號雙分頁/跨帳號一致性與部署驗收均已通過；§3 目標達成，B 結案。

---

## 二、測試與驗收記錄

- **自動化**：各子階交付時執行 `npm run test:cat-sf`、`npm test`（依需要）。
- **手動 smoke（建議）**
  - **A**：TM 單擊不貼上、雙擊貼上（受「雙擊套用譯文」開關約束，見 **§五 5-f**）；**Ctrl+1…9** 一律套用右側 **CAT** 建議（與焦點是否在 TM 搜尋框無關）；**Ctrl+K**：譯文欄反白後搜尋結束游標／選取須與觸發前一致；非譯文欄反白後搜尋結束焦點在譯文**開頭**；原文欄反白時 TM 搜尋欄位為 **原文**、譯文欄為 **譯文**；**Ctrl+F** 由編輯區帶選字時寫入篩選搜尋列；**#tmSearchField** 變更且已有關鍵字時自動重搜；假游標與 Ctrl+0；**句段列狀態色全欄一致**（**5-f D1**）；**新增術語成功或 Enter 後回譯文游標**（**5-f D2**）；快捷鍵 modal 與實際一致。
  - **B**：單人流程不誤觸 `SEGMENT_REVISION_CONFLICT` alert（或根因已修之驗收標準）；協作路徑 (B) 依主計畫 §3 驗收；團隊模式除錯時可設 **`localStorage.catCollabDebug='1'`** 後重載，觀察主控台 `[cat-collab]`／`[cat-revision]` 訊息。
- **複驗紀錄（2026-04-25 起）**
  - **`8f8cea8` 三項**：`Ctrl+0` undo／redo、`Ctrl+K` 譯文範圍、`Ctrl+0` 游標位置 — **通過**。
  - **`d326666` 五項中的四項**：`Ctrl+Y`、篩選下確認後跳格、篩選下 `Ctrl+↑↓`、自動化測試 — **通過**（`d326666` 已跑 `npm run test:cat-sf`、`npm test`）。
  - **第五項（篩選）**：`c783b56`（列快取）+ **`e834bc2`**（整表重繪後漏接路徑補 `runSearchAndFilter`）— 使用者依 §二點一情境複驗，第二輪 **(4)(5) 通過**。
  - **多選外框（`6f0bc89`）**：可見列鄰接與底線疊加修正 — **通過**。
  - **B 階段協作鎖驗收（多輪）**：
    - 初期現象：鎖方向反轉、提示後可二次進入、版本衝突 modal 期間可穿透、同帳號雙分頁 A1/A2 阻擋不一致。
    - 逐輪修正後複驗：同句段搶編（跨帳號 + 同帳號雙分頁）可穩定阻擋，點旁邊再回點不再穿透，版本衝突期間不再可直接進入他人編輯句段。
    - 部署面：Vercel 曾因缺少 Supabase RPC 型別失敗（`TS2345`），補型別後部署 `Ready`。
- **驗收結論**：**第四波 A（§11）**：**已結案**；**第四波 B（§3）**：**已結案**；**第四波整體**：**已結案**。

- **同步**：`cat-tool` 變更經 `npm run sync:cat` 一併提交 `public/cat`。

## 二點一、篩選與列快取（觀察與根因紀錄，2026-04-25）

以下為 **`c783b56` 之後** 使用者回報與程式對照之紀錄；**漏接 `runSearchAndFilter` 之路徑已於 `e834bc2` 補齊**（見完成清單與 **§一點五**），本節保留歸因與機制說明供查。

### 使用者觀察

- 篩選條件**未變**時，多選**確認**或**變更句段狀態**（例如右鍵設為未確認）後，**隱藏列仍會全部顯示**。
- **但**與 `c783b56` 前不同：不必整個「清除篩選」，**只要變更任意篩選條件**（例如微調搜尋字或進階選項），篩選工具即恢復作用。

### `c783b56` 已處理的層級

- 在 [`cat-tool/app.js`](../cat-tool/app.js) 的 `renderEditorSegments()` 於清空 `gridBody` 後呼叫 `sfRowRenderCache.clear()`。
- 目的：全表 DOM 重建後，避免 `runSearchAndFilter()` 內以 `rowCache.vis !== vis` 判斷時，**舊快取與新列**不一致而**跳過** `display` 更新，進而導致「應隱藏列全顯」以及「之後改篩選條件也完全無反應」的卡死（對應第二輪問題 (5) 類行為）。

### 漏接 `runSearchAndFilter`（根因，已修）

- 若干路徑在 **`renderEditorSegments()` 之後未再呼叫 `runSearchAndFilter()`**：重繪後每列預設為可見，若未重套篩選，畫面上會呈現全顯。
- **已鎖定範例**（右鍵選單，約 L10745–L10794）：`ctxBatchUnconfirm`、`ctxLockSegments`、`ctxUnlockSegments` 原先僅 `renderEditorSegments()`。
- **已一併補齊**：`applySorting`、`btnApplyRepMode`（全檔套用重複模式）、預先翻譯完成後；上述皆於 `renderEditorSegments()` 後補 `runSearchAndFilter()`。

### 與第一波篩選設計的關係（是否「當初為加速改的」引發）

| 機制 | 與本現象之關係 |
|------|----------------|
| **快照** `sfFilterSnapshotSegIds`（主計畫：未改 spec 時可見集不變） | **不直接**造成「全表重繪後全顯」；但契約上**重繪後仍須依快照重套** `display`，流程漏接時會暴露問題。 |
| **列快取** `sfRowRenderCache` | **會**與「全表重建」疊加出錯顯／條件變更卡死；`c783b56` 針對此層。 |
| **漏接** `runSearchAndFilter` | 與快照**無必然關係**；屬整表重繪後**未接回篩選**之實作缺口。 |

### 效能疑慮（問答紀錄）

- `sfRowRenderCache.clear()` **僅**發生在整表 `renderEditorSegments()`；一般僅反覆呼叫 `runSearchAndFilter()` 的互動路徑**仍保留**列快取跳過重畫的效益，**不視為**當初篩選反應優化整體失效。

---

## 三、衍生文件盤點與收斂

| 文件 | 處置 |
|------|------|
| `主計畫納入_tm_游標_ad384fe1.plan.md` | 內容已併入主計畫 §11；歷史副本：**[`docs/mirror/主計畫納入_tm_游標_ad384fe1.plan.md`](mirror/主計畫納入_tm_游標_ad384fe1.plan.md)**；本機 `.cursor/plans` 同名檔已移除 |
| `docs/bug-report_seg-write-race.md` | 第四波 B（§3）競態根因、Fix A/B/C/D 與落地狀態已整併至 **§一（B）**、**§二**，文件已清理 |
| `docs/bug-report_ghost-write-case-analysis.md` | 與 B 階段 `segmentRevision` / ghost write 調查結論已整併至 **§一（B）**、**§二**，文件已清理 |
| `docs/CAT第四波主記錄.md`（本檔） | **保留** |

---

## 四、結案判定

1. **第四波 A（§11，`live-tm-cursor-ux`）是否已結案？** **是**（見 **§一** A、**§一點五**）。
2. **第四波 B（§3，`collab-false-positive`）是否已結案？** **是**（見 **§一** B、**§二** B 階段複驗）。
3. **第四波工作（§11 + §3）是否全部結束？** **是**。
4. **主計畫中第四波對應範圍（§11 與 §3）是否皆已完成？** **是**。

---

## 五、第四點五波（主計畫臨時插入，UX 補強）

本節為 **主計畫鏡像** [`docs/mirror/cat_工具綜合改版_42ac9451.plan.md`](mirror/cat_工具綜合改版_42ac9451.plan.md) 於第四波結案後**補記**之 **第 4.5 波**，**不屬**第四波 A（§11）／B（§3）原定驗收範圍，**不影響**上文「第四波整體已結案」之判定。

**本波 5-d 已結案**（**§10.3** 欄位映射＋`matchFlags`＋預覽＋摘要；實作見 **5-d** 小節與 `cat-tool` 匯入 modal）。**5-f**（快捷鍵／TM 列／雙擊開關／列上色／新增術語焦點）驗收規格見 **§五 5-f**（**D1**／**D2** 與 A～C 併列）；**第五波**（主計畫 §6～§7）與本節無關，**未**因本波啟動。

### 5-a（已完成）

| 項目 | 說明 |
|------|------|
| **需求** | 快捷鍵說明 **`Ctrl + 1 - 9`**；全系統 **Esc** 關最上層蓋版；錄製自訂快捷鍵時 **Esc** 中止、重設卸 listener |
| **狀態** | **已完成**並推送（**`437e9b6`**），含 `npm run sync:cat` |
| **程式** | [`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/app.js`](../cat-tool/app.js) |

### 5-b（已完成）：CAT 比對表分頁、術語 footer、新增術語流程

| 項目 | 說明 |
|------|------|
| **CAT 比對結果** | 逾 9 筆時每頁 9 筆、列號 1～9、`Ctrl+1～9` 對應當頁；**`Alt+←/→`** 換頁；表底提示總筆數與頁碼；**`Alt+↑/↓`** 改為跨頁移動選取 |
| **TB 列 footer** | 顯示**區分大小寫**、**精確比對**、灰色白話說明、**建立者／建立時間**；`ActiveTbTerms`／比對列帶入 `matchFlags` 與 `createdBy`／`createdAt` |
| **新增術語** | **原文與譯文皆必填**（備註、勾選框不計）；**Enter** 送出；修正 **Ctrl+Q** 與切換「新增術語」分頁時誤把譯文選字填入**空白原文** |
| **快捷鍵說明** | 固定快捷鍵表新增「CAT 比對結果換頁」**`Alt + ← / →`** |
| **狀態** | **已完成**並推送，含 `npm run sync:cat`（**`4617619`**，`feat(cat): 第四點五波 b …`） |
| **程式** | [`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/index.html`](../cat-tool/index.html)；併 `npm run sync:cat` → [`public/cat/`](../public/cat/) |

### 5-c（已完成）：TB footer 文案與通用確認 UX

| 項目 | 說明 |
|------|------|
| **TB footer 灰字** | 精確比對說明改為兩行（關閉／**開啟**），與「區分大小寫」表列分工；**`9c65514`** |
| **通用確認** | `openCatConfirmModal` 預設不顯示僅「確認」之標題；`#catGenericConfirmModal`／`#agLeaveMutexConfirmModal` 補 `role`／`aria-*`；**`5e3c3cc`** |
| **程式** | 同上 `cat-tool`／`public/cat` |

### 5-d（**已完成**）：重製線上 TB 匯入（第四點五波收尾）

| 項目 | 說明 |
|------|------|
| **主計畫位置** | 第 **10** 節 **§10.3 重製線上 TB 匯入**；todo **`tb-online-import-column-mapping`**（與 **§10.1** Excel 欄位讀取 `matchFlags` 併採同一套欄位代號＋`是/否` 語意，見 `cat-tool/app.js` 匯入 modal） |
| **目標（摘要）** | 與 Excel 匯入相同之**可自選欄位映射**（含**區分大小寫欄、精確比對欄**可選，對應 `matchFlags`）、**預覽映射**首批列、比對屬性解析錯誤時**整批中止＋列號摘要**；`onlineImportConfig` 一併保存上述欄位代號供「更新」帶入 |
| **驗收（摘自主計畫）** | 可映欄並成功匯入；比對屬性儲格不合法有明確摘要；匯出 Excel 欄**是/否**與匯入解析一致；線上與本機 xlsx 共用 `buildTbImportSheetConfigsFromModal` 與寫入 `term.matchFlags` |

#### 5-d.1 來源範圍（本波定案）

- **僅**支援可**匿名讀取**之 **Google 試算表**（例如「知道連結的使用者可檢視」、或已發佈／可透過 **`export?format=csv`** 取得之連結）。
- **本波不納入**：需登入 Google 方得讀取之私有表、**OAuth**、**Microsoft 365**、其它非 Google 線上表單。若未來要支援，另開需求（OAuth／Sheets API 等）。

#### 5-d.2 一網址、一分頁（`gid`）

- Google CSV 匯出依工作表 **`gid`**；**單一匯入 URL 僅對應一個分頁**。
- 同一試算表檔若有多個工作表，請**分開建立多個 TB**，各 TB 使用**含不同 `gid` 的連結**（或各自可匯出的網址）。
- **不屬本波**：以單一「檔案 ID」一次擷取多工作表（通常需 **Google Sheets API** 與授權）。

#### 5-d.3 技術要點（CORS 與代理）

- 瀏覽器自 `docs.google.com` 直接 `fetch` CSV 會受 **CORS** 限制。
- 須由 **同源後端代理**代抓（比照 [`api/cat-openai.js`](../api/cat-openai.js) 之 Serverless 模式；本機 dev 於 [`vite.config.ts`](../vite.config.ts) 加 middleware），將使用者貼上之編輯連結**正規化**為 `…/export?format=csv&gid=…` 後於伺服器端請求。

#### 5-d.4 資料模型（預計；實作時一併 migration／RPC）

- **`sourceType`**：`manual` \| `online`
- **`sourceTypeLocked`**：boolean（與「已有術語列」等規則一併決定 UI 是否仍允許切換性質）
- **`googleSheetUrl`**：使用者貼上之連結（擷取／更新用）
- **`onlineImportConfig`**：JSON，保存欄位映射等設定供「更新」預填

#### 5-d.5 UX（已定案）

- 點「**擷取線上表單**」→ **直接開啟**與 Excel 相同之**匯入設定** modal（**不**選工作表；欄位對應語意與 Excel 同一套，可隨時增減對應欄位）。
- 匯入完成後，術語表**展示方式**與現有術語庫一致；術語庫詳情頁**僅保留**「**更名**」「**更新**（再擷取）」；按鈕列下方以**黑色字**顯示**目前擷取網址**。
- 「**更新**」：重新開啟與首次相同之擷取畫面，**網址與所有設定自動帶入**，可改動後再確認擷取。
- **性質鎖定**：使用者曾進行**匯入檔案／線上擷取／新增術語**任一初次操作後，「離線手動維護」與「擷取線上表單」兩個 radio **反灰鎖定**（含舊資料已有術語列者，與 `sourceTypeLocked` 規則一致）。
- **寫入庫**：`sourceType === 'online'` 之 TB **不得**設為專案**寫入**術語庫；專案掛載 TB 選擇器中該列之**寫入** radio **反灰**，並設 **`title`**：**「此為擷取自線上表單的術語庫，不得自行寫入新內容」**。
- **名稱**：線上來源 TB 之名稱**強制**包含 **`（擷取自線上表單）`** 後綴（為名稱之一部分，全站顯示一致）；更名時仍須保留該後綴（由實作保證）。

#### 5-d.6 擷取語意（整批取代）

- 每次成功「**更新**」視為以遠端 CSV 解析結果**整批取代**該 TB 之 `terms`（再同步）；**非**預設僅合併追加。若產品改為合併策略，須另修本節與 §10.3。

### 5-e 實作時序（參考）

| 日期（約） | Commit | 摘要 |
|------------|--------|------|
| 2026-04-26 | `437e9b6` | 5-a：快捷鍵文案、Esc、錄製 |
| 2026-04-26 | `4617619` | 5-b：CAT 分頁、TB footer 資料與 UI、新增術語、Ctrl+Q |
| 2026-04-26 | `9c65514` | 5-c：TB footer 灰字兩行 |
| 2026-04-26 | `5e3c3cc` | 5-c：通用確認標題與無障礙 |
| 2026-04-28 | `a4e48f5` | 5-f：A1～C1、D1 列色、D2 新增術語回譯文；見 **§五 5-f**（待複驗） |

### 5-f（第四點五波 UX 補強）：快捷鍵／TM 列／雙擊開關／**列狀態色**／**新增術語焦點**

本小節為 **5-f** 之**驗收規格**；`cat-tool` 變更經 `npm run sync:cat` 同步至 [`public/cat/`](../public/cat/)。**複驗**通過後請於 **§5-e 實作時序** 本列補 **commit** 雜湊。

| 代號 | 驗收項目 |
|------|----------|
| **A1** | **Ctrl+F**：焦點不在 `#sfInput`、且視窗內有**非空反白**時，`#sfInput` 以反白文字（`trim()` 後整段取代）帶入並聚焦；空反白僅聚焦。`qaScopeLocksFilterUi` 時維持既有不處理。 |
| **A2** | **Ctrl+K**、反白錨點在**譯文欄**（`.col-target`）：切 TM 分頁、寫入關鍵字、`runTmConcordanceSearch()` 後，譯文格內**選取與 caret 與觸發前同一幾何位置**（非「附近」）；若 DOM 變更導致 `Range` 還原失敗，可於實作時定 fallback 並補記於本節。 |
| **A3** | **Ctrl+K**、**`#tmSearchField`**：譯文欄觸發 → **`target`**；**原文欄**（`.col-source`）觸發 → **`source`**；既非原文亦非譯文格內選取 → **不改**下拉。 |
| **A4** | **Ctrl+1～9**：不論焦點是否在 `#tmSearchInput`、不論是否在 TM 分頁，**一律**呼叫 `applyCatMatchAtIndex`（與 TM concordance 列表捷徑**解耦**）；無 CAT 建議列時維持不動作。 |
| **A5** | **Ctrl+K**、反白在**非譯文欄**（非 `.col-target`）且有搜尋字：觸發搜尋後，焦點至**目前句段譯文編輯區開頭**（非句尾）。 |
| **B1** | **CAT**／**TM 搜尋**兩分頁頂部「雙擊套用譯文」列：**緊密風格一致**（TM 分頁外層不再獨留大 padding）。 |
| **B2** | 「雙擊套用譯文」為**可寫入開關**（建議 `localStorage` 單鍵、兩分頁 checkbox **同步**）；關閉時雙擊與 `applyCatMatchAtIndex`／`applyTmConcordanceAtIndex` 觸發之套用皆**不執行**；**移除**「僅版面預覽／尚未接上」等未接線文案。 |
| **C1** | **`#tmSearchField`** `change`：若 `#tmSearchInput` 已有非空白關鍵字，**自動** `runTmConcordanceSearch()`；無字時不強制搜尋。 |
| **D1** | **句段狀態全列上色**：未確認／已確認／使用者鎖定／系統禁止等狀態下，**該列各欄**（含**重複、相符度、狀態**）背景須與狀態一致，避免與中間編輯區斷層。已知成因包含 **`active-row` 淺藍**與 **`row-bg-confirmed`／inline 綠**不同步、確認路徑僅設 inline 未加 class 等；收斂為**列 class 與狀態同步**、盡量減少分裂來源。**例外（較上層，勿被列底色蓋沒）**：**搜尋／篩選命中**（`mark.search-match` 等）維持可讀高亮；**相符度**依 `applyMatchCellVisual` 門檻色（如 ≥100、≥70）**優先於**列狀態底。 |
| **D2** | **新增術語後回譯文**：在「新增術語」以 **Enter** 或**成功寫入**後，**鍵盤焦點**回到先前譯文格，游標位置以既有 **`catSavedCaret`** 為準（與假游標同源）；實作呼叫 `restoreSavedCaretIntoEditor()`；若還原失敗可 fallback：焦點到主動列譯文格或 `showCatFakeCaretFromSaved()`。 |

**程式預定修改點（實作時對照）**：[`cat-tool/app.js`](../cat-tool/app.js)（Ctrl+F／Ctrl+K／Ctrl+1～9、`setCaretAtEditorStart`、選區還原、TM 欄位 listener、`submitNewTermFromForm` 與**列狀態視覺** helpers）、[`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css)（`active-row` 與 `row-bg-*` 對最右三欄的層級；鎖定列全欄一致）、[`cat-tool/editor-focus-notes.txt`](../cat-tool/editor-focus-notes.txt)。

---

**上一波**：第三波見 [`docs/CAT第三波主記錄.md`](CAT第三波主記錄.md)。
